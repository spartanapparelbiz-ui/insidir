/* Back from confirming it's them: find their account, and let them set a new password on /reset for 15 minutes
 * (a one-time token in an httpOnly cookie). */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { accountFor, CONFIRM_COOKIE, finishConfirm, newReset, RESET_COOKIE, RESET_TTL_MS } from "@/lib/auth/reset";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/reset${q}`, appUrl()), 303);
  const code = req.nextUrl.searchParams.get("code"), state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string } = {};
  try { saved = JSON.parse(req.cookies.get(CONFIRM_COOKIE)?.value ?? "{}") as typeof saved; } catch { saved = {}; }
  if (!code || !state || state !== saved.state || !saved.verifier) return back("?error=expired");
  try {
    const db = getDb();
    const userId = await accountFor(db, await finishConfirm(code, saved.verifier));
    if (!userId) return back("?error=no_account");
    const token = await newReset(db, userId);
    const res = back("");
    res.cookies.set(RESET_COOKIE, token, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: RESET_TTL_MS / 1000 });
    res.cookies.delete({ name: CONFIRM_COOKIE, path: "/reset" });
    return res;
  } catch {
    return back("?error=failed");
  }
}
