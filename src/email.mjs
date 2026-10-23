/* Outgoing email: an outbox in PostgreSQL (email_outbox, sql/014) and a delivery worker.
 *
 *   enqueueEmail()      writes one message, idempotently (dedupe_key is unique: retries queue it once)
 *   deliverDue()        claims due messages (FOR UPDATE SKIP LOCKED, so instances never send the same row at once),
 *                       sends them, retries transient failures with backoff, gives up after MAX_ATTEMPTS
 *   handleEmailWebhook  POST /v1/email/webhook/postmark: bounces, spam complaints and unsubscribes reported by the
 *                       provider go on the suppression list; deliveries are recorded
 *
 * Providers: INSIDIR_EMAIL_PROVIDER=postmark (POSTMARK_SERVER_TOKEN) or `log` (local development: prints the
 * message, never use in production). Unset: messages are queued and nothing is sent; the ops page shows the
 * backlog. Nothing here can send without a configured provider and a From address on a domain the operator
 * controls (INSIDIR_EMAIL_FROM).
 *
 * Privacy: recipients are matched by digest (emailDigest). When a message is delivered or abandoned, its body and
 * address are erased unless retain_body is set (billing notices, kept as the record of what the customer was told).
 * Security messages carry one-time links and are never retained. */
import { timingSafeEqual } from "node:crypto";
import { emailDigest } from "./security-events.mjs";
import { emailSettings } from "./config.mjs";

export const MAX_ATTEMPTS = 8;
export const CATEGORIES = Object.freeze(["security", "billing", "alert", "digest"]);
// Reasons that stop every message, and the one (an unsubscribe at the provider) that stops only optional mail.
const BLOCKS_ALL = new Set(["hard_bounce", "spam_complaint", "manual"]);
const OPTIONAL = new Set(["alert", "digest"]);

export { emailSettings };

const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* A plain, accessible message in Insidir's voice: a heading, paragraphs, an optional button, a footer. Every
 * message has a text part; the HTML part is the same words. `lines` may hold {label, value} rows (receipts). */
