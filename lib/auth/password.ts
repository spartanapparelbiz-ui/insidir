/* Insidir's own log-in: email and password, members only. Server-only.
 *
 *   Passwords: at least 8 characters, hashed with Node's built-in scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte
 *   key), stored as "scrypt$N$r$p$salt$hash" and compared in constant time.
 *   Rate limits, counted from login_attempts: 10 tries per email and 30 per IP address every 15 minutes.
 *   A right password without an active plan gets "no_plan" (the way back in is Get Insidir); an account without a
 *   password (made with Google) is told to use "Continue with Google". Forgotten passwords are reset by hand
 *   (hello@aethric.llc). */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { loginAttempts, users } from "@/lib/db/schema";
import { effectivePlan, normEmail, refreshPlan } from "@/lib/billing/access";

export const MIN_PASSWORD = 8;
export const LIMITS = { perEmail: 10, perIp: 30, windowMs: 15 * 60_000 } as const;
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEYLEN = 64;

const scrypt = (pw: string, salt: Buffer, o: ScryptOptions): Promise<Buffer> =>
  new Promise((ok, fail) => scryptCb(pw.normalize("NFKC"), salt, KEYLEN, { ...o, maxmem: 128 * o.N! * o.r! * 2 }, (e, k) => (e ? fail(e) : ok(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) }).catch(() => null);
  return Boolean(got && got.length === want.length && timingSafeEqual(got, want));
}

export { safeNext, validEmail } from "./next";
import { validEmail } from "./next";
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "That password is too long.";
  return null;
}

export type LoginResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "rate_limited" | "wrong" | "no_password" | "no_plan" };

export async function logIn(db: Db, rawEmail: string, password: string, ip: string | null, now = Date.now()): Promise<LoginResult> {
  const email = normEmail(rawEmail);
  if (!validEmail(email) || !password) return { ok: false, reason: "invalid" };
  const since = new Date(now - LIMITS.windowMs);
  const [byEmail, byIp] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.email, email), gt(loginAttempts.createdAt, since))),
    ip ? db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since))) : Promise.resolve([{ n: 0 }]),
  ]);
  if (Number(byEmail[0]?.n) >= LIMITS.perEmail || Number(byIp[0]?.n) >= LIMITS.perIp) return { ok: false, reason: "rate_limited" };

  const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  // The same work whether or not the email exists, so timing says nothing about who has an account.
  const right = await verifyPassword(password, u?.passwordHash ?? "scrypt$32768$8$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  await db.insert(loginAttempts).values({ email, ip, ok: right, createdAt: new Date(now) });
  if (u && !u.passwordHash) return { ok: false, reason: "no_password" };
  if (!u || !right) return { ok: false, reason: "wrong" };
  if (effectivePlan(u, now) !== "free") return { ok: true, userId: u.id };
  const fresh = await refreshPlan(db, u.id, now);
  return fresh && fresh !== "free" ? { ok: true, userId: u.id } : { ok: false, reason: "no_plan" };
}
