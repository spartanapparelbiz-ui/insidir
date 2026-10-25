/* Admin access: a long token (ADMIN_TOKEN, 32+ characters) AND a 6-digit RFC 6238 code from an authenticator app
 * (ADMIN_TOTP_SECRET, RFC 4648 base32). After both check out, the browser gets an httpOnly cookie holding an expiry
 * and an HMAC of it keyed by the token, so changing ADMIN_TOKEN signs every admin out. Server-only (node:crypto).
 *
 * TOTP: HMAC-SHA1, 30-second steps, 6 digits, ±1 step for clock drift, constant-time comparison. Ported from the
 * old src/totp.mjs. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Minimum ADMIN_TOKEN length. */
export const ADMIN_TOKEN_MIN = 32;
/** The admin cookie's name. */
export const ADMIN_COOKIE = "insidir_admin";
/** How long an admin sign-in lasts. */
export const ADMIN_SESSION_MS = 12 * 3_600_000;
/** TOTP step length (RFC 6238 default). */
export const STEP_SECONDS = 30;
/** Steps either side of now that are accepted (clock drift). */
export const TOTP_WINDOW = 1;
/** Minimum decoded TOTP secret length, bytes (RFC 4226 asks for 128 bits; 80 is the floor apps accept). */
export const TOTP_SECRET_MIN_BYTES = 10;
/** Failed sign-ins allowed per client per window, and the window. */
export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = ((value << 5) | ALPHABET.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const stepAt = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SECONDS);

/** The code for one step, `digits` long (6 for authenticator apps; RFC 6238's vectors use 8). */
export function totpCode(secret: Buffer, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 15;
  const n = (((mac[offset] ?? 0) & 127) << 24) | ((mac[offset + 1] ?? 0) << 16) | ((mac[offset + 2] ?? 0) << 8) | (mac[offset + 3] ?? 0);
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** The step a 6-digit code belongs to (now ± TOTP_WINDOW), or null. */
export function verifyTotp(secret: string, code: string, nowMs: number, window = TOTP_WINDOW): number | null {
  const bytes = base32Decode(secret);
  if (!bytes || bytes.length < TOTP_SECRET_MIN_BYTES || !/^\d{6}$/.test(code)) return null;
  const current = stepAt(nowMs);
  const given = Buffer.from(code);
  let found: number | null = null;
  for (let d = -window; d <= window; d++) {
    // Check every step (no early return) so timing doesn't reveal which one matched.
    if (timingSafeEqual(Buffer.from(totpCode(bytes, current + d)), given) && found === null) found = current + d;
  }
  return found;
}

const env = (k: string): string => process.env[k] ?? "";

/** Both secrets present and well-formed. */
export function adminConfigured(token = env("ADMIN_TOKEN"), secret = env("ADMIN_TOTP_SECRET")): boolean {
  const bytes = base32Decode(secret);
  return token.length >= ADMIN_TOKEN_MIN && bytes !== null && bytes.length >= TOTP_SECRET_MIN_BYTES;
}

/** Constant-time string equality (hashes first so lengths don't leak). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

const sign = (token: string, exp: number): string => createHmac("sha256", token).update(`insidir-admin:${exp}`).digest("base64url");

/** The cookie value for a session that ends at `expMs`. */
export const adminCookieValue = (token: string, expMs: number): string => `${expMs}.${sign(token, expMs)}`;

/** True when the cookie was issued with this token and hasn't expired. */
export function verifyAdminCookie(value: string | undefined, nowMs: number, token = env("ADMIN_TOKEN")): boolean {
  if (!value || token.length < ADMIN_TOKEN_MIN) return false;
  const dot = value.indexOf(".");
  const exp = Number(value.slice(0, dot));
  if (dot < 1 || !Number.isFinite(exp) || exp <= nowMs || exp > nowMs + ADMIN_SESSION_MS) return false;
  return safeEqual(value.slice(dot + 1), sign(token, exp));
}

/* A code can be used once: the last accepted step is remembered per process. */
let lastStep = -1;

export type AdminLogin = { ok: true; cookie: string; expires: number } | { ok: false; error: string };

/** Checks the typed token and code against the environment. */
export function adminLogin(tokenTyped: string, codeTyped: string, nowMs: number,
  token = env("ADMIN_TOKEN"), secret = env("ADMIN_TOTP_SECRET")): AdminLogin {
  if (!adminConfigured(token, secret)) return { ok: false, error: "Admin is not configured." };
  const tokenOk = safeEqual(tokenTyped, token);
  const step = verifyTotp(secret, codeTyped.replace(/\s/g, ""), nowMs);
  if (!tokenOk || step === null) return { ok: false, error: "Wrong token or code." };
  if (step <= lastStep) return { ok: false, error: "That code was already used. Wait for the next one." };
  lastStep = step;
  const expires = nowMs + ADMIN_SESSION_MS;
  return { ok: true, cookie: adminCookieValue(token, expires), expires };
}

/* Failed attempts per client key, in memory (one web process). */
const attempts = new Map<string, { start: number; count: number }>();

/** Records a failed attempt; true when the client is over the limit. */
export function tooManyAttempts(key: string, nowMs: number, fail: boolean): boolean {
  const a = attempts.get(key);
  const cur = a && nowMs - a.start < LOGIN_WINDOW_MS ? a : { start: nowMs, count: 0 };
  if (fail) cur.count++;
  attempts.set(key, cur);
  if (attempts.size > 10_000) attempts.clear();
  return cur.count >= LOGIN_MAX_ATTEMPTS;
}
