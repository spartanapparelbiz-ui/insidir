/* Back from Whop's sign-in: a member (or a free-access email) gets a 30-day session and goes on to the feed (or where
 * they were going); anyone else sees "No Insidir membership for <email>" on /login. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/analytics";
import { safeNext } from "@/lib/auth/next";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { finishLogin, LOGIN_COOKIE, LoginFailed, logLine, NO_PLAN_COOKIE, rateLimited, signInAs } from "@/lib/auth/whop-login";
import { PENDING_COOKIE } from "@/lib/billing/pending";
import { getDb, hasDatabase } from "@/lib/db";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()), 303);
  const secure = appUrl().startsWith("https:");
  const code = req.nextUrl.searchParams.get("code"), state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get(LOGIN_COOKIE)?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  const done = (res: NextResponse) => { res.cookies.delete({ name: LOGIN_COOKIE, path: "/login" }); return res; };
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) { logLine(`cancelled at Whop (${denied.slice(0, 60)})`); return done(to("/login")); }
  if (!code || !state || state !== saved.state || !saved.verifier) { logLine("expired or mismatched state"); return done(to("/login?error=expired")); }
  if (!hasDatabase()) return done(to("/login?error=unavailable"));
  const db = getDb(), ip = clientIp(req);
  if (await rateLimited(db, ip)) { logLine("rate limited"); return done(to("/login?error=rate_limited")); }
  try {
    const r = await signInAs(db, await finishLogin(code, saved.verifier), ip);
    if (!r.ok) {
      logLine("no membership");
      const res = done(to("/login?error=no_membership"));
      if (r.email) res.cookies.set(NO_PLAN_COOKIE, r.email, { httpOnly: true, secure, sameSite: "lax", path: "/login", maxAge: 600 });
      return res;
    }
    const { token, expires } = await createSession(r.userId);
    void recordEvent({ name: "login", userId: r.userId }).catch(() => undefined);
    logLine(`signed in (${r.why})`);
    const res = done(to(safeNext(saved.next)));
    setSessionCookie(res, token, expires);
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (e) {
    // A failed exchange already logged Whop's status and error.
    if (!(e instanceof LoginFailed)) logLine(`failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown"})`);
    return done(to("/login?error=failed"));
  }
}
