/* First-party funnel measurement (V29).
 *
 * What is recorded, and nothing else:
 *   - A random visitor id the browser makes for itself (32 hex characters in localStorage). It is never
 *     derived from, or sent with, an email address, an IP address or a device fingerprint.
 *   - Named events from a fixed list (CLIENT_EVENTS), each with at most a page path, a referring host, an
 *     experiment variant and one short label (which button, which step). No search text, research questions,
 *     tickers, names, card details or free text are accepted: anything else in a request is dropped.
 *   - Server events written by the engine itself when something verifiable happens (SERVER_EVENTS): an account
 *     is created, a checkout session is created, Stripe's signed webhook confirms a completed checkout, a renewal
 *     or a cancellation, or a member does something for the first time. A browser cannot send these.
 * Browsers that send Global Privacy Control or Do Not Track send nothing (web/assets/js/funnel.js).
 * Rows are deleted after 13 months; deleting an account removes its user id from its rows (ON DELETE SET NULL).
 *
 * Deduplication: a page or click event counts once per visitor, per day, per label; a "first" event once per
 * member, ever; a webhook event once per Stripe object. The report (funnelReport) counts distinct visitors or
 * members at each stage and never shows a rate whose denominator is zero, nor an experiment winner without
 * enough data. */

export const CLIENT_EVENTS = Object.freeze({
  landing_viewed: "page",          // the landing page was shown
  pricing_viewed: "page",          // the pricing section (landing) or pricing page came into view
  cta_clicked: "click",            // a trial button; label: where it was (hero, nav, pricing, final, ...)
  demo_opened: "click",            // a product example or clip was opened; label: which
  signup_started: "page",          // the sign-up form was shown
  checkout_return_canceled: "page",// back from Stripe without paying (cancel_url)
  onboarding_step: "click",        // a first-run step; label: follow, watchlist, briefing, intelligence, dismiss
  experiment_exposed: "page",      // a visitor saw a variant (variant column)
  research_opened: "first",        // a member opened a company report (first time only)
  intelligence_opened: "first"     // a member opened Intelligence (first time only)
});
export const SERVER_EVENTS = Object.freeze(["signup_completed", "checkout_started", "checkout_completed", "checkout_expired",
  "subscription_renewed", "subscription_canceled", "first_watchlist_item", "first_follow", "first_research_completed", "intelligence_first_used"]);

const VISITOR = /^[a-f0-9]{32}$/;
const LABEL = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const VARIANT = /^[a-z0-9_-]{1,24}:[a-z0-9_-]{1,24}$/;
const PATH = /^\/[A-Za-z0-9._\/-]{0,99}$/;
const HOST = /^[a-z0-9.-]{1,100}$/;

const failure = (status, message) => Object.assign(new Error(message), { status });
const day = (d = new Date()) => d.toISOString().slice(0, 10);

/* A browser's event, checked field by field. Returns the row to store, or throws 400. */
export function cleanClientEvent(input, now = new Date()) {
  const x = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const event = String(x.event || "");
  const kind = Object.hasOwn(CLIENT_EVENTS, event) ? CLIENT_EVENTS[event] : null;
  if (!kind) throw failure(400, "Unknown event");
  const visitor = String(x.visitor || "").toLowerCase();
  if (!VISITOR.test(visitor)) throw failure(400, "Invalid visitor");
  const label = LABEL.test(String(x.label || "")) ? String(x.label) : null;
  const variant = VARIANT.test(String(x.variant || "")) ? String(x.variant) : null;
  if (event === "experiment_exposed" && !variant) throw failure(400, "A variant is required");
  const path = PATH.test(String(x.path || "")) ? String(x.path) : null;
  let referrer = null;
  try { const h = x.referrer ? new URL(String(x.referrer)).hostname.toLowerCase() : ""; referrer = HOST.test(h) ? h : null; } catch { referrer = null; }
  return { event, kind, visitor, label, variant, path, referrer, day: day(now) };
}

/* The key that makes a repeat of the same event a no-op. */
export function dedupeKey({ event, kind, visitor, userId, label, variant, day: d, object }) {
  if (object) return event + ":" + object;
  if (kind === "first") return userId ? "first:" + event + ":" + userId : event + ":" + visitor + ":" + d;
  return event + ":" + (visitor || "user-" + userId) + ":" + d + ":" + (label || "") + ":" + (variant || "");
}

export const INSERT_SQL = `INSERT INTO funnel_events(event,visitor,user_id,label,variant,path,referrer,dedupe_key)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (dedupe_key) DO NOTHING`;

