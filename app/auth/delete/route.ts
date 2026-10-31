/* POST /auth/delete (the form on /settings): deletes the signed-in account (lib/account/delete.ts), signs out and lands
 * on the home page with ?deleted=1. The form must carry confirm=DELETE and come from our own origin. */
import { NextResponse, type NextRequest } from "next/server";
import { deleteAccount } from "@/lib/account/delete";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl()).origin && origin !== req.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const form = await req.formData().catch(() => null);
  if (form?.get("confirm") !== "DELETE") return NextResponse.redirect(new URL("/settings?delete=confirm#delete", appUrl()), 303);
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", appUrl()), 303);
  await deleteAccount(getDb(), user.id);
  const res = NextResponse.redirect(new URL("/?deleted=1", appUrl()), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
