/* Back from Whop's sign-in, on /login/callback or /reset/callback (whichever is registered on our Whop login app; both
 * routes re-export this): the code is exchanged, their account found or made (lib/auth/whop-login.ts), a 30-day session set, and on to where
 * they were going. A member goes there. Accounts exist only if you pay: a new Whop user without Insidir gets no account
 * and no session, and lands on the paywall; an older account without Insidir lands there too. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/analytics";
import { safeNext } from "@/lib/auth/next";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { readUtm, UTM_COOKIE } from "@/lib/analytics";
import { finishLogin, LOGIN_COOKIE, LoginFailed, logLine, rateLimited, redirectUri, signInAs } from "@/lib/auth/whop-login";
import { getDb, hasDatabase } from "@/lib/db";
import { clientIp } from "@/lib/http";

/** Pages a signed-in non-member asked for that they can still use; anywhere else (the home page included) they go to
 *  /start to get Insidir. */
const OPEN_TO_ALL = /^\/(start|welcome|settings|pricing|terms|privacy|faq|help|methodology|data|status|security|disclosures|credits|changelog|about)(\/|\?|$)/;

/** Where anyone without Insidir lands after signing in: the paywall, never an empty app. */
export const PAYWALL = "/go?step=paywall";

export async function handleLoginCallback(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()), 303);
  const code = req.nextUrl.searchParams.get("code"), state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string; next?: string; redirect?: string } = {};
  try { saved = JSON.parse(req.cookies.get(LOGIN_COOKIE)?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  const done = (res: NextResponse) => { res.cookies.delete({ name: LOGIN_COOKIE, path: "/" }); return res; };
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) { logLine(`cancelled at Whop (${denied.slice(0, 60)})`); return done(to(safeNext(saved.next).startsWith("/start") ? "/start?error=cancelled" : "/login?error=cancelled")); }
  if (!code || !state || state !== saved.state || !saved.verifier) { logLine("expired or mismatched state"); return done(to("/login?error=expired")); }
  if (!hasDatabase()) return done(to("/login?error=unavailable"));
  const db = getDb(), ip = clientIp(req);
  if (await rateLimited(db, ip)) { logLine("rate limited"); return done(to("/login?error=rate_limited")); }
  try {
    const r = await signInAs(db, await finishLogin(code, saved.verifier, saved.redirect || await redirectUri()), ip, Date.now(), readUtm(req.cookies.get(UTM_COOKIE)?.value));
    // Accounts only if you pay: no account (and no session) without Insidir, straight to the paywall.
    if (!r.userId) { logLine("signed in without Insidir: paywall"); return done(to(PAYWALL)); }
    const { token, expires } = await createSession(r.userId);
    void recordEvent({ name: r.created ? "account_created" : "login", userId: r.userId }).catch(() => undefined);
    logLine(`signed in (${r.member ? "member" : "no membership"}${r.created ? ", new account" : ""})`);
    const next = safeNext(saved.next);
    const res = done(to(r.member || OPEN_TO_ALL.test(next) ? next : PAYWALL));
    setSessionCookie(res, token, expires);
    return res;
  } catch (e) {
    // A failed exchange already logged Whop's status and error.
    if (!(e instanceof LoginFailed)) logLine(`failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown"})`);
    return done(to("/login?error=failed"));
  }
}
