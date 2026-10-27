/* Insidir's own log-in: an email, then a 6-digit code sent to it. Members only: an email without an active plan gets
 * "No active plan" and no code. Server-only.
 *
 *   Codes: 6 random digits, stored only as a hash, valid 10 minutes, 5 wrong tries and it's dead; a new code replaces
 *   any older one. Rate limits, counted from the codes table: 5 codes per email and 20 per IP address per hour
 *   (requests for an email without a plan count too, so nobody can probe emails quickly). */
import { randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { loginCodes, users } from "@/lib/db/schema";
import { renderEmail, sendEmail } from "@/lib/alerts/send";
import { appUrl } from "@/lib/app-url";
import { effectivePlan, normEmail, refreshPlan, sha256 } from "@/lib/billing/access";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_TRIES = 5;
export const LIMITS = { perEmail: 5, perIp: 20, windowMs: 60 * 60_000 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const validEmail = (e: string): boolean => e.length <= 254 && EMAIL.test(e);
const hashCode = (email: string, code: string): string => sha256(`login:${email}:${code}`);

export type RequestResult = { ok: true } | { ok: false; reason: "invalid" | "rate_limited" | "no_plan" | "send_failed" };

/** Members with a paid plan right now, re-checked with Whop when the stored plan says no (a missed webhook). */
async function memberByEmail(db: Db, email: string, now: number): Promise<{ id: string } | null> {
  const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!u) return null;
  if (effectivePlan(u, now) !== "free") return u;
  const fresh = await refreshPlan(db, u.id, now);
  return fresh && fresh !== "free" ? u : null;
}

export async function requestCode(db: Db, rawEmail: string, ip: string | null, now = Date.now()): Promise<RequestResult> {
  const email = normEmail(rawEmail);
  if (!validEmail(email)) return { ok: false, reason: "invalid" };
  const since = new Date(now - LIMITS.windowMs);
  const [byEmail, byIp] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(loginCodes).where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, since))),
    ip ? db.select({ n: sql<number>`count(*)::int` }).from(loginCodes).where(and(eq(loginCodes.ip, ip), gt(loginCodes.createdAt, since))) : Promise.resolve([{ n: 0 }]),
  ]);
  if (Number(byEmail[0]?.n) >= LIMITS.perEmail || Number(byIp[0]?.n) >= LIMITS.perIp) return { ok: false, reason: "rate_limited" };

  const member = await memberByEmail(db, email, now);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Older codes for this email stop working; the request is recorded either way (it counts toward the limits).
  await db.update(loginCodes).set({ usedAt: new Date(now) }).where(and(eq(loginCodes.email, email), isNull(loginCodes.usedAt)));
  await db.insert(loginCodes).values({ email, ip, codeHash: member ? hashCode(email, code) : "-", expiresAt: new Date(now + CODE_TTL_MS),
    usedAt: member ? null : new Date(now), createdAt: new Date(now) });
  if (!member) return { ok: false, reason: "no_plan" };

  const body = renderEmail({ heading: "Your Insidir log-in code", big: code, lines: [
    { text: "Type this code on the log-in page. It works for 10 minutes." },
    { text: "If you didn't ask for it, you can ignore this email: nobody can log in without the code." },
  ] });
  const sent = await sendEmail({ to: email, subject: `${code} is your Insidir log-in code`, ...body });
  return sent === "sent" ? { ok: true } : { ok: false, reason: "send_failed" };
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "wrong" | "locked" | "no_plan"; triesLeft?: number };

export async function verifyCode(db: Db, rawEmail: string, rawCode: string, now = Date.now()): Promise<VerifyResult> {
  const email = normEmail(rawEmail), code = rawCode.replace(/\D/g, "");
  if (!validEmail(email) || code.length !== 6) return { ok: false, reason: "invalid" };
  const row = (await db.select().from(loginCodes).where(and(eq(loginCodes.email, email), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date(now))))
    .orderBy(desc(loginCodes.createdAt)).limit(1))[0];
  if (!row) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_TRIES) return { ok: false, reason: "locked" };
  const a = Buffer.from(hashCode(email, code)), b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const attempts = row.attempts + 1;
    await db.update(loginCodes).set({ attempts, ...(attempts >= MAX_TRIES ? { usedAt: new Date(now) } : {}) }).where(eq(loginCodes.id, row.id));
    return attempts >= MAX_TRIES ? { ok: false, reason: "locked" } : { ok: false, reason: "wrong", triesLeft: MAX_TRIES - attempts };
  }
  // One use only, even if two requests race.
  const used = await db.update(loginCodes).set({ usedAt: new Date(now) }).where(and(eq(loginCodes.id, row.id), isNull(loginCodes.usedAt))).returning({ id: loginCodes.id });
  if (!used.length) return { ok: false, reason: "expired" };
  const member = await memberByEmail(db, email, now);
  return member ? { ok: true, userId: member.id } : { ok: false, reason: "no_plan" };
}

/** Where a log-in may land: same-site paths only. */
export const safeNext = (next: string | null | undefined, fallback = "/feed"): string =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;

export const loginUrl = (next?: string): string => `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
export { appUrl };
