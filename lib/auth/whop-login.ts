/* Log in = Whop's sign-in (Google, Apple or email), OAuth 2.1 + PKCE run on the server. No passwords anywhere.
 * Our own addresses never name the provider: /login/start sends them off, /login/callback brings them back.
 *
 *   The login app: WHOP_CLIENT_ID, else the one `npm run whop:setup` made (redirect URI <APP_URL>/login/callback);
 *   WHOP_CLIENT_SECRET is sent on the token exchange. Nothing from Whop is kept: the access token is used once to
 *   read who they are, and the refresh token is revoked straight away.
 *   Who gets in: the account linked to that Whop user, else the one with that email, when it has an active plan or
 *   is on FREE_ACCESS_EMAILS (a free-access email with no account yet gets one). Anyone else: "No Insidir membership".
 *   Rate limit: 30 sign-ins per IP address every 15 minutes (terminal.login_attempts).
 *   Logs one line per sign-in, never a token or an email: "login: signed in (member)", "login: no membership",
 *   "login: token exchange failed (400 invalid_grant: Authorization code has expired)". */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, loginAttempts, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";
import { whopRuntime } from "@/lib/billing/config";
import { effectivePlan, newUserId, normEmail, refreshPlan } from "@/lib/billing/access";
import { isFreeAccess } from "@/lib/billing/free";

const OAUTH = () => `${(process.env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "")}/oauth`;
export const LOGIN_COOKIE = "insidir_login";
/** After "No Insidir membership": which email Whop signed them in as, for the message (10 minutes, httpOnly). */
export const NO_PLAN_COOKIE = "insidir_no_plan";
export const LIMIT = { perIp: 30, windowMs: 15 * 60_000 } as const;
export const redirectUri = (): string => appUrl() + "/login/callback";
const clientId = async (): Promise<string> => (await whopRuntime()).clientId ?? "";
export const loginConfigured = async (): Promise<boolean> => Boolean(await clientId());

const b64url = (b: Buffer): string => b.toString("base64url");
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
async function json(res: Response): Promise<Record<string, unknown>> {
  const b: unknown = await res.json().catch(() => null);
  return typeof b === "object" && b && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}
export const logLine = (line: string): void => console.log(`login: ${line}`);

/** The authorize URL plus what the callback needs back (state and PKCE verifier, kept in an httpOnly cookie).
 *  `fresh` asks Whop to sign in again rather than reuse its session ("Use a different account"). */
export async function startLogin(fresh = false): Promise<{ url: string; state: string; verifier: string }> {
  const verifier = b64url(randomBytes(32)), state = b64url(randomBytes(16));
  const q = new URLSearchParams({
    response_type: "code", client_id: await clientId(), redirect_uri: redirectUri(), scope: "openid profile email", state,
    nonce: b64url(randomBytes(16)), code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    ...(fresh ? { prompt: "login" } : {}),
  });
  return { url: `${OAUTH()}/authorize?${q}`, state, verifier };
}

export class LoginFailed extends Error {}

/** Code → who they are at Whop (user id and email). On failure, logs the endpoint's status and error, nothing else. */
export async function finishLogin(code: string, verifier: string, f: typeof fetch = fetch): Promise<{ id: string; email: string | null }> {
  const secret = process.env.WHOP_CLIENT_SECRET ?? "";
  const res = await f(`${OAUTH()}/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: await clientId(), code_verifier: verifier,
      ...(secret ? { client_secret: secret } : {}) }),
  });
  const tokens = await json(res);
  const access = str(tokens.access_token);
  if (!res.ok || !access) {
    const why = [str(tokens.error), str(tokens.error_description)].filter(Boolean).join(": ").slice(0, 200) || "no access token";
    logLine(`token exchange failed (${res.status} ${why})`);
    throw new LoginFailed("token");
  }
  const ures = await f(`${OAUTH()}/userinfo`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) });
  const info = await json(ures);
  const id = str(info.sub);
  if (!ures.ok || !id) {
    logLine(`userinfo failed (${ures.status} ${[str(info.error), str(info.error_description)].filter(Boolean).join(": ").slice(0, 200)})`);
    throw new LoginFailed("userinfo");
  }
  const refresh = str(tokens.refresh_token);
  if (refresh) void f(`${OAUTH()}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: refresh, client_id: await clientId() }), signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  return { id, email: str(info.email) };
}

export async function rateLimited(db: Db, ip: string | null, now = Date.now()): Promise<boolean> {
  if (!ip) return false;
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, new Date(now - LIMIT.windowMs))));
  return Number(r[0]?.n) >= LIMIT.perIp;
}

export type LoginOutcome = { ok: true; userId: string; why: "member" | "free access" } | { ok: false; email: string | null };

/** Who just signed in at Whop → our account, if they may come in. Links the Whop user to an account found by email. */
export async function signInAs(db: Db, who: { id: string; email: string | null }, ip: string | null, now = Date.now()): Promise<LoginOutcome> {
  const email = who.email ? normEmail(who.email) : null;
  let u = (await db.select().from(users).where(eq(users.whopUserId, who.id)).limit(1))[0];
  if (!u && email) {
    const byEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    // An account linked to a different Whop user isn't theirs.
    if (byEmail && (!byEmail.whopUserId || byEmail.whopUserId === who.id)) {
      u = byEmail;
      if (!byEmail.whopUserId) await db.update(users).set({ whopUserId: who.id }).where(eq(users.id, byEmail.id));
    }
  }
  // A free-access email Whop has just confirmed, with no account yet: one is made.
  if (!u && email && isFreeAccess(email)) {
    const made = await db.insert(users).values({ id: newUserId(), email, whopUserId: who.id, settings: DEFAULT_SETTINGS }).onConflictDoNothing().returning();
    u = made[0];
  }
  const record = (ok: boolean) => db.insert(loginAttempts).values({ email: email ?? `whop:${who.id}`, ip, ok, createdAt: new Date(now) });
  if (!u) { await record(false); return { ok: false, email }; }
  let paid = effectivePlan(u, now) !== "free";
  if (!paid && !isFreeAccess(u.email)) {
    // The webhook may not have caught up: ask Whop.
    const fresh = await refreshPlan(db, u.id, now).catch(() => null);
    paid = Boolean(fresh && fresh !== "free");
  }
  if (!paid && !isFreeAccess(u.email)) { await record(false); return { ok: false, email: email ?? u.email }; }
  await record(true);
  return { ok: true, userId: u.id, why: paid && !isFreeAccess(u.email) ? "member" : "free access" };
}
