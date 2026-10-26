/* Our own sessions: a random token in an httpOnly cookie, its SHA-256 in terminal.sessions. Server-only.
 * Every lookup asks Whop what the user may see (users.checkAccess, cached 60 s in lib/whop/access.ts). */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, ne } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { DEFAULT_SETTINGS, sessions, users, type UserSettings } from "@/lib/db/schema";
import type { Plan, Region } from "@/lib/types";
import { planFor } from "@/lib/whop/access";
import type { WhopProfile } from "@/lib/whop/oauth";

export const SESSION_COOKIE = "insidir_session";
export const REGION_COOKIE = "insidir_region";
export const VISITOR_COOKIE = "insidir_vid";
export const SESSION_DAYS = 30;

export const hashToken = (t: string): string => createHash("sha256").update(t).digest("hex");

export interface SessionUser {
  /** Ours: sessions, settings, checkout metadata `customer_id`. */
  id: string;
  whopUserId: string;
  whopUsername: string | null;
  name: string | null;
  email: string | null;
  plan: Plan;
  region: Region | null;
  settings: UserSettings;
  onboarded: boolean;
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

/** Creates or updates the user after Sign in with Whop. Returns our user id. */
export async function upsertUser(p: WhopProfile, extras: { visitorId?: string | null; utm?: Record<string, string> | null; region?: Region | null }): Promise<string> {
  const rows = await getDb().insert(users).values({
    id: randomUUID(), whopUserId: p.whopUserId, whopUsername: p.username, email: p.email, name: p.name,
    visitorId: extras.visitorId ?? null, utm: extras.utm ?? null, region: extras.region ?? null, settings: DEFAULT_SETTINGS,
  }).onConflictDoUpdate({ target: users.whopUserId, set: { email: p.email, name: p.name, whopUsername: p.username } }).returning({ id: users.id });
  const id = rows[0]!.id;
  await syncPlan(p.whopUserId, { fresh: true });
  return id;
}

/** Asks Whop for the user's plan and keeps the copy in users.plan current. Writes only when the plan changed
 *  (`stored` is the copy the caller already read, to skip even the no-op update). */
export async function syncPlan(whopUserId: string, opts: { fresh?: boolean; stored?: Plan } = {}): Promise<Plan> {
  const plan = await planFor(whopUserId, { fresh: opts.fresh });
  if (plan !== opts.stored) {
    await getDb().update(users).set({ plan, planCheckedAt: new Date() }).where(and(eq(users.whopUserId, whopUserId), ne(users.plan, plan)));
  }
  return plan;
}

/** The signed-in user, with the plan Whop grants right now. `freshAccess` skips the 60 s cache (just after checkout). */
export async function userForToken(token: string | undefined, opts: { freshAccess?: boolean } = {}): Promise<SessionUser | null> {
  if (!token || !hasDatabase()) return null;
  const rows = await getDb().select({ u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  const u = rows[0]?.u;
  if (!u) return null;
  const plan = await syncPlan(u.whopUserId, { fresh: opts.freshAccess, stored: u.plan });
  return {
    id: u.id, whopUserId: u.whopUserId, whopUsername: u.whopUsername, name: u.name ?? u.whopUsername, email: u.email, plan, region: u.region,
    settings: { ...DEFAULT_SETTINGS, ...u.settings }, onboarded: Boolean(u.onboardedAt),
  };
}
