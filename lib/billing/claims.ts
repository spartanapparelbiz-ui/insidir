/* Logging a buyer in the moment their payment lands. /start puts a random token in an httpOnly cookie and in the
 * checkout's metadata (Whop copies it onto the payment); the billing webhook writes which account paid next to the
 * token's hash; /welcome asks /api/checkout/claim, which trades the cookie for a session once, and only once. */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { checkoutClaims } from "@/lib/db/schema";
import { sha256 } from "./access";

export const CLAIM_COOKIE = "insidir_claim";
export const CLAIM_MAX_AGE_S = 2 * 3600;

export async function newClaim(db: Db): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(checkoutClaims).values({ tokenHash: sha256(token) });
  return token;
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
