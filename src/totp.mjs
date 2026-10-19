/* RFC 6238 time-based one-time passwords (HMAC-SHA1, 30-second steps, 6 digits), the format every authenticator
 * app reads. Used for administrator MFA (src/admin-auth.mjs). Secrets are RFC 4648 base32. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/[\s=-]/g, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0, value = 0; const out = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const STEP_SECONDS = 30;
export const stepAt = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpCode(secretBytes, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secretBytes).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/* The step a code belongs to (current step ± `window` steps for clock drift), or null. Constant-time comparison. */
export function verifyTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
  const bytes = base32Decode(secret);
  if (!bytes || bytes.length < 10 || !/^\d{6}$/.test(String(code || ""))) return null;
  const current = stepAt(now), given = Buffer.from(String(code));
  for (let d = -window; d <= window; d++) {
    if (timingSafeEqual(Buffer.from(totpCode(bytes, current + d)), given)) return current + d;
  }
  return null;
}

export const otpauthUri = (secret, { issuer = "Insidir", account = "admin" } = {}) =>
  `otpauth://totp/${encodeURIComponent(issuer + ":" + account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