export function renderEmail({ heading, paragraphs = [], lines = [], action = null, footer = [], publicUrl = emailSettings(process.env).publicUrl }) {
  const text = [heading, "", ...paragraphs.flatMap(p => [p, ""]),
    ...(lines.length ? [...lines.map(l => `${l.label}: ${l.value}`), ""] : []),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    "—", ...footer, "Insidir · Aethric LLC · Research, not investment advice."].join("\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f1ea;color:#0c0c0b;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fbfaf6;border:1px solid #0c0c0b">
<tr><td style="padding:24px 28px;border-bottom:1px solid #0c0c0b"><img src="${escapeHtml(publicUrl)}/assets/brand/insidir-wordmark-ink.png" width="102" height="18" alt="insidir." style="display:block;border:0"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${escapeHtml(heading)}</h1>
${paragraphs.map(p => `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapeHtml(p)}</p>`).join("")}
${lines.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;font-size:13px;border-top:1px solid #0c0c0b">${lines.map(l => `<tr><td style="padding:8px 0;border-bottom:1px solid #d9d6cc">${escapeHtml(l.label)}</td><td style="padding:8px 0;border-bottom:1px solid #d9d6cc;text-align:right">${escapeHtml(l.value)}</td></tr>`).join("")}</table>` : ""}
${action ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0c0c0b;color:#fbfaf6;padding:12px 18px;text-decoration:none;font-size:14px">${escapeHtml(action.label)}</a></p><p style="font-size:12px;line-height:1.5;color:#55534c;margin:0 0 14px">Or paste this address into your browser: ${escapeHtml(action.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #0c0c0b;font-size:11px;line-height:1.6;color:#55534c">${[...footer, "Insidir · Aethric LLC · Research, not investment advice."].map(escapeHtml).join("<br>")}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

/* Queue one message. Returns { queued: true, id } or { queued: false } when the dedupe key was already used. */
export async function enqueueEmail(query, { userId = null, to, category, kind, dedupeKey, subject, text, html = null, retainBody = false, headers = {} }) {
  if (!CATEGORIES.includes(category)) throw new Error("Unknown email category: " + category);
  if (typeof to !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) throw new Error("Invalid recipient");
  if (!dedupeKey || !subject || !text) throw new Error("dedupeKey, subject and text are required");
  const r = await query(`INSERT INTO email_outbox(user_id,to_email,recipient_hash,category,kind,dedupe_key,subject,text_body,html_body,retain_body,headers)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [userId, to.trim(), emailDigest(to), category, kind, String(dedupeKey).slice(0, 300), String(subject).slice(0, 200), text, html, !!retainBody, JSON.stringify(headers || {})]);
  return r.rows[0] ? { queued: true, id: r.rows[0].id } : { queued: false };
}

export async function isSuppressed(query, email, category) {
  const r = await query("SELECT reason FROM email_suppressions WHERE recipient_hash=$1", [emailDigest(email)]);
  const reason = r.rows[0]?.reason;
  if (!reason) return null;
  return BLOCKS_ALL.has(reason) || OPTIONAL.has(category) ? reason : null;
}

export async function suppress(query, email, reason, detail = {}) {
  await query(`INSERT INTO email_suppressions(recipient_hash,reason,detail) VALUES($1,$2,$3)
    ON CONFLICT (recipient_hash) DO UPDATE SET reason=CASE WHEN email_suppressions.reason IN ('hard_bounce','spam_complaint','manual') THEN email_suppressions.reason ELSE EXCLUDED.reason END,
    detail=EXCLUDED.detail,created_at=now()`, [emailDigest(email), reason, JSON.stringify(detail)]);
}

/* ---------- transports ---------- */
const permanent = (message, extra = {}) => Object.assign(new Error(message), { permanent: true }, extra);
export function postmarkTransport({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  return {
    name: "postmark",
    async send(m) {
      let res;
      try {
        res = await fetchImpl("https://api.postmarkapp.com/email", { method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
          headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
          body: JSON.stringify({ From: m.from, To: m.to, ReplyTo: m.replyTo, Subject: m.subject, TextBody: m.text, HtmlBody: m.html || undefined,
            MessageStream: m.stream, Tag: m.kind, TrackOpens: false, TrackLinks: "None",
            Headers: Object.entries(m.headers || {}).map(([Name, Value]) => ({ Name, Value: String(Value) })) }) });
      } catch (e) { throw Object.assign(new Error("Email provider unreachable: " + (e?.name || "network")), { permanent: false }); }
      const data = await res.json().catch(() => ({}));
      if (res.ok && Number(data.ErrorCode || 0) === 0 && data.MessageID) return { messageId: String(data.MessageID) };
      const code = Number(data.ErrorCode);
      // 300 invalid address, 406 inactive (bounced or complained) recipient: never deliverable, do not retry.
      if (code === 300 || code === 406) throw permanent("Recipient not deliverable (" + code + ")", { suppressReason: code === 406 ? "hard_bounce" : "hard_bounce" });
      if (res.status === 422 && code !== 10 && code !== 405) throw permanent("Provider refused the message (" + (code || res.status) + "): " + String(data.Message || "").slice(0, 120));
      throw Object.assign(new Error("Provider error " + res.status + (code ? "/" + code : "")), { permanent: false });
    }
  };
}
// Local development only: writes the message to the console (one-time links included, so never in production).
export function logTransport({ log = console } = {}) {
  let n = 0;
  return { name: "log", async send(m) { n++; log.log(JSON.stringify({ event: "email.log_transport", to: m.to, subject: m.subject, kind: m.kind, text: m.text })); return { messageId: "log-" + Date.now() + "-" + n }; } };
}
export function transportFor(settings, deps = {}) {
  if (settings.provider === "postmark") return postmarkTransport({ token: settings.token, fetchImpl: deps.fetchImpl });
  if (settings.provider === "log") return logTransport(deps);
  return null;
}

export const backoffMs = attempts => Math.min(6 * 3600_000, 60_000 * 2 ** Math.max(0, attempts - 1));

const CLAIM = `UPDATE email_outbox SET status='sending',locked_until=now()+interval '5 minutes',attempts=attempts+1
  WHERE id IN (SELECT id FROM email_outbox
    WHERE ((status='queued' AND next_attempt_at<=now()) OR (status='sending' AND locked_until<now())) AND ($2::text[] IS NULL OR kind=ANY($2::text[]))
    ORDER BY next_attempt_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)
  RETURNING id,user_id,to_email,category,kind,subject,text_body,html_body,retain_body,headers,attempts`;
const ERASE = "to_email=CASE WHEN retain_body THEN to_email ELSE NULL END,text_body=CASE WHEN retain_body THEN text_body ELSE NULL END,html_body=CASE WHEN retain_body THEN html_body ELSE NULL END";

/* One delivery pass. Returns counts. A message is at-least-once: if the process dies after the provider accepted it
 * but before the row is marked, the row is re-sent after its 5-minute lock expires (rare; stated in OPERATIONS.md). */
// kinds: deliver only these message kinds (e.g. security mail first during a backlog); default every kind.
export async function deliverDue({ query, transport, settings = emailSettings(), limit = 50, kinds = null }) {
  const out = { claimed: 0, sent: 0, retried: 0, failed: 0, suppressed: 0 };
  if (!transport) return { ...out, skipped: "no_transport" };
  const rows = (await query(CLAIM, [limit, kinds?.length ? kinds : null])).rows;
  out.claimed = rows.length;
  for (const m of rows) {
    if (!m.to_email || !m.text_body) {
      await query(`UPDATE email_outbox SET status='failed',last_error='message body no longer available',locked_until=NULL,${ERASE} WHERE id=$1`, [m.id]);
      out.failed++; continue;
    }
    const blocked = await isSuppressed(query, m.to_email, m.category);
    if (blocked) {
      await query(`UPDATE email_outbox SET status='suppressed',last_error=$2,locked_until=NULL,${ERASE} WHERE id=$1`, [m.id, "suppressed: " + blocked]);
      out.suppressed++; continue;
    }
    try {
      const sent = await transport.send({ from: settings.from, replyTo: settings.replyTo, to: m.to_email, subject: m.subject, text: m.text_body, html: m.html_body,
        kind: m.kind, headers: m.headers || {}, stream: OPTIONAL.has(m.category) ? settings.alertStream : settings.transactionalStream });
      await query(`UPDATE email_outbox SET status='sent',sent_at=now(),provider=$2,provider_message_id=$3,last_error=NULL,locked_until=NULL,${ERASE} WHERE id=$1`,
        [m.id, transport.name, sent.messageId]);
      out.sent++;
    } catch (e) {
      const reason = String(e?.message || e).slice(0, 300);
      if (e?.permanent || m.attempts >= MAX_ATTEMPTS) {
        if (e?.suppressReason) await suppress(query, m.to_email, e.suppressReason, { source: "send", message: reason });
        await query(`UPDATE email_outbox SET status='failed',last_error=$2,locked_until=NULL,${ERASE} WHERE id=$1`, [m.id, reason]);
        out.failed++;
      } else {
        await query("UPDATE email_outbox SET status='queued',last_error=$2,locked_until=NULL,next_attempt_at=now()+($3::bigint*interval '1 millisecond') WHERE id=$1",
          [m.id, reason, backoffMs(m.attempts)]);
        out.retried++;
      }
    }
  }
  return out;
}

/* ---------- provider webhook (Postmark) ----------
 * Configure in Postmark: Webhooks → URL https://postmark:<INSIDIR_EMAIL_WEBHOOK_SECRET>@YOUR_DOMAIN/v1/email/webhook/postmark
 * with Bounce, Spam Complaint, Subscription Change and Delivery events. Basic-auth password checked in constant time. */
function webhookAuthorized(req, secret) {
  if (!secret || secret.length < 24) return false;
  const header = String(req.headers.authorization || "");
  if (!/^Basic /i.test(header)) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  const a = Buffer.from(password), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
const HARD_BOUNCES = new Set(["HardBounce", "BadEmailAddress", "Blocked", "ManuallyDeactivated", "SpamNotification", "Unknown"]);

export async function handleEmailWebhook(req, res, json, { query, env = process.env, readBody }) {
  const settings = emailSettings(env);
  if (!settings.webhookSecret) return json(res, 503, { error: "Email webhook is not configured" });
  if (!webhookAuthorized(req, settings.webhookSecret)) return json(res, 401, { error: "Unauthorized" });
  let event;
  try { event = JSON.parse((await readBody(req, 65536)).toString("utf8")); } catch { return json(res, 400, { error: "Invalid payload" }); }
  const type = String(event?.RecordType || "");
  const address = String(event?.Email || event?.Recipient || "").trim();
  const messageId = typeof event?.MessageID === "string" ? event.MessageID : null;
  const mark = status => messageId ? query("UPDATE email_outbox SET delivery_status=$2,delivery_updated_at=now() WHERE provider_message_id=$1", [messageId, status]) : null;
  if (type === "Delivery") { await mark("delivered"); return json(res, 200, { received: true }); }
  if (type === "Bounce") {
    const hard = HARD_BOUNCES.has(String(event.Type || "")) || event.Inactive === true;
    await mark(hard ? "bounced" : "soft_bounced");
    if (hard && address) await suppress(query, address, "hard_bounce", { type: event.Type || null, at: event.BouncedAt || null });
    return json(res, 200, { received: true, suppressed: hard && !!address });
  }
  if (type === "SpamComplaint") {
    await mark("complained");
    if (address) await suppress(query, address, "spam_complaint", { at: event.BouncedAt || null });
    return json(res, 200, { received: true, suppressed: !!address });
  }
  if (type === "SubscriptionChange" && address) {
    if (event.SuppressSending === true) await suppress(query, address, event.SuppressionReason === "SpamComplaint" ? "spam_complaint" : event.SuppressionReason === "HardBounce" ? "hard_bounce" : "unsubscribed", { reason: event.SuppressionReason || null });
    else await query("DELETE FROM email_suppressions WHERE recipient_hash=$1 AND reason='unsubscribed'", [emailDigest(address)]);
    return json(res, 200, { received: true });
  }
  return json(res, 200, { received: true, ignored: type || "unknown" });
}

// Abandoned messages older than a week lose their bodies too (they will never be sent).
export async function purgeEmailBodies(query) {
  return (await query(`UPDATE email_outbox SET ${ERASE} WHERE status IN ('failed','suppressed','cancelled') AND (text_body IS NOT NULL OR to_email IS NOT NULL) AND NOT retain_body`)).rowCount || 0;
}
