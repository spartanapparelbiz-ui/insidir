/* Our own sessions: a random token in an httpOnly cookie (30 days), its SHA-256 in terminal.sessions. Server-only. */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { DEFAULT_SETTINGS, sessions, users, type UserSettings } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import type { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { effectivePlan, refreshPlan } from "@/lib/billing/access";
import { isFreeAccess } from "@/lib/billing/free";

export const SESSION_COOKIE = "insidir_session";
export const REGION_COOKIE = "insidir_region";
export const VISITOR_COOKIE = "insidir_vid";
/** A free-access account previewing the site as a logged-out visitor ("visitor"); unset means as themselves. */
export const VIEW_AS_COOKIE = "insidir_view_as";
export const SESSION_DAYS = 30;
/** Ask Whop whether they have access at most this often (the billing webhook and sign-in ask at once in between). */
export const PLAN_REFRESH_MS = 5 * 60_000;

export const hashToken = (t: string): string => createHash("sha256").update(t).digest("hex");

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  plan: Plan;
  region: Region | null;
  settings: UserSettings;
  membershipId: string | null;
  /** The Whop user behind their membership, for reading it back from Whop. */
  whopUserId: string | null;
  manageUrl: string | null;
  cancelAtPeriodEnd: boolean;
  onboarded: boolean;
  /** On the owner's free-access list (lib/billing/free.ts). */
  freeAccess: boolean;
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDb().insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt: expires });
  return { token, expires };
}

/** The session cookie: httpOnly, Secure on https, 30 days. */
export function setSessionCookie(res: NextResponse, token: string, expires: Date): void {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", expires });
}

export async function deleteSession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !hasDatabase()) return null;
  const db = getDb();
  const rows = await db.select({ u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  const row = rows[0];
  if (!row) return null;
  let u = row.u;
  if (u.whopUserId && (!u.planCheckedAt || Date.now() - u.planCheckedAt.getTime() > PLAN_REFRESH_MS)) {
    await refreshPlan(db, u.id);
    u = (await db.select().from(users).where(eq(users.id, u.id)).limit(1))[0] ?? u;
  }
  return {
    id: u.id, name: u.name ?? u.username, email: u.email, plan: effectivePlan(u), region: u.region, settings: { ...DEFAULT_SETTINGS, ...u.settings },
    membershipId: u.membershipId, whopUserId: u.whopUserId, manageUrl: u.manageUrl, cancelAtPeriodEnd: u.cancelAtPeriodEnd, onboarded: Boolean(u.onboardedAt),
    freeAccess: isFreeAccess(u.email),
  };
}
