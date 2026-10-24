/* Password change, session revocation and data export.
 *
 * Insidir sends no email, so there is no emailed verification, password-reset link or security notice. A member who
 * forgets their password writes to hello@aethric.llc from their account address. Old tokens in user_tokens (sql/013)
 * from before are purged by purgeUserTokens. */
import { createHash } from "node:crypto";
import { hashPassword, passwordMatches } from "./auth.mjs";
import { logSecurityEvent } from "./security-events.mjs";

const sha = s => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });

const sessionHash = req => {
  const token = String(req?.headers?.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("insidir_sid="))?.slice(12);
  return token && /^[a-f0-9]{64}$/.test(token) ? sha(token) : null;
};

export async function changePassword(query, user, current, next, { req = null } = {}) {
  if (!await passwordMatches(user.id, current)) { await logSecurityEvent(query, { req, userId: user.id, kind: "password_change_failed" }); throw fail(403, "Your current password is not correct."); }
  if (typeof next === "string" && next === current) throw fail(400, "Choose a password different from your current one.");
  const hash = await hashPassword(next);
  await query("UPDATE users SET password_hash=$2,password_changed_at=now() WHERE id=$1", [user.id, hash]);
  const revoked = await query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", [user.id, sessionHash(req) || ""]);
  await logSecurityEvent(query, { req, userId: user.id, kind: "password_changed", detail: { otherSessionsRevoked: revoked.rowCount || 0 } });
  return { changed: true, otherSessionsRevoked: revoked.rowCount || 0 };
}

export async function revokeOtherSessions(query, user, { req = null } = {}) {
  const revoked = await query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", [user.id, sessionHash(req) || ""]);
  await logSecurityEvent(query, { req, userId: user.id, kind: "sessions_revoked", detail: { count: revoked.rowCount || 0 } });
  return { revoked: revoked.rowCount || 0 };
}

/* GET /v1/me/export: everything Insidir stores about the account that the member can see, as JSON. Card details are
 * held by Stripe, never by Insidir. Consent records are included because they are the member's own agreements. */
export async function exportAccount(query, user, { req = null } = {}) {
  const one = async (sql) => (await query(sql, [user.id])).rows;
  const [account] = await one("SELECT id,email,created_at,email_verified_at,password_changed_at,subscription_status,current_period_end,cancel_at_period_end,trial_started_at FROM users WHERE id=$1");
  const data = {
    exportedAt: new Date().toISOString(),
    account: account || null,
    watchlist: await one("SELECT ticker,created_at FROM watchlist WHERE user_id=$1 ORDER BY ticker"),
    followedPeople: await one("SELECT owner_cik,created_at FROM followed_people WHERE user_id=$1 ORDER BY created_at"),
    researchJournal: await one("SELECT ticker,review_status,notes,created_at,updated_at FROM research_decisions WHERE user_id=$1 ORDER BY updated_at"),
    manualHoldings: await one("SELECT ticker,quantity,updated_at FROM manual_holdings WHERE user_id=$1 ORDER BY ticker"),
    subscriptionConsents: await one("SELECT offer,amount_today_cents,recurring_cents,trial_days,disclosure_version,disclosure_text,created_at FROM billing_consents WHERE user_id=$1 ORDER BY created_at"),
    alertPreferences: await one("SELECT in_app,email_alerts,event_types,digest_hour_utc,consent_version,consented_at,unsubscribed_at,updated_at FROM notification_preferences WHERE user_id=$1"),
    alertEmailConsents: await one("SELECT action,setting,consent_version,consent_text,created_at FROM email_consents WHERE user_id=$1 ORDER BY created_at"),
    notifications: await one("SELECT n.created_at,n.read_at,n.reason,e.event_type,e.ticker,e.accessions FROM notifications n JOIN sec_events e ON e.id=n.event_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 1000"),
    emailsSent: await one("SELECT kind,category,status,created_at,sent_at FROM email_outbox WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500"),
    securityEvents: await one("SELECT kind,created_at,ip,user_agent FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500"),
    notes: ["Payment card details are stored by Stripe, not by Insidir.", "Public SEC records shown in the product are not personal data held about you and are not included."]
  };
  await logSecurityEvent(query, { req, userId: user.id, kind: "data_exported" });
  return data;
}

export async function purgeUserTokens(query) {
  return (await query("DELETE FROM user_tokens WHERE expires_at<now()-interval '7 days'")).rowCount || 0;
}
