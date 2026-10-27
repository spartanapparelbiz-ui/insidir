/* Who has paid: the billing webhook (app/api/billing/webhook) and the periodic re-check turn Whop memberships into our
 * accounts and plans. Whop is the source of truth for payment; accounts are ours, one per email.
 *
 *   applyBillingEvent  a webhook arrived: find the account (our id in the checkout's metadata, then the Whop user, then
 *                      the email), create it when a payment made a new member, re-read every membership that Whop
 *                      user has, store the best plan and the end of the paid period, and mark the checkout claim so
 *                      the buyer's browser can log in (lib/billing/claims.ts).
 *   refreshPlan        the same re-read for one account (on log-in and every 10 minutes of use).
 *   effectivePlan      what a stored account may use right now: nothing once the paid period has ended, whatever the
 *                      last webhook said. */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { checkoutClaims, DEFAULT_SETTINGS, users } from "@/lib/db/schema";
import type { Plan } from "@/lib/types";
import { fetchMembership, fetchMemberships, fetchPayment, grants, planFrom, planIds, type MembershipLite, type WebhookRef } from "./whop";

export const newUserId = (): string => "usr_" + randomBytes(12).toString("base64url");
export const normEmail = (e: string): string => e.trim().toLowerCase();
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

type UserRow = typeof users.$inferSelect;

/** The plan an account may use right now. A paid plan ends with its paid period unless Whop still says active. */
export function effectivePlan(u: Pick<UserRow, "plan" | "accessUntil" | "membershipStatus">, now = Date.now()): Plan {
  if (u.plan === "free") return "free";
  if (u.accessUntil && u.accessUntil.getTime() <= now && !(u.membershipStatus === "active" || u.membershipStatus === "trialing")) return "free";
  return u.plan;
}

async function store(db: Db, userId: string, list: readonly MembershipLite[], now: number): Promise<Plan> {
  const { plan, membership } = planFrom(list, planIds(), now);
  await db.update(users).set({
    plan, membershipId: membership?.id ?? null, manageUrl: membership?.manageUrl ?? null, membershipStatus: membership?.status ?? null,
    accessUntil: membership?.renewalPeriodEnd ? new Date(membership.renewalPeriodEnd) : null,
    cancelAtPeriodEnd: membership?.cancelAtPeriodEnd ?? false, planCheckedAt: new Date(now),
  }).where(eq(users.id, userId));
  return plan;
}

/** Re-reads the account's memberships from Whop and stores the plan. On a Whop error the stored plan is kept (null). */
export async function refreshPlan(db: Db, userId: string, now = Date.now()): Promise<Plan | null> {
  const u = (await db.select({ whop: users.whopUserId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u?.whop) return null;
  try { return await store(db, userId, await fetchMemberships(u.whop), now); } catch { return null; }
}

async function findUser(db: Db, ref: { userId?: string | null; whopUserId?: string | null; email?: string | null }): Promise<UserRow | null> {
  const by = async (w: ReturnType<typeof eq>) => (await db.select().from(users).where(w).limit(1))[0] ?? null;
  return (ref.userId ? await by(eq(users.id, ref.userId)) : null)
    ?? (ref.whopUserId ? await by(eq(users.whopUserId, ref.whopUserId)) : null)
    ?? (ref.email ? await by(eq(users.email, normEmail(ref.email))) : null);
}

export interface Applied { userId: string | null; plan: Plan | null; created: boolean }

export async function applyBillingEvent(db: Db, type: string, ref: WebhookRef, now = Date.now()): Promise<Applied> {
  let { membershipId, whopUserId, email } = ref;
  const metadata = { ...ref.metadata };
  // A payment or refund names its membership; the API has the rest (email, metadata) when the payload doesn't.
  if (ref.paymentId && (!membershipId || !metadata.insidir_claim)) {
    const p = await fetchPayment(ref.paymentId).catch(() => null);
    if (p) { membershipId ??= p.membershipId; whopUserId ??= p.whopUserId; email ??= p.email; Object.assign(metadata, { ...p.metadata, ...metadata }); }
  }
  let membership: MembershipLite | null = null;
  if (membershipId) membership = await fetchMembership(membershipId).catch(() => null);
  membership ??= ref.membership;
  if (membership) {
    whopUserId ??= membership.user.id; email ??= membership.user.email;
    Object.assign(metadata, { ...membership.metadata, ...metadata });
  }

  let user = await findUser(db, { userId: metadata.insidir_user_id, whopUserId, email });
  let created = false;
  // A new account only for someone who has just paid and whose email we know.
  if (!user && email && membership && grants(membership, now)) {
    const id = newUserId();
    const rows = await db.insert(users).values({ id, email: normEmail(email), name: membership.user.name, whopUserId, settings: DEFAULT_SETTINGS })
      .onConflictDoNothing().returning();
    user = rows[0] ?? await findUser(db, { email });
    created = Boolean(rows[0]);
  }
  if (!user) return { userId: null, plan: null, created: false };

  // Link the Whop user (once) and fill in a missing email.
  const patch: Partial<UserRow> = {};
  if (whopUserId && !user.whopUserId) patch.whopUserId = whopUserId;
  if (email && !user.email) patch.email = normEmail(email);
  if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, user.id)).catch(() => undefined);

  const whop = whopUserId ?? user.whopUserId;
  let list: MembershipLite[] | null = null;
  if (whop) list = await fetchMemberships(whop).catch(() => null);
  const plan = await store(db, user.id, list ?? (membership ? [membership] : []), now);

  if (metadata.insidir_claim) {
    await db.update(checkoutClaims).set({ userId: user.id }).where(and(eq(checkoutClaims.tokenHash, sha256(metadata.insidir_claim)), isNull(checkoutClaims.usedAt)));
  }
  void type;
  return { userId: user.id, plan, created };
}

/** For the admin and tests: how many accounts currently have each plan. */
export async function planCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ plan: users.plan, n: sql<number>`count(*)::int` }).from(users).groupBy(users.plan);
  return Object.fromEntries(rows.map(r => [r.plan, Number(r.n)]));
}
