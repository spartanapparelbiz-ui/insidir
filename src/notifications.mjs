/* Alerts: factual notifications about research events for the companies a member watches and the people they follow.
 *
 *   fanOut()           new research events -> notifications rows, one per member and event (UNIQUE: a worker run twice,
 *                      or two instances, add each once). Only active events filed in the last 14 days and after the
 *                      member started watching (less a day); disclosure baselines (filings found on a company's first
 *                      read) never alert. Matching uses the watchlist and followed people only, never holdings.
 *
 * Alerts reach members in the app's inbox and as device notifications. Insidir sends no email: alert emails and daily
 * digests are gone, email_alerts is always 'off', and asking for anything else is refused. The signed unsubscribe link
 * still works for anyone holding an alert email sent before, and only ever turns things off. */
import { WORDMARK } from "./site-ui.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { emailDigest, requestAddress } from "./security-events.mjs";
import { eventSummary } from "./research-events.mjs";
import { eventHeadline } from "./plain-language.mjs";

export const EVENT_TYPES = Object.freeze(["insider_purchase", "insider_sale", "multi_insider_purchase", "form4_amendment", "company_disclosure"]);
export const EMAIL_MODES = Object.freeze(["off"]);
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
/* ---------- preferences, consent, unsubscribe ---------- */
export async function getPreferences(query, userId) {
  const row = (await query("SELECT in_app,event_types,digest_hour_utc,unsubscribed_at,updated_at FROM notification_preferences WHERE user_id=$1", [userId])).rows[0];
  return {
    inApp: row?.in_app ?? true, emailAlerts: "off", eventTypes: row?.event_types ?? [...EVENT_TYPES], digestHourUtc: row?.digest_hour_utc ?? 13,
    unsubscribedAt: row?.unsubscribed_at ?? null, emailAvailable: false, eventTypesAvailable: EVENT_TYPES, modes: EMAIL_MODES
  };
}

async function recordConsent(query, { userId, email, action, setting, req = null }) {
  await query("INSERT INTO email_consents(user_id,recipient_hash,action,setting,consent_version,consent_text,ip,user_agent) VALUES($1,$2,$3,$4,NULL,NULL,$5,$6)",
    [userId, emailDigest(email), action, setting, requestAddress(req), String(req?.headers?.["user-agent"] || "").slice(0, 300) || null]);
}

export async function savePreferences(query, user, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "Invalid preferences");
  const current = await getPreferences(query, user.id);
  if ((input.emailAlerts ?? "off") !== "off") throw fail(410, "Insidir does not send email. Alerts arrive in the app and as device notifications.");
  const eventTypes = input.eventTypes ?? current.eventTypes;
  if (!Array.isArray(eventTypes) || eventTypes.some(t => !EVENT_TYPES.includes(t))) throw fail(400, "Unknown event type");
  const inApp = input.inApp ?? current.inApp;
  if (typeof inApp !== "boolean") throw fail(400, "inApp must be true or false");
  const hour = input.digestHourUtc ?? current.digestHourUtc;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw fail(400, "digestHourUtc must be 0-23");
  await query(`INSERT INTO notification_preferences(user_id,in_app,email_alerts,event_types,digest_hour_utc,updated_at) VALUES($1,$2,'off',$3,$4,now())
    ON CONFLICT (user_id) DO UPDATE SET in_app=EXCLUDED.in_app,email_alerts='off',event_types=EXCLUDED.event_types,digest_hour_utc=EXCLUDED.digest_hour_utc,updated_at=now()`,
    [user.id, inApp, eventTypes, hour]);
  return getPreferences(query, user.id);
}

export async function unsubscribe(query, token, { env = process.env, req = null, oneClick = false } = {}) {
  const userId = verifyUnsubscribeToken(token, env);
  if (!userId) return null;
  const user = (await query("SELECT id,email FROM users WHERE id=$1", [userId])).rows[0];
  if (!user) return { done: true };
  const r = await query(`INSERT INTO notification_preferences(user_id,email_alerts,unsubscribed_at) VALUES($1,'off',now())
    ON CONFLICT (user_id) DO UPDATE SET email_alerts='off',unsubscribed_at=now(),updated_at=now() WHERE notification_preferences.email_alerts<>'off' RETURNING user_id`, [userId]);
  if (r.rowCount) await recordConsent(query, { userId, email: user.email, action: oneClick ? "unsubscribe_one_click" : "unsubscribe_link", setting: "off", req });
  await query("UPDATE email_outbox SET status='cancelled',to_email=NULL,text_body=NULL,html_body=NULL WHERE user_id=$1 AND status='queued'", [userId]);
  return { done: true };
}

