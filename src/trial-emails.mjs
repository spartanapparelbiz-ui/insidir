/* The trial's own emails, on top of the billing notices (src/billing-notices.mjs):
 *
 *   trial_day1    about an hour after the trial starts: the three things to set up (watchlist, people, alerts)
 *   trial_day5    five days in: the week's biggest open-market insider buys and sells at the member's watchlist
 *                 companies and followed people, each with its SEC Form 4 link (or, with an empty watchlist, the
 *                 week's biggest buys anywhere and a nudge to add companies)
 *   trial_reminder six days in, 24 hours before the $39 charge (billing-notices.mjs trialReminder): always sent
 *
 * Day 1 and day 5 go only to trials of six days or more (current_period_end - trial_started_at), so trials that
 * started on the old 3-day offer get exactly the mail they were getting. They are optional mail (category
 * "digest"): an address unsubscribed at the provider does not get them. The charge reminder is a billing notice
 * and is sent whatever the member's email preferences. Each is queued once per subscription (dedupe key), so the
 * hourly worker can run any number of times. */
import { enqueueEmail, renderEmail } from "./email.mjs";
import { emailSettings } from "./config.mjs";

const usdCompact = v => {
  const n = Math.abs(Number(v) || 0);
  return n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
};
const titleCase = s => String(s || "").toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const footer = site => [
  `You get this because you started an Insidir trial. It is one of two trial emails (day 1 and day 5); a reminder 24 hours before any charge is always sent. Manage alert emails in Alerts: ${site}/alerts.html`,
  `Manage or cancel your subscription: ${site}/billing.html`
];

// Trials started on the 7-day offer, past the given point and still running. $1/$2 bound the window, in hours since
// the trial started; a run that is late (the worker was down) still sends while the window is open.
const DUE_SQL = `SELECT u.id,u.email,u.stripe_subscription_id,u.trial_started_at,u.current_period_end FROM users u
  WHERE u.subscription_status='trialing' AND NOT u.cancel_at_period_end AND u.stripe_subscription_id IS NOT NULL
    AND u.trial_started_at IS NOT NULL AND u.current_period_end > now()
    AND u.current_period_end - u.trial_started_at >= interval '6 days'
    AND now() - u.trial_started_at >= make_interval(hours => $1) AND now() - u.trial_started_at < make_interval(hours => $2)
  ORDER BY u.trial_started_at LIMIT $3`;

export function dayOneEmail({ site }) {
  return {
    subject: "Your Insidir trial: three things to set up today",
    heading: "Set up Insidir in five minutes",
    paragraphs: [
      "Insidir watches every SEC Form 4 so you don't have to. It works best once it knows what you care about. Three things to do today:",
      `1. Add your watchlist. Paste a list of tickers (AAPL, NVDA, JPM) on the Watchlist page: ${site}/watchlist.html`,
      `2. Follow the people who matter. Open any CEO, CFO or director and choose Follow; their next Form 4 reaches you wherever they file: ${site}/people.html`,
      `3. Turn on alerts. Pick immediate or a daily digest in Alerts, so a new insider buy at a company you watch reaches you within minutes: ${site}/alerts.html`,
      "On day 5 we'll send you the week's biggest insider buys and sells at the companies you added, each with a link to its SEC filing."
    ],
    action: { label: "Open your watchlist", url: site + "/watchlist.html" }
  };
}

/* The week's open-market trades (codes P and S, non-derivative) at the member's watchlist companies and followed
 * people, largest first, one row per trade (a joint filing reported by several owners counts once). */
