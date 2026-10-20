/* Alerts: factual notifications about research events for the companies a member watches and the people they follow.
 *
 *   fanOut()           new research events -> notifications rows, one per member and event (UNIQUE: a worker run twice,
 *                      or two instances, add each once). Only active events filed in the last 14 days and after the
 *                      member started watching (less a day); disclosure baselines (filings found on a company's first
 *                      read) never alert. Matching uses the watchlist and followed people only, never holdings.
 *   sendImmediate()    members with email_alerts='immediate': one email per member per run listing their new alerts
 *   sendDigests()      members with email_alerts='daily': one email a day at their digest hour, if anything happened
 *                      Both claim the rows they mail inside one transaction (FOR UPDATE SKIP LOCKED) together with the
 *                      outbox insert, so a notification is put in exactly one email. Mail goes only to confirmed
 *                      addresses of members with access, never to suppressed addresses; delivery, retries and bounces
 *                      are the outbox's job (src/email.mjs).
 *
 * Consent: email alerts are off until the member turns them on and agrees to the words in ALERT_CONSENT_TEXT; every
 * change is recorded (email_consents). Every alert email carries a one-click unsubscribe link (RFC 8058) signed with
 * INSIDIR_APP_SECRET; without that secret alert emails are not sent. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { enqueueEmail, renderEmail, isSuppressed } from "./email.mjs";
import { emailSettings } from "./config.mjs";
import { emailDigest, requestAddress } from "./security-events.mjs";
import { hasAccess } from "./paywall.mjs";
import { eventSummary } from "./research-events.mjs";
import { eventHeadline } from "./plain-language.mjs";

export const EVENT_TYPES = Object.freeze(["insider_purchase", "insider_sale", "multi_insider_purchase", "form4_amendment", "company_disclosure"]);
export const EMAIL_MODES = Object.freeze(["off", "immediate", "daily"]);
export const ALERT_CONSENT_VERSION = "2026-10-19";
export const ALERT_CONSENT_TEXT = "Email me factual alerts about new public filings for the companies on my watchlist and the people I follow, at the frequency I chose. I can turn them off at any time from Alerts or with the unsubscribe link in every alert email. Alerts describe public records; they are not investment advice or recommendations.";
const MAX_PER_EMAIL = 25;
const fail = (status, message) => Object.assign(new Error(message), { status });

/* ---------- signed unsubscribe links ---------- */
const secretOf = env => { const s = String(env.INSIDIR_APP_SECRET || ""); return s.length >= 32 ? s : null; };
const sign = (secret, userId) => createHmac("sha256", secret).update("unsubscribe-alerts:" + userId).digest("base64url");
export function unsubscribeToken(userId, env = process.env) {
  const secret = secretOf(env);
  return secret ? userId + "." + sign(secret, userId) : null;
}
export function verifyUnsubscribeToken(token, env = process.env) {
  const secret = secretOf(env);
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(String(token || ""));
  if (!secret || !m) return null;
  const a = Buffer.from(sign(secret, m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}

/* ---------- fan-out ---------- */
const PREFS_ALLOW = `COALESCE((SELECT p.in_app AND $2=ANY(p.event_types) FROM notification_preferences p WHERE p.user_id=x.user_id),TRUE)`;
/* Autopilot (sql/021_autopilot.sql): each follow has an alert mode and can be paused. "Important" is a fixed rule
   on the event as filed, so it is the same for every member and never decided by a model. */
export const IMPORTANT_SALE_USD = 1_000_000;
export function isImportant(event) {
  const t = event?.event_type;
  if (t === "insider_purchase" || t === "multi_insider_purchase" || t === "company_disclosure") return true;
  return t === "insider_sale" && Number(event?.facts?.totalValue) >= IMPORTANT_SALE_USD;
}
/* When a batched alert becomes visible: the next 13:00 UTC (daily) or the next Monday 13:00 UTC (weekly). */
const AVAILABLE_AT = `CASE x.delivery
    WHEN 'daily' THEN date_trunc('day',now())+interval '13 hours'+CASE WHEN now()>=date_trunc('day',now())+interval '13 hours' THEN interval '1 day' ELSE interval '0' END
    WHEN 'weekly' THEN date_trunc('week',now())+interval '13 hours'+CASE WHEN now()>=date_trunc('week',now())+interval '13 hours' THEN interval '7 days' ELSE interval '0' END
    ELSE now() END`;
const MATCH = `INSERT INTO notifications(user_id,event_id,reason,delivery,available_at)
  SELECT x.user_id,$1,x.reason,x.delivery,${AVAILABLE_AT} FROM (
    SELECT DISTINCT ON (user_id) user_id,reason,delivery FROM (
      SELECT m.*,CASE WHEN m.mode IN ('daily','weekly') THEN m.mode ELSE 'immediate' END AS delivery FROM (
        SELECT w.user_id,'watchlist' AS reason,w.created_at,w.alert_mode AS mode FROM watchlist w WHERE w.ticker=$3 AND $3 IS NOT NULL AND w.paused_at IS NULL
        UNION ALL
        SELECT f.user_id,'followed_person',f.created_at,f.alert_mode FROM sec_event_people rp JOIN followed_people f ON LTRIM(f.owner_cik,'0')=LTRIM(rp.owner_cik,'0')
          WHERE rp.event_id=$1 AND f.paused_at IS NULL
      ) m WHERE m.created_at<=$4::timestamptz+interval '1 day' AND m.mode<>'off' AND (m.mode<>'important' OR $5::boolean)
    ) d ORDER BY user_id,(delivery='immediate') DESC,(delivery='daily') DESC,reason DESC) x
  WHERE ${PREFS_ALLOW}
  ON CONFLICT (user_id,event_id) DO NOTHING`;

// maxAgeDays: an event about a filing older than this is history (the coverage backfill imports such filings
// today) and never becomes an alert.
export async function fanOut({ query, limit = 500, maxAgeDays = 3 }) {
  const cursor = (await query("SELECT last_key FROM research_cursors WHERE name='notifications'")).rows[0];
  // First run: start from now, so a deployment does not alert on the whole history.
  if (!cursor) {
    const top = (await query("SELECT COALESCE(max(id),0) AS id FROM sec_events")).rows[0].id;
    await query("INSERT INTO research_cursors(name,position,last_key) VALUES('notifications',now(),$1) ON CONFLICT (name) DO NOTHING", [String(top)]);
    return { events: 0, notifications: 0, started: true };
  }
  const events = (await query(`SELECT id,event_type,status,ticker,filing_date,facts FROM sec_events WHERE id>$1::bigint ORDER BY id LIMIT $2`, [cursor.last_key || "0", limit])).rows;
  let created = 0;
  for (const e of events) {
    const stale = !e.filing_date || Date.now() - new Date(e.filing_date).getTime() > maxAgeDays * 86400000;
    if (e.status !== "active" || stale || e.facts?.baseline === true) continue;
    created += (await query(MATCH, [e.id, e.event_type, e.ticker, e.filing_date, isImportant(e)])).rowCount || 0;
  }
  if (events.length) await query("UPDATE research_cursors SET last_key=$1,position=now(),updated_at=now() WHERE name='notifications'", [String(events.at(-1).id)]);
  return { events: events.length, notifications: created };
}

/* ---------- email ---------- */
async function withTransaction(connect, fn) {
  const client = await connect();
  try { await client.query("BEGIN"); const r = await fn((sql, p) => client.query(sql, p)); await client.query("COMMIT"); return r; }
  catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

function alertEmail(user, events, { env, digest }) {
  const settings = emailSettings(env), site = settings.publicUrl;
  const unsubscribe = `${site}/v1/email/unsubscribe?t=${encodeURIComponent(unsubscribeToken(user.id, env))}`;
  const lines = events.slice(0, MAX_PER_EMAIL).map(e => {
    const source = e.source_urls?.[0] ? ` Source: ${e.source_urls[0]}` : "";
    return `• ${eventHeadline(e)}. ${eventSummary(e)}${source}`;
  });
  const more = events.length > MAX_PER_EMAIL ? [`And ${events.length - MAX_PER_EMAIL} more in Alerts.`] : [];
  const { text, html } = renderEmail({
    heading: digest ? "Your daily Insidir alerts" : events.length === 1 ? "New filing for your watchlist" : `${events.length} new filings for your watchlist`,
    paragraphs: [...lines, ...more, "Each line restates a public SEC record as filed. Trade dates and filing dates differ, and the import may be delayed or incomplete. Read the original filing before relying on it. This is not investment advice."],
    action: { label: "Open Alerts", url: site + "/alerts.html" },
    footer: [`You get these because you turned on ${digest ? "daily" : "immediate"} alert emails. Change or stop them in Alerts, or unsubscribe in one click: ${unsubscribe}`,
      ...(String(env.INSIDIR_POSTAL_ADDRESS || "").trim() ? ["Aethric LLC · " + String(env.INSIDIR_POSTAL_ADDRESS).trim().slice(0, 200)] : [])]
  });
  return { text, html, headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

const CANDIDATES = `SELECT n.id,n.user_id,u.email,u.email_verified_at,u.subscription_status,u.current_period_end
  FROM notifications n JOIN users u ON u.id=n.user_id JOIN notification_preferences p ON p.user_id=n.user_id
  WHERE n.emailed_at IS NULL AND p.email_alerts=$1 AND n.available_at<=now() AND n.available_at>now()-interval '3 days'
    AND ($1='daily' OR n.delivery='immediate') %EXTRA%
  ORDER BY n.user_id,n.id LIMIT $2 FOR UPDATE OF n SKIP LOCKED`;

async function sendFor(mode, { query, connect, env, limit, extra = "", params = [] }) {
  const out = { members: 0, emails: 0, notifications: 0, skipped: 0 };
  if (!unsubscribeToken("00000000-0000-0000-0000-000000000000", env)) return { ...out, skippedReason: "INSIDIR_APP_SECRET not set: alert emails need signed unsubscribe links" };
  return withTransaction(connect, async run => {
    const rows = (await run(CANDIDATES.replace("%EXTRA%", extra), [mode, limit, ...params])).rows;
    const byUser = new Map();
    for (const r of rows) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user: r, ids: [] }); byUser.get(r.user_id).ids.push(r.id); }
    const today = new Date().toISOString().slice(0, 10);
    for (const { user, ids } of byUser.values()) {
      out.members++;
      const status = !user.email_verified_at ? "skipped_unverified" : !hasAccess(user, env) ? "skipped_no_access" : await isSuppressed(run, user.email, "alert") ? "skipped_suppressed" : "queued";
      if (status === "queued") {
        const events = (await run(`SELECT e.* FROM notifications n JOIN sec_events e ON e.id=n.event_id WHERE n.id=ANY($1::bigint[]) ORDER BY e.filing_date DESC,e.id DESC`, [ids])).rows;
        const mail = alertEmail({ id: user.user_id }, events, { env, digest: mode === "daily" });
        await enqueueEmail(run, { userId: user.user_id, to: user.email, category: mode === "daily" ? "digest" : "alert", kind: mode === "daily" ? "daily_digest" : "alert",
          dedupeKey: mode === "daily" ? `digest:${user.user_id}:${today}` : `alert:${user.user_id}:${ids[0]}-${ids.at(-1)}:${ids.length}`,
          subject: mode === "daily" ? `Insidir daily alerts: ${events.length} new filing${events.length > 1 ? "s" : ""}` : events.length === 1 ? `Insidir alert: ${events[0].ticker || events[0].issuer_name || "new filing"}` : `Insidir alerts: ${events.length} new filings`,
          text: mail.text, html: mail.html, headers: mail.headers });
        out.emails++; out.notifications += ids.length;
      } else out.skipped += ids.length;
      await run("UPDATE notifications SET emailed_at=now(),email_status=$2 WHERE id=ANY($1::bigint[])", [ids, status]);
    }
    return out;
  });
}

export const sendImmediate = ({ query, connect, env = process.env, limit = 500 }) => sendFor("immediate", { query, connect, env, limit });
export const sendDigests = ({ query, connect, env = process.env, limit = 2000, hour = new Date().getUTCHours() }) =>
  sendFor("daily", { query, connect, env, limit, extra: "AND p.digest_hour_utc=$3", params: [hour] });

/* ---------- preferences, consent, unsubscribe ---------- */
export async function getPreferences(query, userId, env = process.env) {
  const row = (await query("SELECT in_app,email_alerts,event_types,digest_hour_utc,consent_version,consented_at,unsubscribed_at,updated_at FROM notification_preferences WHERE user_id=$1", [userId])).rows[0];
  const user = (await query("SELECT email_verified_at FROM users WHERE id=$1", [userId])).rows[0];
  const settings = emailSettings(env);
  return {
    inApp: row?.in_app ?? true, emailAlerts: row?.email_alerts ?? "off", eventTypes: row?.event_types ?? [...EVENT_TYPES], digestHourUtc: row?.digest_hour_utc ?? 13,
    consentedAt: row?.consented_at ?? null, unsubscribedAt: row?.unsubscribed_at ?? null,
    emailVerified: !!user?.email_verified_at, emailAvailable: settings.enabled && !!unsubscribeToken("00000000-0000-0000-0000-000000000000", env),
    consent: { version: ALERT_CONSENT_VERSION, text: ALERT_CONSENT_TEXT }, eventTypesAvailable: EVENT_TYPES, modes: EMAIL_MODES
  };
}

async function recordConsent(query, { userId, email, action, setting, req = null, withText = false }) {
  await query("INSERT INTO email_consents(user_id,recipient_hash,action,setting,consent_version,consent_text,ip,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [userId, emailDigest(email), action, setting, withText ? ALERT_CONSENT_VERSION : null, withText ? ALERT_CONSENT_TEXT : null, requestAddress(req), String(req?.headers?.["user-agent"] || "").slice(0, 300) || null]);
}

export async function savePreferences(query, user, input, { env = process.env, req = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "Invalid preferences");
  const current = await getPreferences(query, user.id, env);
  const emailAlerts = input.emailAlerts ?? current.emailAlerts;
  if (!EMAIL_MODES.includes(emailAlerts)) throw fail(400, "emailAlerts must be off, immediate or daily");
  const eventTypes = input.eventTypes ?? current.eventTypes;
  if (!Array.isArray(eventTypes) || eventTypes.some(t => !EVENT_TYPES.includes(t))) throw fail(400, "Unknown event type");
  const inApp = input.inApp ?? current.inApp;
  if (typeof inApp !== "boolean") throw fail(400, "inApp must be true or false");
  const hour = input.digestHourUtc ?? current.digestHourUtc;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw fail(400, "digestHourUtc must be 0-23");
  const turningOn = emailAlerts !== "off" && current.emailAlerts === "off";
  if (emailAlerts !== "off") {
    if (!current.emailAvailable) throw fail(503, "Alert emails are not available yet.");
    if (!current.emailVerified) throw fail(403, "Confirm your email address before turning on alert emails.");
    if (turningOn && (input.consent !== true || input.consentVersion !== ALERT_CONSENT_VERSION)) throw fail(400, "Tick the box to agree to receive alert emails.");
  }
  await query(`INSERT INTO notification_preferences(user_id,in_app,email_alerts,event_types,digest_hour_utc,consent_version,consented_at,unsubscribed_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (user_id) DO UPDATE SET in_app=EXCLUDED.in_app,email_alerts=EXCLUDED.email_alerts,event_types=EXCLUDED.event_types,digest_hour_utc=EXCLUDED.digest_hour_utc,
      consent_version=COALESCE(EXCLUDED.consent_version,notification_preferences.consent_version),consented_at=COALESCE(EXCLUDED.consented_at,notification_preferences.consented_at),
      unsubscribed_at=EXCLUDED.unsubscribed_at,updated_at=now()`,
    [user.id, inApp, emailAlerts, eventTypes, hour, turningOn ? ALERT_CONSENT_VERSION : null, turningOn ? new Date() : null, emailAlerts === "off" && current.emailAlerts !== "off" ? new Date() : current.unsubscribedAt]);
  if (emailAlerts !== current.emailAlerts)
    await recordConsent(query, { userId: user.id, email: user.email, action: turningOn ? "opt_in" : emailAlerts === "off" ? "opt_out" : "change", setting: emailAlerts, req, withText: turningOn });
  return getPreferences(query, user.id, env);
}

export async function unsubscribe(query, token, { env = process.env, req = null, oneClick = false } = {}) {
  const userId = verifyUnsubscribeToken(token, env);
  if (!userId) return null;
  const user = (await query("SELECT id,email FROM users WHERE id=$1", [userId])).rows[0];
  if (!user) return { done: true };
  const r = await query(`INSERT INTO notification_preferences(user_id,email_alerts,unsubscribed_at) VALUES($1,'off',now())
    ON CONFLICT (user_id) DO UPDATE SET email_alerts='off',unsubscribed_at=now(),updated_at=now() WHERE notification_preferences.email_alerts<>'off' RETURNING user_id`, [userId]);
  if (r.rowCount) await recordConsent(query, { userId, email: user.email, action: oneClick ? "unsubscribe_one_click" : "unsubscribe_link", setting: "off", req });
  // Anything optional already queued for this member is not sent.
  await query("UPDATE email_outbox SET status='cancelled',to_email=NULL,text_body=NULL,html_body=NULL WHERE user_id=$1 AND status='queued' AND category IN ('alert','digest')", [userId]);
  return { done: true };
}

/* ---------- reading ---------- */
export async function listNotifications(query, userId, { limit = 50, before = null, unread = false } = {}) {
  const rows = (await query(`SELECT n.id,n.reason,n.delivery,n.created_at,n.read_at,e.id AS event_id,e.event_type,e.status,e.ticker,e.issuer_name,e.owner_cik,e.owner_name,e.transaction_date,e.transaction_date_end,
      e.filing_date,e.ingested_at,e.accessions,e.source_urls,e.facts,e.superseded_by
    FROM notifications n JOIN sec_events e ON e.id=n.event_id
    WHERE n.user_id=$1 AND n.available_at<=now() AND ($2::bigint IS NULL OR n.id<$2) AND (NOT $3::boolean OR n.read_at IS NULL)
    ORDER BY n.id DESC LIMIT $4`, [userId, before, unread, Math.min(100, Math.max(1, limit))])).rows;
  const unreadCount = (await query("SELECT count(*)::integer AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL AND available_at<=now()", [userId])).rows[0].n;
  return { items: rows.map(r => ({ id: String(r.id), reason: r.reason, delivery: r.delivery, createdAt: r.created_at, readAt: r.read_at, event: { id: String(r.event_id), type: r.event_type, status: r.status,
    supersededBy: r.superseded_by, ticker: r.ticker, issuerName: r.issuer_name, transactionDate: r.transaction_date, transactionDateEnd: r.transaction_date_end,
    filingDate: r.filing_date, retrievedAt: r.ingested_at, accessions: r.accessions, sourceUrls: r.source_urls, headline: eventHeadline(r), summary: eventSummary({ ...r, id: r.event_id }) } })),
    unread: unreadCount, next: rows.length ? String(rows.at(-1).id) : null };
}
export async function markRead(query, userId, { ids = null, all = false } = {}) {
  if (all) return { marked: (await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND available_at<=now()", [userId])).rowCount };
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(i => !/^\d{1,18}$/.test(String(i)))) throw fail(400, "ids must be 1-200 notification ids");
  return { marked: (await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=ANY($2::bigint[]) AND read_at IS NULL", [userId, ids.map(String)])).rowCount };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/* The page behind an unsubscribe link: GET asks for one confirming click (link scanners never unsubscribe anyone);
 * mail clients' one-click POST (RFC 8058) needs none. */
export function unsubscribePage(state, token = "") {
  const body = state === "confirm"
    ? `<h1>Stop alert emails?</h1><p class="mk-lede">This turns off Insidir alert emails for your account. Alerts stay in the app, and subscription notices (receipts, renewals, cancellations) still reach you.</p>
<form method="post" action="/v1/email/unsubscribe?t=${encodeURIComponent(token)}"><button class="v9-btn v9-btn--ink" type="submit">Unsubscribe from alert emails</button></form>`
    : state === "done"
      ? `<h1>You're unsubscribed.</h1><p class="mk-lede">Insidir will not send you alert emails. You can turn them back on at any time from Alerts in your account.</p><p><a class="v9-btn v12-outline-button" href="/alerts.html">Open Alerts</a></p>`
      : `<h1>This link is not valid.</h1><p class="mk-lede">It may be incomplete. Turn alert emails off from Alerts in your account, or email hello@aethric.llc.</p><p><a class="v9-btn v12-outline-button" href="/alerts.html">Open Alerts</a></p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Alert emails — insidir.</title><link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/v13-halftone.css?v=10"><link rel="stylesheet" href="/assets/css/v13-static.css?v=2"></head>
<body class="v3-static v6-static v13"><main id="Content" class="mk-shell" style="padding:72px 16px;max-width:640px;margin:0 auto">
<p class="mk-eyebrow">Insidir / Email</p>${body}<p style="margin-top:32px"><a href="/">insidir.</a> · <a href="/privacy.html">Privacy</a></p></main></body></html>`;
}
