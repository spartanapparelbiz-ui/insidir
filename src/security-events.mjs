/* Security event log (security_events, sql/013): sign-ins and failures, recovery, verification, password
 * changes, session revocation, account deletion, admin access and refusals.
 *
 * Privacy: emails are stored only as a digest (emailDigest), never in clear; the client address and user agent
 * are kept for SECURITY_EVENT_RETENTION_DAYS and then deleted by the maintenance job. A member can read their own
 * recent events (GET /v1/me/security-events). Logging never fails a request: a write that fails is reported on
 * the console instead. Never put a password, token or full request body in `detail`. */
import { createHash } from "node:crypto";

export const SECURITY_EVENT_RETENTION_DAYS = 180;
export const SECURITY_EVENT_KINDS = Object.freeze([
  "register", "login_success", "login_failure", "login_rate_limited", "logout", "sessions_revoked",
  "email_verification_sent", "email_verified", "email_verification_failed",
  "password_reset_requested", "password_reset_completed", "password_reset_failed", "password_changed", "password_change_failed",
  "account_deleted", "account_delete_failed", "data_exported",
  "admin_access", "admin_denied", "admin_mfa_failed", "admin_mfa_replay"
]);

// A stable digest of an email address (case and surrounding spaces ignored). Used for logs, rate limits and the
// suppression list so none of them keeps the address itself.
export const emailDigest = email => createHash("sha256").update("insidir-email:" + String(email ?? "").trim().toLowerCase()).digest("hex");

// The client address as the hosting proxy reports it (last X-Forwarded-For hop), else the socket.
export function requestAddress(req) {
  return String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "").split(",").at(-1).trim().slice(0, 64) || null;
}

export async function logSecurityEvent(query, { req = null, userId = null, email = null, kind, detail = {} } = {}) {
  if (!SECURITY_EVENT_KINDS.includes(kind)) throw new Error("Unknown security event kind: " + kind);
  const row = [userId, email ? emailDigest(email) : null, kind, requestAddress(req), String(req?.headers?.["user-agent"] || "").slice(0, 300) || null, JSON.stringify(detail || {})];
  try { await query("INSERT INTO security_events(user_id,email_hash,kind,ip,user_agent,detail) VALUES($1,$2,$3,$4,$5,$6)", row); return true; }
  catch (e) { console.error(JSON.stringify({ event: "security_event.write_failed", kind, error: String(e?.message || e) })); return false; }
}

// What a member sees about their own account: no addresses of other people, no internal detail.
export async function recentSecurityEvents(query, userId, limit = 30) {
  const r = await query(`SELECT kind,created_at,ip,user_agent FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(100, Math.max(1, limit))]);
  return r.rows;
}

export async function purgeSecurityEvents(query, days = SECURITY_EVENT_RETENTION_DAYS) {
  return (await query("DELETE FROM security_events WHERE created_at<now()-($1::integer*interval '1 day')", [days])).rowCount || 0;
}
