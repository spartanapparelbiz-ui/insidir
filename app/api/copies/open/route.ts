/* GET /api/copies/open?id=<copy>: an exit or price-drop push's link. Opens the copy's market on the venue the member
 * copied on, to close it in one tap; their own copies only. Signed out: log in first, then here. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { getViewer } from "@/lib/auth/viewer";
import { copyLink } from "@/lib/copies/mine";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const viewer = await getViewer();
  if (!viewer.user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/copies/open?id=${id}`)}`, appUrl()));
  const href = Number.isInteger(id) ? await copyLink(getDb(), viewer.user.id, id).catch(() => null) : null;
  return NextResponse.redirect(href && /^https:\/\/(kalshi\.com|polymarket\.com)\//.test(href) ? href : new URL("/copies", appUrl()));
}
