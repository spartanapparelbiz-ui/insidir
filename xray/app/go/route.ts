/* /go?u=<any Polymarket link> → the matching X-ray page. */
import { NextResponse, type NextRequest } from "next/server";
import { parseLink, targetPath } from "@/lib/link";

export function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = parseLink(u);
  const to = t ? targetPath(t) : "/?error=link&u=" + encodeURIComponent(u.slice(0, 300));
  return NextResponse.redirect(new URL(to, req.nextUrl.origin), 303);
}
