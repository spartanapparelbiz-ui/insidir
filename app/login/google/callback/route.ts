/* Back from Google: a member (or a free-access email) gets a 30-day session and goes on to the feed (or where they
 * were going). Anyone else with a verified Google email: their Google account is kept with a checkout claim, so
 * /start goes straight to checkout with that email, and /login says "No Insidir membership for <email>". */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/analytics";
import { safeNext } from "@/lib/auth/next";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { finishGoogle, GOOGLE_COOKIE, LoginFailed, logLine, NO_PLAN_COOKIE, rateLimited, signInWithGoogle } from "@/lib/auth/google";
import { CLAIM_COOKIE, CLAIM_MAX_AGE_S, newClaim } from "@/lib/billing/claims";
import { PENDING_COOKIE, PENDING_MAX_AGE_S } from "@/lib/billing/pending";
import { getDb, hasDatabase } from "@/lib/db";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()), 303);
  const secure = appUrl().startsWith("https:");
  const code = req.nextUrl.searchParams.get("code"), state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get(GOOGLE_COOKIE)?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  const done = (res: NextResponse) => { res.cookies.delete({ name: GOOGLE_COOKIE, path: "/login/google" }); return res; };
  const back = saved.next === "/start" ? "/start" : "/login";
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) { logLine(`cancelled at Google (${denied.slice(0, 60)})`); return done(to(back)); }
  if (!code || !state || state !== saved.state || !saved.verifier) { logLine("expired or mismatched state"); return done(to(`${back}?error=expired`)); }
  if (!hasDatabase()) return done(to(`${back}?error=unavailable`));
  const db = getDb(), ip = clientIp(req);
  if (await rateLimited(db, ip)) { logLine("rate limited"); return done(to(`${back}?error=rate_limited`)); }
  try {
    const who = await finishGoogle(code, saved.verifier);
    const r = await signInWithGoogle(db, who, ip);
    if (!r.ok) {
      logLine("no membership");
      if (!r.email) return done(to(`${back}?error=unverified`));
      // Ready for the trial: /start opens the checkout with their Google email, and the account is linked to Google.
      const claim = await newClaim(db, { email: r.email, googleId: who.id });
      const res = done(to(saved.next === "/start" ? "/start" : "/login?error=no_membership"));
      res.cookies.set(CLAIM_COOKIE, claim, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: CLAIM_MAX_AGE_S });
      res.cookies.set(PENDING_COOKIE, r.email, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: PENDING_MAX_AGE_S });
      res.cookies.set(NO_PLAN_COOKIE, r.email, { httpOnly: true, secure, sameSite: "lax", path: "/login", maxAge: 600 });
      return res;
    }
    const { token, expires } = await createSession(r.userId);
    void recordEvent({ name: "login", userId: r.userId }).catch(() => undefined);
    logLine(`signed in (${r.why})`);
    const res = done(to(safeNext(saved.next === "/start" ? "/" : saved.next)));
    setSessionCookie(res, token, expires);
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (e) {
    // A failed exchange already logged Google's status and error.
    if (!(e instanceof LoginFailed)) logLine(`failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown"})`);
    return done(to(`${back}?error=failed`));
  }
}