/* Stores one event; returns true when it was new. Never throws: measurement must not break the product. */
export async function recordEvent(run, row) {
  try {
    const key = row.dedupeKey || dedupeKey(row);
    const r = await run(INSERT_SQL, [row.event, row.visitor || null, row.userId || null, row.label || null, row.variant || null, row.path || null, row.referrer || null, key.slice(0, 200)]);
    return (r?.rowCount || 0) > 0;
  } catch (e) {
    if (!/funnel_events/.test(String(e?.message || ""))) console.error("Funnel event not recorded", e?.message || e);
    return false;
  }
}

/* A server event for a member. once: true makes it a first-time-only event. object: a Stripe object id. */
export function serverEvent(run, event, { userId = null, visitor = null, object = null, once = false } = {}) {
  if (!SERVER_EVENTS.includes(event)) return Promise.resolve(false);
  const v = VISITOR.test(String(visitor || "")) ? String(visitor) : null;
  return recordEvent(run, { event, kind: once ? "first" : "server", visitor: v, userId, day: day(), object });
}
/* The member behind a Stripe customer id, for webhook events. */
export async function userForCustomer(run, customer) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customer || ""))) return null;
  try { return (await run("SELECT id FROM users WHERE stripe_customer_id=$1", [customer])).rows[0]?.id || null; } catch { return null; }
}

/* ---------- the report ---------- */

// Below these counts a rate is shown with a warning, and no experiment variant is called a winner.
export const MIN_VISITORS = 200, MIN_CONVERSIONS = 20;

/* Two-proportion z-test (pooled), two-sided p-value. Pure; used for experiment comparisons. */
export function twoProportionP(x1, n1, x2, n2) {
  if (!(n1 > 0 && n2 > 0)) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  // Normal tail by the Abramowitz-Stegun approximation (error < 7.5e-8).
  const t = 1 / (1 + 0.2316419 * z), d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const tail = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * tail);
}
const rate = (num, den) => den > 0 ? num / den : null;

export const REPORT_SQL = `WITH w AS (SELECT * FROM funnel_events WHERE created_at >= now() - make_interval(days => $1))
  SELECT
    count(DISTINCT visitor) FILTER (WHERE event='landing_viewed')::int AS landing,
    count(DISTINCT visitor) FILTER (WHERE event='cta_clicked')::int AS cta,
    count(DISTINCT visitor) FILTER (WHERE event='demo_opened')::int AS demo,
    count(DISTINCT visitor) FILTER (WHERE event='pricing_viewed')::int AS pricing,
    count(DISTINCT visitor) FILTER (WHERE event='signup_started')::int AS signup_started,
    count(DISTINCT user_id) FILTER (WHERE event='signup_completed')::int AS signup_completed,
    count(DISTINCT user_id) FILTER (WHERE event='checkout_started')::int AS checkout_started,
    count(DISTINCT user_id) FILTER (WHERE event='checkout_completed')::int AS paid,
    count(DISTINCT visitor) FILTER (WHERE event='checkout_return_canceled')::int AS checkout_returned,
    count(DISTINCT user_id) FILTER (WHERE event='checkout_expired')::int AS checkout_expired,
    count(DISTINCT user_id) FILTER (WHERE event IN ('first_research_completed','intelligence_first_used','first_watchlist_item','first_follow')
      AND user_id IN (SELECT user_id FROM w WHERE event='checkout_completed'))::int AS activated,
    count(DISTINCT user_id) FILTER (WHERE event='checkout_completed' AND created_at < now() - interval '4 days')::int AS renewal_cohort,
    count(DISTINCT user_id) FILTER (WHERE event='subscription_renewed'
      AND user_id IN (SELECT user_id FROM w WHERE event='checkout_completed' AND created_at < now() - interval '4 days'))::int AS renewed,
    count(DISTINCT user_id) FILTER (WHERE event='subscription_canceled'
      AND user_id IN (SELECT user_id FROM w WHERE event='checkout_completed'))::int AS canceled,
    min(created_at) AS first_event
  FROM w`;

