/* Admin sign-in: ADMIN_TOKEN + a current TOTP code → an httpOnly cookie (lib/admin.ts). Rate limited per client. */
import { appUrl } from "@/lib/auth/whop";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminLogin, tooManyAttempts } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/admin${q}`, appUrl()), 303);
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  if (tooManyAttempts(client, now, false)) return back("?error=wait");
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const code = String(form?.get("code") ?? "");
  const r = adminLogin(token, code, now);
  if (!r.ok) { tooManyAttempts(client, now, true); return back("?error=" + encodeURIComponent(r.error)); }
  const res = back("");
  res.cookies.set(ADMIN_COOKIE, r.cookie, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "strict", path: "/", expires: new Date(r.expires) });
  return res;
}
