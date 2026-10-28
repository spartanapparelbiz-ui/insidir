/* "Continue with Google": our own Google OAuth (authorization code + PKCE, run on the server; scopes openid email
 * profile). No auth vendor. /login/google sends them off, /login/google/callback brings them back.
 *   Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Redirect URI: <APP_URL>/login/google/callback.
 *   Nothing from Google is kept but their Google id ("sub") and verified email: the access token is used once.
 *   Who gets in: the account linked to that Google id, else the one with that verified email (then linked), when it
 *   has an active plan or is on FREE_ACCESS_EMAILS (a free-access email with no account yet gets one). Anyone else
 *   is offered the trial: their Google account goes with them to /start, and the checkout uses their Google email.
 *   Rate limit: 30 sign-ins per IP address every 15 minutes (terminal.login_attempts).
 *   Logs one line per sign-in, never a token or an email: "google login: signed in (member)", "google login: no
 *   membership", "google login: token exchange failed (400 invalid_grant: Bad Request)". */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, loginAttempts, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";
import { effectivePlan, newUserId, normEmail, refreshPlan } from "@/lib/billing/access";
import { isFreeAccess } from "@/lib/billing/free";

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const USERINFO_URL = () => process.env.GOOGLE_USERINFO_URL ?? "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_COOKIE = "insidir_google";
/** After "No Insidir membership": which email Google signed them in as, for the message (10 minutes, httpOnly). */
export const NO_PLAN_COOKIE = "insidir_no_plan";
export const LIMIT = { perIp: 30, windowMs: 15 * 60_000 } as const;
export const redirectUri = (): string => appUrl() + "/login/google/callback";
export const googleConfigured = (): boolean => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const b64url = (b: Buffer): string => b.toString("base64url");
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
async function json(res: Response): Promise<Record<string, unknown>> {
  const b: unknown = await res.json().catch(() => null);
  return typeof b === "object" && b && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}
export const logLine = (line: string): void => console.log(`google login: ${line}`);
const why = (status: number, b: Record<string, unknown>) => `${status} ${[str(b.error), str(b.error_description)].filter(Boolean).join(": ").slice(0, 200) || "no details"}`;

/** Google's consent URL plus what the callback needs back (state and PKCE verifier, kept in an httpOnly cookie). */
export function startGoogle(): { url: string; state: string; verifier: string } {
  const verifier = b64url(randomBytes(32)), state = b64url(randomBytes(16));
  const q = new URLSearchParams({
    response_type: "code", client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: redirectUri(), scope: "openid email profile", state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", prompt: "select_account",
  });
  return { url: `${AUTH_URL()}?${q}`, state, verifier };
}

export class LoginFailed extends Error {}
export interface GoogleUser { id: string; email: string | null; verified: boolean }

/** Code → who they are at Google. On failure, logs the endpoint's status and error, nothing else. */
export async function finishGoogle(code: string, verifier: string, f: typeof fetch = fetch): Promise<GoogleUser> {
  const res = await f(TOKEN_URL(), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "" }).toString(),
  });
  const tokens = await json(res);
  const access = str(tokens.access_token);
  if (!res.ok || !access) { logLine(`token exchange failed (${why(res.status, tokens)})`); throw new LoginFailed("token"); }
  const ures = await f(USERINFO_URL(), { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) });
  const info = await json(ures);
  const id = str(info.sub);
  if (!ures.ok || !id) { logLine(`userinfo failed (${why(ures.status, info)})`); throw new LoginFailed("userinfo"); }
  return { id, email: str(info.email), verified: info.email_verified === true || info.email_verified === "true" };
}

export async function rateLimited(db: Db, ip: string | null, now = Date.now()): Promise<boolean> {
  if (!ip) return false;
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, new Date(now - LIMIT.windowMs))));
  return Number(r[0]?.n) >= LIMIT.perIp;
}

export type GoogleOutcome = { ok: true; userId: string; why: "member" | "free access" } | { ok: false; email: string | null };

/** Who just signed in with Google → our account, if they may come in. Links the Google id to an account found by
 *  verified email. */
export async function signInWithGoogle(db: Db, who: GoogleUser, ip: string | null, now = Date.now()): Promise<GoogleOutcome> {
  const email = who.email && who.verified ? normEmail(who.email) : null;
  let u = (await db.select().from(users).where(eq(users.googleId, who.id)).limit(1))[0];
  if (!u && email) {
    const byEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    // An account linked to a different Google account isn't theirs.
    if (byEmail && (!byEmail.googleId || byEmail.googleId === who.id)) {
      u = byEmail;
      if (!byEmail.googleId) await db.update(users).set({ googleId: who.id }).where(eq(users.id, byEmail.id));
    }
  }
  // A free-access email Google has just verified, with no account yet: one is made.
  if (!u && email && isFreeAccess(email)) {
    u = (await db.insert(users).values({ id: newUserId(), email, googleId: who.id, settings: DEFAULT_SETTINGS }).onConflictDoNothing().returning())[0];
  }
  const record = (ok: boolean) => db.insert(loginAttempts).values({ email: email ?? `google:${who.id}`, ip, ok, createdAt: new Date(now) });
  if (!u) { await record(false); return { ok: false, email }; }
  const free = isFreeAccess(u.email);
  // Paid on its own (not counting the free-access list).
  let paid = effectivePlan({ ...u, email: null }, now) !== "free";
  if (!paid && !free && u.whopUserId) {
    // The billing webhook may not have caught up: ask the payment provider.
    const fresh = await refreshPlan(db, u.id, now).catch(() => null);
    paid = Boolean(fresh && fresh !== "free");
  }
  if (!paid && !free) { await record(false); return { ok: false, email: email ?? u.email }; }
  await record(true);
  return { ok: true, userId: u.id, why: paid ? "member" : "free access" };
}
