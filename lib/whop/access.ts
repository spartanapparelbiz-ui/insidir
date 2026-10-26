/* Who may see what, asked of Whop on the server: users.checkAccess(whop_user_id, product). Whop's answer follows
 * renewals, cancellations at period end, refunds and failed payments, so nothing here tracks billing state.
 *
 *   Pro      access to WHOP_PRODUCT_PRO      (gets everything Insidir has: lib/plans.ts)
 *   Insidir  access to WHOP_PRODUCT_INSIDIR
 *   Free     neither (no product; the delayed feed only)
 *
 * Each answer is cached for 60 seconds per user and product. If Whop can't be reached, the last answer is used for
 * up to 15 minutes, then access is refused: an outage never hands out paid data indefinitely. */
import type { Plan } from "@/lib/types";
import { whop } from "./client";
import { whopConfig } from "./config";

export const ACCESS_TTL_MS = 60_000;
export const STALE_ON_ERROR_MS = 15 * 60_000;

export type CheckFn = (whopUserId: string, productId: string) => Promise<boolean>;

interface Entry { has: boolean; at: number }

export interface AccessChecker {
  hasAccess(whopUserId: string, productId: string, opts?: { fresh?: boolean }): Promise<boolean>;
  planFor(whopUserId: string, products: { insidir: string; pro: string }, opts?: { fresh?: boolean }): Promise<Plan>;
  forget(whopUserId: string): void;
}

export function createAccessChecker(check: CheckFn, now: () => number = Date.now): AccessChecker {
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<boolean>>();
  const key = (u: string, p: string) => `${u} ${p}`;

  async function hasAccess(whopUserId: string, productId: string, opts: { fresh?: boolean } = {}): Promise<boolean> {
    if (!whopUserId || !productId) return false;
    const k = key(whopUserId, productId);
    const hit = cache.get(k);
    if (!opts.fresh && hit && now() - hit.at < ACCESS_TTL_MS) return hit.has;
    const running = inflight.get(k);
    if (running) return running;
    const p = check(whopUserId, productId).then(
      has => { cache.set(k, { has, at: now() }); return has; },
      (e: unknown) => {
        const last = cache.get(k);
        console.error(`whop: checkAccess ${whopUserId} ${productId} failed: ${e instanceof Error ? e.message : String(e)}`);
        return Boolean(last && now() - last.at < STALE_ON_ERROR_MS && last.has);
      },
    ).finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  }

  return {
    hasAccess,
    async planFor(whopUserId, products, opts) {
      const [pro, insidir] = await Promise.all([hasAccess(whopUserId, products.pro, opts), hasAccess(whopUserId, products.insidir, opts)]);
      return pro ? "pro" : insidir ? "insidir" : "free";
    },
    forget(whopUserId) {
      for (const k of cache.keys()) if (k.startsWith(whopUserId + " ")) cache.delete(k);
    },
  };
}

const sdkCheck: CheckFn = async (whopUserId, productId) => {
  const r = await whop().users.checkAccess({ id: whopUserId, resource_id: productId });
  return r.has_access === true;
};

const shared = createAccessChecker(sdkCheck);

/** The plan Whop grants this user right now (cached 60 s). `fresh` skips the cache, e.g. just after checkout. */
export const planFor = (whopUserId: string, opts?: { fresh?: boolean }): Promise<Plan> => shared.planFor(whopUserId, whopConfig().products, opts);
/** Drops cached answers for a user, so the next request asks Whop (a webhook said something changed). */
export const forgetAccess = (whopUserId: string): void => shared.forget(whopUserId);
