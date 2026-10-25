/* Our own sessions: a random token in an httpOnly cookie, its SHA-256 in terminal.sessions. Server-only. */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { DEFAULT_SETTINGS, sessions, users, type UserSettings } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { fetchMemberships, planFrom, planIds, type WhopUser } from "./whop";

export const SESSION_COOKIE = "insidir_session";
export const REGION_COOKIE = "insidir_region";
export const VISITOR_COOKIE = "insidir_vid";
export const SESSION_DAYS = 30;
/** Re-read the plan from Whop at most this often (webhooks update it in between). */
export const PLAN_REFRESH_MS = 10 * 60_000;

export const hashToken = (t: string): string => createHash("sha256").update(t).digest("hex");

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  plan: Plan;
  region: Region | null;
  settings: UserSettings;
  membershipId: string | null;
  manageUrl: string | null;
  cancelAtPeriodEnd: boolean;
  onboarded: boolean;
  telegramLinked: boolean;
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDb().insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt: expires });
  return { token, expires };
}

export async function deleteSession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Creates or updates the user after Whop sign-in and reads their plan. */
export async function upsertUser(u: WhopUser, extras: { visitorId?: string | null; utm?: Record<string, string> | null; region?: Region | null }): Promise<void> {
  const db = getDb();
  await db.insert(users).values({
    id: u.id, email: u.email, name: u.name, username: u.username, visitorId: extras.visitorId ?? null, utm: extras.utm ?? null,
    region: extras.region ?? null, settings: DEFAULT_SETTINGS,
  }).onConflictDoUpdate({ target: users.id, set: { email: u.email, name: u.name, username: u.username } });
  await refreshPlan(u.id);
}

/** Reads the user's memberships from Whop and stores the plan. On a Whop error the stored plan is kept. */
export async function refreshPlan(userId: string): Promise<Plan | null> {
  try {
    const { plan, membership } = planFrom(await fetchMemberships(userId), planIds());
    await getDb().update(users).set({
      plan, membershipId: membership?.id ?? null, manageUrl: membership?.manageUrl ?? null,
      cancelAtPeriodEnd: membership?.cancelAtPeriodEnd ?? false, planCheckedAt: new Date(),
    }).where(eq(users.id, userId));
    return plan;
  } catch {
    return null;
  }
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !hasDatabase()) return null;
  const db = getDb();
  const rows = await db.select({ u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  const row = rows[0];
  if (!row) return null;
  let u = row.u;
  if (!u.planCheckedAt || Date.now() - u.planCheckedAt.getTime() > PLAN_REFRESH_MS) {
    const plan = await refreshPlan(u.id);
    if (plan) u = { ...u, plan };
  }
  return {
    id: u.id, name: u.name ?? u.username, email: u.email, plan: u.plan, region: u.region, settings: { ...DEFAULT_SETTINGS, ...u.settings },
    membershipId: u.membershipId, manageUrl: u.manageUrl, cancelAtPeriodEnd: u.cancelAtPeriodEnd, onboarded: Boolean(u.onboardedAt),
    telegramLinked: Boolean(u.telegramChatId),
  };
}