export const VARIANT_SQL = `WITH w AS (SELECT * FROM funnel_events WHERE created_at >= now() - make_interval(days => $1)),
  exposed AS (SELECT DISTINCT ON (visitor) visitor, variant FROM w WHERE event='experiment_exposed' AND variant IS NOT NULL ORDER BY visitor, created_at),
  members AS (SELECT DISTINCT visitor, user_id FROM w WHERE event='signup_completed' AND visitor IS NOT NULL AND user_id IS NOT NULL)
  SELECT e.variant,
    count(DISTINCT e.visitor)::int AS exposed,
    count(DISTINCT c.visitor)::int AS cta,
    count(DISTINCT m.user_id)::int AS signups,
    count(DISTINCT p.user_id)::int AS paid
  FROM exposed e
  LEFT JOIN w c ON c.visitor=e.visitor AND c.event='cta_clicked'
  LEFT JOIN members m ON m.visitor=e.visitor
  LEFT JOIN w p ON p.user_id=m.user_id AND p.event='checkout_completed'
  GROUP BY e.variant ORDER BY e.variant`;

export async function funnelReport(run, { days = 30 } = {}) {
  const d = Math.max(1, Math.min(400, Number(days) || 30));
  const t = (await run(REPORT_SQL, [d])).rows[0] || {};
  const n = k => Number(t[k]) || 0;
  const stages = [
    { key: "landing", label: "Landing visitors", count: n("landing"), unit: "visitors" },
    { key: "cta", label: "Clicked a trial button", count: n("cta"), unit: "visitors", rate: rate(n("cta"), n("landing")), of: "landing" },
    { key: "signup_started", label: "Opened sign-up", count: n("signup_started"), unit: "visitors", rate: rate(n("signup_started"), n("landing")), of: "landing" },
    { key: "signup_completed", label: "Created an account", count: n("signup_completed"), unit: "accounts", rate: rate(n("signup_completed"), n("signup_started")), of: "signup_started" },
    { key: "checkout_started", label: "Started Stripe checkout", count: n("checkout_started"), unit: "accounts", rate: rate(n("checkout_started"), n("signup_completed")), of: "signup_completed" },
    { key: "paid", label: "Paid (verified by Stripe webhook)", count: n("paid"), unit: "accounts", rate: rate(n("paid"), n("checkout_started")), of: "checkout_started" },
    { key: "activated", label: "Reached first value after paying", count: n("activated"), unit: "accounts", rate: rate(n("activated"), n("paid")), of: "paid" },
    { key: "renewed", label: "Renewed at $39 after the trial", count: n("renewed"), unit: "accounts", rate: rate(n("renewed"), n("renewal_cohort")), of: "paid more than 4 days ago (" + n("renewal_cohort") + ")" },
    { key: "canceled", label: "Cancelled", count: n("canceled"), unit: "accounts", rate: rate(n("canceled"), n("paid")), of: "paid" }
  ];
  const variants = (await run(VARIANT_SQL, [d])).rows.map(r => ({ variant: r.variant, exposed: Number(r.exposed) || 0, cta: Number(r.cta) || 0, signups: Number(r.signups) || 0, paid: Number(r.paid) || 0 }));
  const experiments = {};
  for (const v of variants) {
    const [name, arm] = v.variant.split(":");
    (experiments[name] ||= []).push({ arm, ...v, ctaRate: rate(v.cta, v.exposed), paidRate: rate(v.paid, v.exposed) });
  }
  const verdicts = Object.entries(experiments).map(([name, arms]) => {
    const enough = arms.length === 2 && arms.every(a => a.exposed >= MIN_VISITORS) && arms.reduce((s, a) => s + a.paid, 0) >= MIN_CONVERSIONS;
    const p = arms.length === 2 ? twoProportionP(arms[0].paid, arms[0].exposed, arms[1].paid, arms[1].exposed) : null;
    const leader = arms.length === 2 && arms[0].paidRate != null && arms[1].paidRate != null ? (arms[0].paidRate >= arms[1].paidRate ? arms[0] : arms[1]) : null;
    return { name, arms, pValue: p, decision: !enough ? "Not enough data: keep running (needs " + MIN_VISITORS + " visitors per arm and " + MIN_CONVERSIONS + " paid conversions)"
      : p != null && p < 0.05 ? "Arm " + leader.arm + " converts to paid better (p = " + p.toFixed(3) + ")" : "No significant difference in paid conversion yet (p = " + (p == null ? "n/a" : p.toFixed(3)) + ")" };
  });
  const sufficient = n("landing") >= MIN_VISITORS && n("paid") >= MIN_CONVERSIONS;
  return { days: d, measuredSince: t.first_event || null, stages, experiments: verdicts, sufficient,
    note: sufficient ? "Rates are measured, not estimated." : "Too little data has been collected for these rates to mean much yet. They are shown as measured; no benchmark is implied.",
    method: "Distinct visitors (a random first-party id) for page and click stages, distinct accounts from the engine's own records and Stripe's signed webhooks for account and payment stages. Visitors with Global Privacy Control or Do Not Track are not measured." };
}
