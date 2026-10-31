/* Sets the random visitor id, keeps first-touch UTM tags, and assigns the A/B variant. Cookies only; no tracking
 * beyond our own first-party events. ?ref= (our accounts' links) is kept first-touch too. New cookies are also passed on the request, so the very first render already
 * sees its variant (otherwise the page would render "a" while the cookie says "b"). */
import { NextResponse, type NextRequest } from "next/server";

const YEAR = 365 * 86_400;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function middleware(req: NextRequest) {
  // A bare ticker (/NVDA, crawled from old links) is that company's insider trading page. Upper case only: every page
  // of ours is lower case.
  if (/^\/[A-Z][A-Z.]{0,5}$/.test(req.nextUrl.pathname)) return NextResponse.redirect(new URL(`/insider-trading${req.nextUrl.pathname}`, req.url), 308);
  const set: Array<{ name: string; value: string; maxAge: number; httpOnly: boolean }> = [];
  if (!req.cookies.get("insidir_vid")) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    set.push({ name: "insidir_vid", value: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), maxAge: YEAR, httpOnly: true });
  }
  if (!req.cookies.get("insidir_ab")) {
    set.push({ name: "insidir_ab", value: "hero:" + (crypto.getRandomValues(new Uint8Array(1))[0]! % 2 ? "b" : "a"), maxAge: 90 * 86_400, httpOnly: false });
  }
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) { const v = req.nextUrl.searchParams.get(k); if (v) utm[k] = v.slice(0, 100); }
  // ?ref= from our accounts (lib/home/ref.ts): kept first-touch for the home page, and counted as the UTM source when
  // there are no UTM tags, so signups and members are attributed to it (lib/analytics.ts utmStats).
  const ref = (req.nextUrl.searchParams.get("ref") ?? "").trim().toLowerCase();
  if (/^[a-z0-9._-]{2,40}$/.test(ref)) {
    if (!req.cookies.get("insidir_ref")) set.push({ name: "insidir_ref", value: ref, maxAge: 90 * 86_400, httpOnly: true });
    if (!utm.utm_source) { utm.utm_source = ref; utm.utm_medium ??= "ref"; }
  }
  if (Object.keys(utm).length && !req.cookies.get("insidir_utm")) {
    set.push({ name: "insidir_utm", value: JSON.stringify(utm), maxAge: 90 * 86_400, httpOnly: true });
  }
  if (!set.length) return NextResponse.next();
  for (const c of set) req.cookies.set(c.name, c.value);
  const headers = new Headers(req.headers);
  headers.set("cookie", req.cookies.toString());
  const res = NextResponse.next({ request: { headers } });
  for (const c of set) res.cookies.set(c.name, c.value, { sameSite: "lax", path: "/", maxAge: c.maxAge, httpOnly: c.httpOnly });
  return res;
}

export const config = { matcher: ["/((?!_next|api|icons|brand|hero|favicon|sw.js|manifest|\\.well-known).*)"] };
