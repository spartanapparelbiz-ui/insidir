/* Email verification, password recovery, password change, session revocation and data export.
 *
 * Tokens: 32 random bytes, sent only in the email; the database keeps their SHA-256 (user_tokens, sql/013), the
 * address they were issued to, an expiry (verification 48 hours, reset 1 hour) and when they were used. A token
 * works once, only for the address it was sent to, and a newer reset token voids older ones.
 *
 * Recovery never reveals whether an address has an account: POST /v1/auth/forgot-password always answers 202 with
 * the same text, and its timing does not depend on the account (the email is queued, not sent, in the request).
 * A completed reset signs out every session of the account and confirms the address.
 *
 * Verification is enforced when INSIDIR_REQUIRE_EMAIL_VERIFICATION=1, or by default once an email provider is
 * configured (=0 switches it off): checkout needs a verified address, and a complimentary address only has access
 * once verified, so nobody can claim an owner's complimentary access by registering the address first. */
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, passwordMatches } from "./auth.mjs";
import { enqueueEmail, renderEmail } from "./email.mjs";
import { emailSettings, verificationRequired } from "./config.mjs";
import { logSecurityEvent } from "./security-events.mjs";

const sha = s => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
export const VERIFY_HOURS = 48, RESET_MINUTES = 60;

export { verificationRequired };

async function issueToken(query, userId, email, purpose) {
  const token = randomBytes(32).toString("hex");
  const ttl = purpose === "verify_email" ? `${VERIFY_HOURS} hours` : `${RESET_MINUTES} minutes`;
  if (purpose === "reset_password") await query("UPDATE user_tokens SET used_at=now() WHERE user_id=$1 AND purpose='reset_password' AND used_at IS NULL", [userId]);
  await query(`INSERT INTO user_tokens(token_hash,user_id,purpose,email,expires_at) VALUES($1,$2,$3,$4,now()+interval '${ttl}')`, [sha(token), userId, purpose, email]);
  return token;
}

/* Consumes a token: { userId, email } when it is unused, unexpired, of this purpose and still matches the account's
 * current address; otherwise null. Marking it used and checking it are one statement, so a token cannot be raced. */
async function consumeToken(query, token, purpose) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const r = await query(`UPDATE user_tokens t SET used_at=now() FROM users u
    WHERE t.token_hash=$1 AND t.purpose=$2 AND t.used_at IS NULL AND t.expires_at>now() AND u.id=t.user_id AND lower(u.email)=lower(t.email)
    RETURNING t.user_id,u.email`, [sha(token), purpose]);
  return r.rows[0] ? { userId: r.rows[0].user_id, email: r.rows[0].email } : null;
}

export async function sendVerificationEmail(query, user, { env = process.env, req = null } = {}) {
  const settings = emailSettings(env);
  const token = await issueToken(query, user.id, user.email, "verify_email");
  const url = `${settings.publicUrl}/verify-email.html#token=${token}`;
  const { text, html } = renderEmail({
    heading: "Confirm your email address",
    paragraphs: ["Confirm that this address belongs to your Insidir account. The link works once and expires in 48 hours.",
      "If you did not create an Insidir account, ignore this email; nothing will happen."],
    action: { label: "Confirm my email", url },
    footer: ["You received this because someone created an Insidir account with this address."]
  });
  await enqueueEmail(query, { userId: user.id, to: user.email, category: "security", kind: "verify_email", dedupeKey: "verify:" + sha(token), subject: "Confirm your Insidir email address", text, html });
  await logSecurityEvent(query, { req, userId: user.id, kind: "email_verification_sent" });
}

export async function verifyEmail(query, token, { req = null } = {}) {
  const hit = await consumeToken(query, token, "verify_email");
  if (!hit) { await logSecurityEvent(query, { req, kind: "email_verification_failed" }); throw fail(400, "This confirmation link is invalid, already used or expired. Sign in and send a new one from your account."); }
  await query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1", [hit.userId]);
  await logSecurityEvent(query, { req, userId: hit.userId, kind: "email_verified" });
  return { verified: true };
}

export const FORGOT_REPLY = "If an Insidir account uses that address, we have sent it a link to choose a new password. The link expires in 1 hour.";
export async function requestPasswordReset(query, email, { env = process.env, req = null } = {}) {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/.test(e)) throw fail(400, "Enter a valid email address.");
  const r = await query("SELECT id,email FROM users WHERE email=$1", [e]);
  const user = r.rows[0];
  await logSecurityEvent(query, { req, userId: user?.id ?? null, email: e, kind: "password_reset_requested", detail: { account: !!user } });
  if (!user) return { accepted: true };
  const token = await issueToken(query, user.id, user.email, "reset_password");
  const url = `${emailSettings(env).publicUrl}/reset-password.html#token=${token}`;
  const { text, html } = renderEmail({
    heading: "Choose a new password",
    paragraphs: ["Someone asked to reset the password of the Insidir account for this address. If it was you, choose a new password with the link below. It works once and expires in 1 hour.",
      "If you did not ask for this, ignore this email: your password stays the same."],
    action: { label: "Choose a new password", url },
    footer: ["For your security, choosing a new password signs you out on every device."]
  });
  await enqueueEmail(query, { userId: user.id, to: user.email, category: "security", kind: "password_reset", dedupeKey: "reset:" + sha(token), subject: "Reset your Insidir password", text, html });
  return { accepted: true };
}

async function passwordChangedNotice(query, user, reason) {
  const { text, html } = renderEmail({
    heading: "Your Insidir password was changed",
    paragraphs: [reason === "reset" ? "The password of your Insidir account was just reset with a link sent to this address, and every session was signed out."
      : "The password of your Insidir account was just changed from your account page, and your other sessions were signed out.",
      "If this was not you, reset your password now from the log-in page and email hello@aethric.llc."],
    footer: ["This is a security notice about your account; it is sent whatever your email preferences."]
  });
  await enqueueEmail(query, { userId: user.id, to: user.email, category: "security", kind: "password_changed", dedupeKey: "pwchanged:" + user.id + ":" + Date.now(), subject: "Your Insidir password was changed", text, html });
}

export async function resetPassword(query, token, password, { req = null } = {}) {
  const hash = await hashPassword(password); // validates length before the token is spent
  const hit = await consumeToken(query, token, "reset_password");
  if (!hit) { await logSecurityEvent(query, { req, kind: "password_reset_failed" }); throw fail(400, "This reset link is invalid, already used or expired. Ask for a new one."); }
  await query("UPDATE users SET password_hash=$2,password_changed_at=now(),email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1", [hit.userId, hash]);
  await query("UPDATE user_tokens SET used_at=now() WHERE user_id=$1 AND purpose='reset_password' AND used_at IS NULL", [hit.userId]);
  const sessions = await query("DELETE FROM sessions WHERE user_id=$1", [hit.userId]);
  await logSecurityEvent(query, { req, userId: hit.userId, kind: "password_reset_completed", detail: { sessionsRevoked: sessions.rowCount || 0 } });
  await passwordChangedNotice(query, { id: hit.userId, email: hit.email }, "reset");
  return { reset: true };
}

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
  await passwordChangedNotice(query, user, "change");
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
    notifications: await one("SELECT n.created_at,n.read_at,n.reason,e.event_type,e.ticker,e.accessions FROM notifications n JOIN research_events e ON e.id=n.event_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 1000"),
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
