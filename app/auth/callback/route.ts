/* Whop redirects here with ?code&state. Verify state, exchange the code, read the plan from Whop server-side,
 * open our own session, and land where the user was going (after checkout: the live Terminal). */
import { NextResponse, type NextRequest } from "next/server";
import { createSession, REGION_COOKIE, SESSION_COOKIE, upsertUser, VISITOR_COOKIE } from "@/lib/auth/session";
import { finishAuthorize, appUrl } from "@/lib/auth/whop";
import { readUtm, UTM_COOKIE } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const fail = (why: string) => NextResponse.redirect(new URL("/signin?error=" + encodeURIComponent(why), appUrl()), 303);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get("insidir_oauth")?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  if (!code || !state || !saved.state || state !== saved.state || !saved.verifier) return fail("expired");
  try {
    const user = await finishAuthorize(code, saved.verifier);
    const region = req.cookies.get(REGION_COOKIE)?.value;
    await upsertUser(user, { visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, utm: readUtm(req.cookies.get(UTM_COOKIE)?.value),
      region: region === "us" || region === "non_us" ? region : null });
    const { token, expires } = await createSession(user.id);
    const res = NextResponse.redirect(new URL(saved.next ?? "/feed", appUrl()), 303);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", expires });
    res.cookies.delete({ name: "insidir_oauth", path: "/auth" });
    return res;
  } catch {
    return fail("failed");
  }
}
