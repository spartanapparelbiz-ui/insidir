/* Administrator authentication with a second factor.
 *
 * Every admin route (/v1/creators/admin/*, /v1/admin/*) needs BOTH:
 *   1. the admin bearer token (INSIDIR_ADMIN_TOKEN, or the older INSIDIR_CREATOR_ADMIN_TOKEN; 32+ characters), and
 *   2. a one-time code from an authenticator app (RFC 6238; secret INSIDIR_ADMIN_TOTP_SECRET, base32), sent as
 *      `X-Insidir-Admin-OTP`. Each code is accepted once across every instance (admin_otp_used), so a code seen in
 *      transit cannot be replayed.
 * or an admin session opened with both (POST /v1/admin/session) and sent back as the `insidir_admin` cookie
 * (HttpOnly, SameSite=Strict, Path=/v1/, 30 minutes), so the ops page does not need a new code per request.
 * Without a TOTP secret configured, admin routes are closed (503): there is no single-factor mode.
 * Failures count per client address (10 per 15 minutes, then 429) before any token comparison. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyTotp } from "./totp.mjs";
import { logSecurityEvent, requestAddress } from "./security-events.mjs";

export const ADMIN_SESSION_MINUTES = 30;
const ADMIN_COOKIE = "insidir_admin";
const fail = (status, error) => ({ ok: false, status, error });
const getCookie = (req, name) => String(req.headers?.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="))?.slice(name.length + 1) || null;
const sha = s => createHash("sha256").update(s).digest("hex");

export function adminSettings(env = process.env) {
  const token = String(env.INSIDIR_ADMIN_TOKEN || env.INSIDIR_CREATOR_ADMIN_TOKEN || "");
  const totpSecret = String(env.INSIDIR_ADMIN_TOTP_SECRET || "").trim();
  return { token, totpSecret, configured: token.length >= 32 && totpSecret.length >= 16, cookieSecure: env.COOKIE_SECURE !== "0" };
}
export const tokenFingerprint = supplied => supplied ? "token:" + sha(supplied).slice(0, 12) : "anonymous";

function tokenMatches(req, settings) {
  const supplied = String(req.headers.authorization || "").replace(/^Bearer /i, "");
  if (settings.token.length < 32 || supplied.length !== settings.token.length) return null;
  return timingSafeEqual(Buffer.from(settings.token), Buffer.from(supplied)) ? supplied : null;
}

export function adminCookie(token, settings) {
  return `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/v1/; Max-Age=${ADMIN_SESSION_MINUTES * 60}` + (settings.cookieSecure ? "; Secure" : "");
}
export const clearAdminCookie = settings => `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/v1/; Max-Age=0` + (settings.cookieSecure ? "; Secure" : "");

/* { ok: true, actor, via: "otp" | "session" } or { ok: false, status, error }. Never throws for bad credentials. */
export async function authorizeAdmin(req, { env = process.env, query, limiter, now = Date.now() } = {}) {
  const settings = adminSettings(env);
  const ip = requestAddress(req) || "unknown";
  if (!settings.configured) return fail(503, "Admin access is closed: set INSIDIR_ADMIN_TOKEN and INSIDIR_ADMIN_TOTP_SECRET (see docs/OPERATIONS.md).");
  if (limiter && await limiter.atLimit("admin-fail:" + ip, 10)) return fail(429, "Too many failed admin attempts. Wait 15 minutes.");
  const refuse = async (status, error, kind = "admin_denied") => {
    if (limiter) await limiter.fail("admin-fail:" + ip, 15 * 60_000);
    await logSecurityEvent(query, { req, kind, detail: { path: new URL(req.url || "/", "http://x").pathname } });
    return fail(status, error);
  };
  // An admin session cookie (opened with token + code) is enough on its own.
  const cookie = getCookie(req, ADMIN_COOKIE);
  if (cookie && /^[a-f0-9]{64}$/.test(cookie)) {
    const r = await query("SELECT actor FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()", [sha(cookie)]);
    if (r.rows[0]) return { ok: true, actor: r.rows[0].actor, via: "session" };
  }
  const supplied = tokenMatches(req, settings);
  if (!supplied) return refuse(401, "Unauthorized");
  const step = verifyTotp(settings.totpSecret, String(req.headers["x-insidir-admin-otp"] || "").trim(), { now });
  if (step == null) return refuse(401, "A valid one-time code is required (X-Insidir-Admin-OTP).", "admin_mfa_failed");
  const fresh = await query("INSERT INTO admin_otp_used(secret_fingerprint,step) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING step", [sha("totp:" + settings.totpSecret).slice(0, 16), step]);
  if (!fresh.rows.length) return refuse(401, "That one-time code was already used. Wait for the next one.", "admin_mfa_replay");
  return { ok: true, actor: tokenFingerprint(supplied), via: "otp" };
}

// POST /v1/admin/session: open a 30-minute admin session after token + code were checked by authorizeAdmin.
export async function openAdminSession(req, actor, { query }) {
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO admin_sessions(token_hash,actor,ip,expires_at) VALUES($1,$2,$3,now()+($4::integer*interval '1 minute'))",
    [sha(token), actor, requestAddress(req), ADMIN_SESSION_MINUTES]);
  return token;
}
export async function closeAdminSession(req, { query }) {
  const cookie = getCookie(req, ADMIN_COOKIE);
  if (cookie && /^[a-f0-9]{64}$/.test(cookie)) await query("DELETE FROM admin_sessions WHERE token_hash=$1", [sha(cookie)]);
}
export async function purgeAdminAuth(query) {
  const a = await query("DELETE FROM admin_sessions WHERE expires_at<now()");
  const b = await query("DELETE FROM admin_otp_used WHERE used_at<now()-interval '1 day'");
  return (a.rowCount || 0) + (b.rowCount || 0);
}
