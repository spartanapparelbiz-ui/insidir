/* Email-code sign-in: no passwords. A visitor types an email, gets a 6-digit code, types it, and is signed in (a new
 * account is created on the first code). Built for Instagram and TikTok's in-app browsers, where Google sign-in is
 * blocked and password managers are missing.
 *
 *   POST /v1/auth/email-code          { email }        always 202 with the same answer (never reveals an account)
 *   POST /v1/auth/email-code/verify   { email, code }  200 { user, access, created } and the session cookie
 *
 * A code is 6 digits, lives 10 minutes, allows 5 wrong tries, and a new code replaces the last one. Only a salted
 * SHA-256 of the code is stored (email_codes, keyed by the address's digest). Typing the code proves the inbox, so the
 * address is marked verified. A new account records its attribution ref (the insidir_ref cookie, see attribution.mjs)
 * and, when the ref is an approved creator code, the creator referral, exactly as password registration does. */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { enqueueEmail, renderEmail } from "./email.mjs";
import { config } from "./config.mjs";
import { newSession } from "./auth.mjs";
import { normalizeReferralCode } from "./creator-program.mjs";
import { logSecurityEvent } from "./security-events.mjs";

export const CODE_MINUTES = 10, MAX_TRIES = 5;
export const SENT_REPLY = "If that address can receive email, a 6-digit code is on its way. It expires in 10 minutes.";
export const NO_PASSWORD = "nopassword$"; // users.password_hash for accounts that sign in by code: never matches a password
const sha = s => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
export const normalizeEmail = v => { const e = typeof v === "string" ? v.trim().toLowerCase() : ""; return /^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/.test(e) ? e : null; };
const codeHash = (email, code, salt) => sha(salt + "|" + email + "|" + code);

/* Issues a code and queues the email. Returns the code only to tests (deps.reveal). */
export async function sendEmailCode(query, emailValue, { req = null, env = process.env, reveal = false } = {}) {
  const email = normalizeEmail(emailValue);
  if (!email) throw fail(400, "Enter a valid email address.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0"), salt = randomBytes(16).toString("hex");
  await query(`INSERT INTO email_codes(email_hash,code_hash,salt,attempts,expires_at) VALUES($1,$2,$3,0,now()+make_interval(mins=>$4))
    ON CONFLICT (email_hash) DO UPDATE SET code_hash=EXCLUDED.code_hash,salt=EXCLUDED.salt,attempts=0,expires_at=EXCLUDED.expires_at,created_at=now()`,
    [sha(email), codeHash(email, code, salt), salt, CODE_MINUTES]);
  const { text, html } = renderEmail({
    heading: "Your Insidir code: " + code,
    paragraphs: ["Type this code on the page you came from to sign in. It works once and expires in 10 minutes.",
      "If you didn't ask for it, ignore this email. Nobody can sign in without the code."],
    footer: ["You received this because someone asked to sign in to Insidir with this address."]
  });
  const account = (await query("SELECT id FROM users WHERE email=$1", [email])).rows[0];
  await enqueueEmail(query, { userId: account?.id || null, to: email, category: "security", kind: "email_code", dedupeKey: "code:" + sha(email + salt),
    subject: code + " is your Insidir code", text, html });
  await logSecurityEvent(query, { req, userId: account?.id || null, email, kind: "email_code_sent" });
  return reveal ? { sent: true, code } : { sent: true };
}

/* Checks and spends a code: true once, for the right code within its time and tries. */
export async function consumeEmailCode(query, emailValue, codeValue) {
  const email = normalizeEmail(emailValue), code = String(codeValue ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return false;
  // Count the try first (one statement), so parallel guesses cannot exceed the limit.
  const row = (await query(`UPDATE email_codes SET attempts=attempts+1 WHERE email_hash=$1 AND expires_at>now() AND attempts<$2
    RETURNING code_hash,salt`, [sha(email), MAX_TRIES])).rows[0];
  if (!row) return false;
  const ok = timingSafeEqual(Buffer.from(codeHash(email, code, row.salt)), Buffer.from(row.code_hash));
  if (ok) await query("DELETE FROM email_codes WHERE email_hash=$1", [sha(email)]);
  return ok;
}

/* Verifies the code and signs in, creating the account on first use. */
export async function verifyEmailCode(query, emailValue, codeValue, { req = null, ref = null, allowSignup = config.allowSignup } = {}) {
  const email = normalizeEmail(emailValue);
  if (!email) throw fail(400, "Enter a valid email address.");
  if (!await consumeEmailCode(query, email, codeValue)) {
    await logSecurityEvent(query, { req, email, kind: "email_code_failed" });
    throw fail(401, "That code is not right or has expired. Check the latest email, or send a new code.");
  }
  let account = (await query("SELECT id,email,subscription_status,current_period_end,email_verified_at FROM users WHERE email=$1", [email])).rows[0];
  let created = false;
  if (!account) {
    if (!allowSignup) throw fail(403, "New accounts are not open yet.");
    const creator = normalizeReferralCode(ref);
    account = (await query(`INSERT INTO users(email,password_hash,email_verified_at,signup_ref) VALUES($1,$2,now(),$3)
      ON CONFLICT (email) DO UPDATE SET email_verified_at=COALESCE(users.email_verified_at,now())
      RETURNING id,email,subscription_status,current_period_end,email_verified_at,(xmax=0) AS inserted`,
      [email, NO_PASSWORD + randomBytes(16).toString("hex"), ref || null])).rows[0];
    created = account.inserted === true;
    if (created && creator) await query(`INSERT INTO creator_referrals(user_id,creator_id) SELECT $1,p.id FROM creator_partners p
      WHERE p.code=$2 AND p.status='approved' AND (p.contact_email IS NULL OR lower(p.contact_email)<>$3) ON CONFLICT DO NOTHING`, [account.id, creator, email]);
  } else if (!account.email_verified_at) {
    await query("UPDATE users SET email_verified_at=now() WHERE id=$1", [account.id]);
    account.email_verified_at = new Date();
  }
  const { inserted, ...row } = account;
  await logSecurityEvent(query, { req, userId: row.id, kind: created ? "register" : "login_success", detail: { method: "email_code" } });
  return { user: { id: row.id, email: row.email }, account: row, token: await newSession(row.id), created };
}
