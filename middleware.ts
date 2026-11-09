/* Sets the random visitor id, keeps first-touch UTM tags, and assigns the A/B variant. Cookies only; no tracking
 * beyond our own first-party events. ?ref= (our accounts' links) is kept first-touch too. New cookies are also passed on the request, so the very first render already
 * sees its variant (otherwise the page would render "a" while the cookie says "b").
 * Attribution (lib/attribution.ts): short links (/tt1, /ig2, /x3, SHORT_LINKS) go to /?ref=…; the first touch
 * (insidir_ft, 90 days, never replaced) and the latest (insidir_lt) are kept, and each new touch is logged as a
 * "touch" event through /api/touch (server to server, after the response). */
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { directTouch, extraShortLinks, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, readTouch, shortLinkTarget, TOUCH_MAX_AGE, touchFrom, writeTouch, type Touch } from "@/lib/attribution";

const YEAR = 365 * 86_400;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
/** Crawlers and our own monitor: cookies as usual, but never counted as a visit. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|monitor|headless|lighthouse|curl|wget|python|axios|node-fetch/i;

/** Logs a touch (the visitor's first, or a new latest) as an event, after the response: /api/touch on this server. */
function logTouch(ev: NextFetchEvent, req: NextRequest, visitorId: string, t: Touch, kind: "first" | "last") {
  const secret = process.env.TOUCH_SECRET || process.env.ADMIN_TOKEN;
  if (!secret || BOT.test(req.headers.get("user-agent") ?? "")) return;
  const port = process.env.PORT || req.nextUrl.port || "3000";
  ev.waitUntil(fetch(`http://127.0.0.1:${port}/api/touch`, {
    method: "POST", headers: { "content-type": "application/json", "x-insidir-touch": secret },
    body: JSON.stringify({ visitorId, kind, touch: t }), signal: AbortSignal.timeout(3000),
  }).then(() => undefined, () => undefined));
}

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  // A bare ticker (/NVDA, crawled from old links to the retired stock pages) goes to that company's report
  // (docs/INSIDIR-V3.md §3). Upper case only: every page of ours is lower case.
  if (/^\/[A-Z][A-Z.]{0,5}$/.test(req.nextUrl.pathname)) return NextResponse.redirect(new URL(`/company/${encodeURIComponent(req.nextUrl.pathname.slice(1))}`, appUrl()), 301);
  // A bio link: /tt1 → /?ref=tt1 (utm_content and the rest kept).
  const short = shortLinkTarget(req.nextUrl, extraShortLinks(process.env.SHORT_LINKS));
  if (short) return NextResponse.redirect(new URL(short, appUrl()), 307);
  const set: Array<{ name: string; value: string; maxAge: number; httpOnly: boolean }> = [];
  let vid = req.cookies.get("insidir_vid")?.value;
  if (!vid) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    vid = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    set.push({ name: "insidir_vid", value: vid, maxAge: YEAR, httpOnly: true });
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
  // First and last touch (page loads only: not prefetches or RSC requests, which carry no new touch).
  const isPage = req.method === "GET" && !req.headers.get("rsc") && req.headers.get("purpose") !== "prefetch" && !req.headers.get("next-router-prefetch");
  if (isPage) {
    const now = Date.now();
    const touch = touchFrom(req.nextUrl, req.headers.get("referer"), now);
    if (!readTouch(req.cookies.get(FIRST_TOUCH_COOKIE)?.value)) {
      const first = touch ?? directTouch(req.nextUrl, now);
      set.push({ name: FIRST_TOUCH_COOKIE, value: writeTouch(first), maxAge: TOUCH_MAX_AGE, httpOnly: true });
      logTouch(ev, req, vid, first, "first");
    }
    if (touch) {
      set.push({ name: LAST_TOUCH_COOKIE, value: writeTouch(touch), maxAge: TOUCH_MAX_AGE, httpOnly: true });
      if (readTouch(req.cookies.get(FIRST_TOUCH_COOKIE)?.value)) logTouch(ev, req, vid, touch, "last");
    }
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
