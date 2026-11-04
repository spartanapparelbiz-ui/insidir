/* Old /read/open?pick=<venue>:<id> links (a market tapped on the board): 301 to that market's page. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";

export function GET(req: NextRequest) {
  const m = /^(?:polymarket|kalshi):(.{1,200})$/.exec(req.nextUrl.searchParams.get("pick") ?? "")?.[1];
  return NextResponse.redirect(new URL(m ? `/market/${encodeURIComponent(m)}` : "/board", appUrl()), 301);
}
