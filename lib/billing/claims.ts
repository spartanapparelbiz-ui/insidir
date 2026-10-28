/* Sign-up is paying: /start takes an email, keeps it next to a random token, puts the token in an httpOnly cookie and
 * in the checkout's metadata (Whop copies it onto the payment). The billing webhook makes the account once the
 * payment lands and writes it next to the token's hash; /welcome asks /api/checkout/claim, which trades the cookie
 * for a session once, and only once. */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { checkoutClaims } from "@/lib/db/schema";
import { sha256 } from "@/lib/hash";

export const CLAIM_COOKIE = "insidir_claim";
export const CLAIM_MAX_AGE_S = 2 * 3600;

export async function newClaim(db: Db, signup: { email?: string | null } = {}): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(checkoutClaims).values({ tokenHash: sha256(token), email: signup.email ?? null });
  return token;
}

/** What /start kept for a checkout (the email it will make the account with). */
export async function claimSignup(db: Db, token: string): Promise<{ email: string | null } | null> {
  const r = (await db.select({ email: checkoutClaims.email }).from(checkoutClaims).where(eq(checkoutClaims.tokenHash, sha256(token))).limit(1))[0];
  return r ?? null;
}

/** The account a finished checkout paid for, once: marks the claim used. Null until the webhook has arrived. */
export async function redeemClaim(db: Db, token: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const rows = await db.update(checkoutClaims).set({ usedAt: new Date(now) })
    .where(and(eq(checkoutClaims.tokenHash, sha256(token)), isNotNull(checkoutClaims.userId), isNull(checkoutClaims.usedAt),
      gt(checkoutClaims.createdAt, new Date(now - CLAIM_MAX_AGE_S * 1000))))
    .returning({ userId: checkoutClaims.userId });
  return rows[0]?.userId ?? null;
}