/* ---------- reading ---------- */
export async function listNotifications(query, userId, { limit = 50, before = null, unread = false } = {}) {
  const rows = (await query(`SELECT n.id,n.reason,n.delivery,n.created_at,n.read_at,e.id AS event_id,e.event_type,e.status,e.ticker,e.issuer_name,e.owner_cik,e.owner_name,e.transaction_date,e.transaction_date_end,
      e.filing_date,e.ingested_at,e.accessions,e.source_urls,e.facts,e.superseded_by
    FROM notifications n JOIN sec_events e ON e.id=n.event_id
    WHERE n.user_id=$1 AND n.available_at<=now() AND n.archived_at IS NULL AND ($2::bigint IS NULL OR n.id<$2) AND (NOT $3::boolean OR n.read_at IS NULL)
    ORDER BY n.id DESC LIMIT $4`, [userId, before, unread, Math.min(100, Math.max(1, limit))])).rows;
  const unreadCount = (await query("SELECT count(*)::integer AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL AND archived_at IS NULL AND available_at<=now()", [userId])).rows[0].n;
  return { items: rows.map(r => ({ id: String(r.id), reason: r.reason, delivery: r.delivery, createdAt: r.created_at, readAt: r.read_at, event: { id: String(r.event_id), type: r.event_type, status: r.status,
    supersededBy: r.superseded_by, ticker: r.ticker, issuerName: r.issuer_name, transactionDate: r.transaction_date, transactionDateEnd: r.transaction_date_end,
    filingDate: r.filing_date, retrievedAt: r.ingested_at, accessions: r.accessions, sourceUrls: r.source_urls, facts: r.facts || {}, headline: eventHeadline(r), summary: eventSummary({ ...r, id: r.event_id }) } })),
    unread: unreadCount, next: rows.length ? String(rows.at(-1).id) : null };
}
/* Archive (or bring back) alerts: hidden from the inbox, kept for the record. Archiving also marks them read. */
export async function archive(query, userId, { ids, undo = false } = {}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(i => !/^\d{1,18}$/.test(String(i)))) throw fail(400, "ids must be 1-200 notification ids");
  const sql = undo ? "UPDATE notifications SET archived_at=NULL WHERE user_id=$1 AND id=ANY($2::bigint[]) AND archived_at IS NOT NULL"
    : "UPDATE notifications SET archived_at=now(),read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=ANY($2::bigint[]) AND archived_at IS NULL";
  return { [undo ? "restored" : "archived"]: (await query(sql, [userId, ids.map(String)])).rowCount };
}
export async function markRead(query, userId, { ids = null, all = false } = {}) {
  if (all) return { marked: (await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND archived_at IS NULL AND available_at<=now()", [userId])).rowCount };
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(i => !/^\d{1,18}$/.test(String(i)))) throw fail(400, "ids must be 1-200 notification ids");
  return { marked: (await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=ANY($2::bigint[]) AND read_at IS NULL", [userId, ids.map(String)])).rowCount };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/* The page behind an unsubscribe link: GET asks for one confirming click (link scanners never unsubscribe anyone);
 * mail clients' one-click POST (RFC 8058) needs none. */
export function unsubscribePage(state, token = "") {
  const acts = html => `<div class="nt-acts">${html}</div>`;
  const body = state === "confirm"
    ? `<h1 class="t-title">Stop alert emails?</h1><p class="au-sub">Insidir no longer sends any email. This makes sure alert emails stay off for your account. Alerts stay in the app.</p>
<form method="post" action="/v1/email/unsubscribe?t=${encodeURIComponent(token)}">${acts(`<button class="btn btn--primary" type="submit">Unsubscribe from alert emails</button>`)}</form>`
    : state === "done"
      ? `<h1 class="t-title">You're unsubscribed.</h1><p class="au-sub">Insidir will not send you alert emails, or any other email.</p>${acts(`<a class="btn btn--primary" href="/alerts.html">Open Alerts</a>`)}`
      : `<h1 class="t-title">This link is not valid.</h1><p class="au-sub">It may be incomplete. Insidir no longer sends any email, so there is nothing to turn off. Questions: hello@aethric.llc.</p>${acts(`<a class="btn btn--secondary" href="/">Return home</a>`)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0c0c0b"><meta name="color-scheme" content="dark">
<title>Alert emails — Insidir</title><link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/ui.css?v=3"><link rel="stylesheet" href="/assets/css/auth-ui.css?v=1"><link rel="stylesheet" href="/assets/css/notice-app.css?v=1"></head>
<body class="ui"><a class="skip" href="#main">Skip to content</a><div class="au">
<header class="au-top"><a class="wordmark" href="/" aria-label="Insidir home">${WORDMARK}</a></header>
<main class="au-main" id="main"><div class="au-card"><p class="t-label muted">Email</p>${body}</div></main>
<footer class="au-foot">© 2026 Aethric LLC. Research, not investment advice. <a class="au-link" href="/privacy.html">Privacy</a> · <a class="au-link" href="/terms.html">Terms</a></footer>
</div></body></html>`;
}
