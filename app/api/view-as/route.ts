/* The View as switch (components/ViewAs.tsx): free-access accounts only. Sets or clears the preview cookie and goes
 * back to the page it came from. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken, VIEW_AS_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const as = form?.get("as") === "visitor" ? "visitor" : "member";
  let back = "/";
  try {
    const ref = new URL(req.headers.get("referer") ?? "", appUrl());
    if (ref.origin === new URL(appUrl()).origin) back = ref.pathname + ref.search;
  } catch { /* home */ }
  const res = NextResponse.redirect(new URL(back, appUrl()), 303);
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user?.freeAccess) { res.cookies.delete(VIEW_AS_COOKIE); return res; }
  if (as === "visitor") res.cookies.set(VIEW_AS_COOKIE, "visitor", { httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https:"), path: "/", maxAge: 86_400 });
  else res.cookies.delete(VIEW_AS_COOKIE);
  return res;
}
