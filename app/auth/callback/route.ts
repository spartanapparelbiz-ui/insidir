/* Whop redirects here with ?code&state. Verify state, exchange the code (PKCE), create or update the user, ask
 * Whop for their plan, open our own session, and land where the user was going. */
import { NextResponse, type NextRequest } from "next/server";
import { createSession, REGION_COOKIE, SESSION_COOKIE, upsertUser, VISITOR_COOKIE } from "@/lib/auth/session";
import { readUtm, UTM_COOKIE } from "@/lib/analytics";
import { appUrl } from "@/lib/whop/config";
import { finishAuthorize } from "@/lib/whop/oauth";

export async function GET(req: NextRequest) {
  const fail = (why: string) => NextResponse.redirect(new URL("/?signin=" + encodeURIComponent(why), appUrl()), 303);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get("insidir_oauth")?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  if (!code || !state || !saved.state || state !== saved.state || !saved.verifier) return fail("expired");
  try {
    const profile = await finishAuthorize(code, saved.verifier);
    const region = req.cookies.get(REGION_COOKIE)?.value;
    const userId = await upsertUser(profile, { visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, utm: readUtm(req.cookies.get(UTM_COOKIE)?.value),
      region: region === "us" || region === "non_us" ? region : null });
    const { token, expires } = await createSession(userId);
    const res = NextResponse.redirect(new URL(saved.next ?? "/terminal", appUrl()), 303);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", expires });
    res.cookies.delete({ name: "insidir_oauth", path: "/auth" });
    return res;
  } catch (e) {
    console.error("sign-in failed:", e instanceof Error ? e.message : e);
    return fail("failed");
  }
}