const MOVES_SQL = `WITH mine AS (
    SELECT DISTINCT ON (t.accession, t.transaction_date, t.transaction_code, t.shares, t.price_per_share)
      t.ticker, t.owner_name, t.transaction_code, t.transaction_date, t.shares, t.price_per_share, t.estimated_value, t.source_url,
      f.issuer_name, f.rule_10b5_1
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE NOT t.derivative AND t.transaction_code IN ('P','S') AND t.estimated_value IS NOT NULL
      AND t.transaction_date >= (now() - interval '7 days')::date
      AND f.validation_status IS DISTINCT FROM 'flagged'
      AND ($1::uuid IS NULL
        OR t.ticker IN (SELECT ticker FROM watchlist WHERE user_id=$1)
        OR t.owner_cik IN (SELECT owner_cik FROM followed_people WHERE user_id=$1))
      AND ($1::uuid IS NOT NULL OR t.transaction_code='P')
    ORDER BY t.accession, t.transaction_date, t.transaction_code, t.shares, t.price_per_share)
  SELECT * FROM mine ORDER BY estimated_value DESC LIMIT $2`;

export async function weekMoves(query, userId, { limit = 5 } = {}) {
  return (await query(MOVES_SQL, [userId, limit])).rows;
}

const moveLine = m => {
  const verb = m.transaction_code === "P" ? "bought" : "sold";
  const plan = m.transaction_code === "S" && m.rule_10b5_1 ? " (pre-scheduled 10b5-1 plan)" : "";
  return `${titleCase(m.owner_name)} ${verb} ${usdCompact(m.estimated_value)} of ${m.ticker || titleCase(m.issuer_name)}${plan} on ${String(m.transaction_date instanceof Date ? m.transaction_date.toISOString() : m.transaction_date).slice(0, 10)}. Filing: ${m.source_url}`;
};

export function dayFiveEmail({ site, moves, watching }) {
  const any = moves.length > 0;
  return {
    subject: any ? (watching ? "This week's insider moves at the companies you watch" : "This week's biggest insider buys") : "Your Insidir week: no insider trades at your companies yet",
    heading: watching ? "The best insider moves this week, for your watchlist" : "This week's biggest insider buys",
    paragraphs: [
      ...(watching
        ? [any ? "The largest open-market insider buys and sells this week at the companies on your watchlist and the people you follow. Each line links to the SEC Form 4 it comes from."
          : "No insider at the companies on your watchlist or the people you follow bought or sold on the open market this week. Quiet weeks are normal: insiders trade in windows after earnings. Add a few more companies to widen the net."]
        : ["Your watchlist is empty, so here are the largest open-market insider buys anywhere this week. Add the companies you care about and this email, and your alerts, become about them."]),
      ...moves.map(moveLine),
      "Two days left in your trial. Open-market buys (code P) are the trades insiders choose to make with their own money; sales are often routine or pre-scheduled.",
      "Research, not investment advice."
    ],
    action: watching ? { label: "Open your dashboard", url: site + "/dashboard.html" } : { label: "Add companies to your watchlist", url: site + "/watchlist.html" }
  };
}

async function queueOne(query, user, kind, message, site) {
  const { text, html } = renderEmail({ ...message, footer: footer(site) });
  return enqueueEmail(query, { userId: user.id, to: user.email, category: "digest", kind, dedupeKey: `trial:${kind}:${user.stripe_subscription_id}`,
    subject: message.subject, text, html });
}

/* The trial worker (hourly): day 1 from one hour in, day 5 from five days in; each window stays open for most of a
 * day so a late run still sends, and the dedupe key makes a second run a no-op. */
export async function queueTrialEmails(query, { env = process.env, limit = 200 } = {}) {
  const site = emailSettings(env).publicUrl;
  const out = { day1: 0, day5: 0 };
  for (const user of (await query(DUE_SQL, [1, 24, limit])).rows)
    if ((await queueOne(query, user, "trial_day1", dayOneEmail({ site }), site)).queued) out.day1++;
  for (const user of (await query(DUE_SQL, [120, 140, limit])).rows) {
    const watching = (await query("SELECT (SELECT count(*) FROM watchlist WHERE user_id=$1)+(SELECT count(*) FROM followed_people WHERE user_id=$1) AS n", [user.id])).rows[0];
    const isWatching = Number(watching?.n) > 0;
    const moves = await weekMoves(query, isWatching ? user.id : null);
    if ((await queueOne(query, user, "trial_day5", dayFiveEmail({ site, moves, watching: isWatching }), site)).queued) out.day5++;
  }
  return out;
}
