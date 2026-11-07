/* Sign-in is Whop's (Google, Apple or email on Whop's own page), OAuth 2.1 + PKCE run on the server. No passwords or
 * Google keys of our own.
 *
 *   The login app: WHOP_CLIENT_ID, else the one stored by `npm run whop:setup` (app_id); WHOP_CLIENT_SECRET goes on the
 *   token exchange. The redirect URI: WHOP_REDIRECT_URI, else the one whop:setup found registered on the app and stored
 *   (redirect_uri: <APP_URL>/login/callback preferred, else /reset/callback), else <APP_URL>/login/callback. It's
 *   picked once on /login/start, kept in the login cookie, and the token exchange sends that same value back. Both
 *   /login/callback and /reset/callback run the same handler (lib/auth/callback.ts).
 *   Who they are: userinfo's sub (user_…), email, name and picture. Their account is the one linked to that Whop user,
 *   else the one with that email (linked now), else a new one: anyone may sign in; being a member is separate
 *   (lib/billing/access.ts: Whop's access check for WHOP_PRODUCT_INSIDIR, or FREE_ACCESS_EMAILS).
 *   Nothing from Whop is kept: the access token is used once, the refresh token revoked straight away.
 *   Rate limit: 30 sign-ins per IP address every 15 minutes (terminal.login_attempts).
 *   Logs one line per sign-in, never a token or an email: "login: signed in (member)", "login: token exchange failed (400
 *   invalid_grant: …)". */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DEFAULT_SETTINGS, loginAttempts, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";
import { whopRuntime } from "@/lib/billing/config";
import { newUserId, normEmail, refreshPlan } from "@/lib/billing/access";
import { checkAccess, fetchMemberships, planFrom, planIds } from "@/lib/billing/whop";
import { isFreeAccess } from "@/lib/billing/free";
import { CALLBACK_PATHS } from "@/lib/auth/callback-paths";

const OAUTH = () => `${(process.env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "")}/oauth`;
/** The sign-in in flight: state, PKCE verifier and where to go after (httpOnly, 10 minutes, the whole site: it starts
 *  on /login/start and ends on /login/callback or /reset/callback). */
export const LOGIN_COOKIE = "insidir_login";
const LIMIT = { perIp: 30, windowMs: 15 * 60_000 } as const;
export { CALLBACK_PATHS };
/** WHOP_REDIRECT_URI, else the stored one (whop:setup), else <APP_URL>/login/callback. */
export const redirectUri = async (): Promise<string> => (await whopRuntime()).redirectUri ?? appUrl() + CALLBACK_PATHS[0];
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
export async function startLogin(fresh = false): Promise<{ url: string; state: string; verifier: string; redirect: string }> {
  const verifier = b64url(randomBytes(32)), state = b64url(randomBytes(16)), redirect = await redirectUri();
  const q = new URLSearchParams({
    response_type: "code", client_id: await clientId(), redirect_uri: redirect, scope: "openid profile email", state,
    nonce: b64url(randomBytes(16)), code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    ...(fresh ? { prompt: "login" } : {}),
  });
  return { url: `${OAUTH()}/authorize?${q}`, state, verifier, redirect };
}

export class LoginFailed extends Error {}
interface WhopIdentity { id: string; email: string | null; name: string | null; picture: string | null }

/** Code → who they are at Whop. `redirect` is the exact redirect_uri the authorize request sent. On failure, logs the
 *  endpoint's status and error, nothing else. */
export async function finishLogin(code: string, verifier: string, redirect: string, f: typeof fetch = fetch): Promise<WhopIdentity> {
  const secret = process.env.WHOP_CLIENT_SECRET ?? "";
  const res = await f(`${OAUTH()}/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: await clientId(), code_verifier: verifier,
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
  return { id, email: str(info.email), name: str(info.name) ?? str(info.preferred_username), picture: str(info.picture) };
}

export async function rateLimited(db: Db, ip: string | null, now = Date.now()): Promise<boolean> {
  if (!ip) return false;
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, new Date(now - LIMIT.windowMs))));
  return Number(r[0]?.n) >= LIMIT.perIp;
}

/** Who just signed in at Whop → our account: by Whop user, else by email (linked now), else a new one. Then their
 *  access, read from Whop now (not the 5-minute cache), so a new member is in at once. */
/** `utm`: the first-touch UTM tags (or ?ref=) from their cookie, stored on a new account for attribution, or on an
 *  account the billing webhook made before they signed in (pay first). */
/** Accounts only if you pay: a Whop user we have no account for gets one only when Whop says they have Insidir (a paid
 *  membership, or the free-access list). Anyone else signs in to nothing: `userId` is null and they go to the paywall. */
async function hasPaidAccess(whopUserId: string, email: string | null, now = Date.now()): Promise<boolean> {
  if (isFreeAccess(email)) return true;
  const ids = planIds();
  const [has, list] = await Promise.all([
    ids.insidirProduct ? checkAccess(whopUserId, ids.insidirProduct).catch(() => null) : Promise.resolve(null),
    fetchMemberships(whopUserId).catch(() => null),
  ]);
  if (has) return true;
  return list ? planFrom(list, ids, now).plan !== "free" : false;
}

export async function signInAs(db: Db, who: WhopIdentity, ip: string | null, now = Date.now(), utm: Record<string, string> | null = null): Promise<{ userId: string | null; member: boolean; created: boolean }> {
  const email = who.email ? normEmail(who.email) : null;
  let u = (await db.select().from(users).where(eq(users.whopUserId, who.id)).limit(1))[0];
  let created = false;
  if (!u && email) {
    const byEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    // An account already linked to a different Whop user isn't theirs.
    if (byEmail && (!byEmail.whopUserId || byEmail.whopUserId === who.id)) {
      u = byEmail;
      if (!byEmail.whopUserId) await db.update(users).set({ whopUserId: who.id }).where(eq(users.id, byEmail.id));
    }
  }
  if (!u && !(await hasPaidAccess(who.id, email, now))) {
    // No account and no Insidir: nothing is made (no free accounts); they go to the paywall.
    await db.insert(loginAttempts).values({ email: email ?? `whop:${who.id}`, ip, ok: true, createdAt: new Date(now) });
    return { userId: null, member: false, created: false };
  }
  if (!u) {
    // Their email belongs to an account linked to another Whop user: this one gets an account without it.
    const free = email && !(await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
    const made = await db.insert(users).values({ id: newUserId(), email: free ? email : null, name: who.name, whopUserId: who.id, settings: DEFAULT_SETTINGS, utm })
      .onConflictDoNothing().returning();
    u = made[0] ?? (await db.select().from(users).where(eq(users.whopUserId, who.id)).limit(1))[0];
    created = Boolean(made[0]);
  } else {
    // Paid first (the billing webhook made the account): their first sign-in brings the first-touch tags. Never overwrites.
    const fill = { ...(!u.name && who.name ? { name: who.name } : {}), ...(!u.utm && utm ? { utm } : {}) };
    if (Object.keys(fill).length) await db.update(users).set(fill).where(eq(users.id, u.id));
  }
  if (!u) throw new LoginFailed("account");
  const plan = await refreshPlan(db, u.id, now).catch(() => null);
  const member = isFreeAccess(u.email) || (plan !== null ? plan !== "free" : u.plan !== "free");
  await db.insert(loginAttempts).values({ email: email ?? `whop:${who.id}`, ip, ok: true, createdAt: new Date(now) });
  return { userId: u.id, member, created };
}
