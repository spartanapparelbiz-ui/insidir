/* Who is a member. Whop is the source of truth: its access check for WHOP_PRODUCT_INSIDIR (users.checkAccess),
 * read at most every 5 minutes per account (lib/auth/session.ts) and at once on sign-in and on every billing webhook
 * (membership activated, deactivated, …). FREE_ACCESS_EMAILS are members without paying.
 *
 *   applyBillingEvent  a webhook arrived: find the account (our id in the checkout's metadata, then the Whop user, then
 *                      the email), make one for a buyer who paid signed out, link the Whop user, re-read their access.
 *   refreshPlan        the access check (and their memberships, for the dates the account page shows), stored.
 *   effectivePlan      what a stored account may use right now. */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, users } from "@/lib/db/schema";
import type { Plan } from "@/lib/types";
import { isFreeAccess } from "./free";
import { checkAccess, fetchMembership, fetchMemberships, fetchPayment, grants, planFrom, planIds, type MembershipLite, type WebhookRef } from "./whop";

export const newUserId = (): string => "usr_" + randomBytes(12).toString("base64url");
export const normEmail = (e: string): string => e.trim().toLowerCase();
export { sha256 } from "@/lib/hash";

type UserRow = typeof users.$inferSelect;

/** The plan an account may use right now. A paid plan ends with its paid period unless Whop still says active. An
 *  email on the owner's free-access list (./free.ts) is a full member whatever Whop says. */
export function effectivePlan(u: Pick<UserRow, "plan" | "accessUntil" | "membershipStatus"> & { email?: string | null }, now = Date.now()): Plan {
  if (isFreeAccess(u.email)) return "insidir";
  if (u.plan === "free") return "free";
  if (u.accessUntil && u.accessUntil.getTime() <= now && !(u.membershipStatus === "active" || u.membershipStatus === "trialing")) return "free";
  return u.plan;
}

/** Stores what Whop says: the access check decides the plan; memberships (when they could be read) give the dates. */
async function store(db: Db, userId: string, list: readonly MembershipLite[] | null, has: boolean | null, now: number): Promise<Plan> {
  const { plan: fromMemberships, membership } = planFrom(list ?? [], planIds(), now);
  const plan: Plan = has === null ? fromMemberships : has ? "insidir" : "free";
  const end = membership?.renewalPeriodEnd ?? null;
  await db.update(users).set({
    plan, ...(list ? { membershipId: membership?.id ?? null, manageUrl: membership?.manageUrl ?? null, membershipStatus: membership?.status ?? null,
      cancelAtPeriodEnd: membership?.cancelAtPeriodEnd ?? false } : {}),
    // Whop says they have access: never let an old period end take it away before the next check.
    accessUntil: has && (!end || end <= now) ? null : end !== null ? new Date(end) : null,
    planCheckedAt: new Date(now),
  }).where(eq(users.id, userId));
  return plan;
}

/** Asks Whop now and stores the plan. On a Whop error the stored plan is kept (null). */
export async function refreshPlan(db: Db, userId: string, now = Date.now()): Promise<Plan | null> {
  const u = (await db.select({ whop: users.whopUserId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u?.whop) return null;
  const product = planIds().insidirProduct;
  const [has, list] = await Promise.all([product ? checkAccess(u.whop, product).catch(() => null) : Promise.resolve(null), fetchMemberships(u.whop).catch(() => null)]);
  if (has === null && list === null) return null;
  return store(db, userId, list, has, now);
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
  if (ref.paymentId && (!membershipId || !metadata.insidir_user_id)) {
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
  // A buyer who paid signed out: an account for their Whop user, so signing in with Whop finds it.
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
  const product = planIds().insidirProduct;
  const [has, list] = whop ? await Promise.all([product ? checkAccess(whop, product).catch(() => null) : Promise.resolve(null), fetchMemberships(whop).catch(() => null)]) : [null, null];
  const plan = await store(db, user.id, list ?? (membership ? [membership] : []), has, now);
  void type;
  return { userId: user.id, plan, created };
}

/** For the admin and tests: how many accounts currently have each plan. */
export async function planCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ plan: users.plan, n: sql<number>`count(*)::int` }).from(users).groupBy(users.plan);
  return Object.fromEntries(rows.map(r => [r.plan, Number(r.n)]));
}
