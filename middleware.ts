/* Sets the random visitor id, keeps first-touch UTM tags, and assigns the A/B variant. Cookies only; no tracking
 * beyond our own first-party events. */
import { NextResponse, type NextRequest } from "next/server";

const YEAR = 365 * 86_400;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("insidir_vid")) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    res.cookies.set("insidir_vid", Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), { sameSite: "lax", path: "/", maxAge: YEAR, httpOnly: true });
  }
  if (!req.cookies.get("insidir_ab")) {
    res.cookies.set("insidir_ab", "hero:" + (crypto.getRandomValues(new Uint8Array(1))[0]! % 2 ? "b" : "a"), { sameSite: "lax", path: "/", maxAge: 90 * 86_400 });
  }
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) { const v = req.nextUrl.searchParams.get(k); if (v) utm[k] = v.slice(0, 100); }
  if (Object.keys(utm).length && !req.cookies.get("insidir_utm")) {
    res.cookies.set("insidir_utm", JSON.stringify(utm), { sameSite: "lax", path: "/", maxAge: 90 * 86_400, httpOnly: true });
  }
  return res;
}

export const config = { matcher: ["/((?!_next|api|icons|brand|favicon|sw.js|manifest).*)"] };
