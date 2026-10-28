/* "Forgot password?" without sending any email: the member confirms it's them by signing in to the payment account
 * that holds their membership (Whop, OAuth 2.1 + PKCE, run on the server), and then sets a new password on /reset.
 * Our own addresses never name the provider: /reset/confirm starts it, /reset/callback finishes it.
 *
 *   Env: WHOP_CLIENT_ID (app_…; the OAuth app's redirect URI is https://insidir.com/reset/callback) and, optionally,
 *   WHOP_CLIENT_SECRET. Nothing from the provider is kept: the access token is used once to read who they are, and
 *   the refresh token is revoked straight away. */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { passwordResets, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";
import { normEmail, sha256 } from "@/lib/billing/access";

const OAUTH = `${(process.env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "")}/oauth`;
const env = (k: string): string => process.env[k] ?? "";
export const RESET_COOKIE = "insidir_reset";
export const CONFIRM_COOKIE = "insidir_confirm";
export const RESET_TTL_MS = 15 * 60_000;
export const redirectUri = (): string => appUrl() + "/reset/callback";
export const resetConfigured = (): boolean => Boolean(env("WHOP_CLIENT_ID"));

const b64url = (b: Buffer): string => b.toString("base64url");

export function startConfirm(): { url: string; state: string; verifier: string } {
  const verifier = b64url(randomBytes(32)), state = b64url(randomBytes(16));
  const q = new URLSearchParams({
    response_type: "code", client_id: env("WHOP_CLIENT_ID"), redirect_uri: redirectUri(), scope: "openid profile email", state,
    nonce: b64url(randomBytes(16)), code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
  });
  return { url: `${OAUTH}/authorize?${q}`, state, verifier };
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
async function json(res: Response): Promise<Record<string, unknown>> {
  const b: unknown = await res.json().catch(() => null);
  return typeof b === "object" && b && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** Code → who they are at the payment provider (their user id and email). */
export async function finishConfirm(code: string, verifier: string): Promise<{ id: string; email: string | null }> {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: env("WHOP_CLIENT_ID"), code_verifier: verifier,
      ...(env("WHOP_CLIENT_SECRET") ? { client_secret: env("WHOP_CLIENT_SECRET") } : {}) }),
  });
  const tokens = await json(res);
  const access = str(tokens.access_token);
  if (!res.ok || !access) throw new Error(`confirm failed (${res.status})`);
  const info = await json(await fetch(`${OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) }));
  const id = str(info.sub);
  if (!id) throw new Error("confirm returned no user");
  const refresh = str(tokens.refresh_token);
  if (refresh) void fetch(`${OAUTH}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: refresh, client_id: env("WHOP_CLIENT_ID") }), signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  return { id, email: str(info.email) };
}

/** Our account for the person who just confirmed: by the Whop user linked to it, else by email. */
export async function accountFor(db: Db, who: { id: string; email: string | null }): Promise<string | null> {
  const byWhop = (await db.select({ id: users.id }).from(users).where(eq(users.whopUserId, who.id)).limit(1))[0];
  if (byWhop) return byWhop.id;
  if (!who.email) return null;
  const byEmail = (await db.select({ id: users.id, whop: users.whopUserId }).from(users).where(eq(users.email, normEmail(who.email))).limit(1))[0];
  // An account already linked to a different payment account is not theirs to reset.
  return byEmail && !byEmail.whop ? byEmail.id : null;
}

export async function newReset(db: Db, userId: string, now = Date.now()): Promise<string> {
  const token = b64url(randomBytes(24));
  await db.insert(passwordResets).values({ tokenHash: sha256(token), userId, expiresAt: new Date(now + RESET_TTL_MS) });
  return token;
}

/** The account a reset token is for, while it's fresh and unused. */
export async function resetUser(db: Db, token: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const r = (await db.select({ userId: passwordResets.userId }).from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date(now)))).limit(1))[0];
  return r?.userId ?? null;
}

/** Uses up a reset token (once). */
export async function useReset(db: Db, token: string, now = Date.now()): Promise<string | null> {
  const r = await db.update(passwordResets).set({ usedAt: new Date(now) })
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date(now))))
    .returning({ userId: passwordResets.userId });
  return r[0]?.userId ?? null;
}
