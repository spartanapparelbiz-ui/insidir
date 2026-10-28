/* Admin: hide (or show again) one wallet's profile picture (terminal.trader_avatars.hidden_at). Takes effect on the next
 * page view everywhere: pages read pictures fresh and the worker's daily re-read never clears a hide. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { setAvatarHidden } from "@/lib/moves/avatar-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value, Date.now())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const wallet = String(form?.get("wallet") ?? "").trim().toLowerCase();
  const action = String(form?.get("action") ?? "");
  const back = (q: string) => NextResponse.redirect(new URL(`/admin${q}#pictures`, appUrl()), 303);
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return back("?error=" + encodeURIComponent("That isn't a Polymarket wallet address (0x and 40 hex characters)."));
  if (action !== "hide" && action !== "show") return back("?error=" + encodeURIComponent("Unknown action."));
  if (!hasDatabase()) return back("?error=" + encodeURIComponent("No database."));
  await setAvatarHidden(getDb(), wallet, action === "hide", Date.now());
  return back(`?picture=${action === "hide" ? "hidden" : "shown"}`);
}
