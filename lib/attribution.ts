/* Where paying users come from: which account (?ref=, e.g. tt1 for the first TikTok account) and which post
 * (utm_content) brought them, kept first-touch and last-touch.
 *
 *   touch       what one visit carries: ref, the UTM tags, the external referrer's host and the page it landed on.
 *               A visit with none of them (typed in, or a click from our own pages) is not a touch.
 *   cookies     insidir_ft: the first touch, 90 days, never overwritten (a visitor with no touch on their first visit
 *               gets {source: "direct"}); insidir_lt: the latest touch, replaced by every new one. Both set in
 *               middleware.ts, which also logs each one (a "touch" event, /api/touch) so visits count per source.
 *   short links /tt1, /ig2, /x3 … (an account per number) and any name in SHORT_LINKS go to /?ref=<name>, keeping
 *               utm_content and the other tags, so one bio link per account and a tag per post.
 *   source      the key everything is grouped by: ref, else utm_source, else the referrer's host, else "direct".
 *
 * Pure (cookie values in, cookie values out): middleware.ts and the server both use it. No third parties. */

export const FIRST_TOUCH_COOKIE = "insidir_ft";
export const LAST_TOUCH_COOKIE = "insidir_lt";
export const TOUCH_MAX_AGE = 90 * 86_400;

export const TOUCH_KEYS = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing"] as const;
export type TouchKey = (typeof TOUCH_KEYS)[number];
export type Touch = Partial<Record<TouchKey, string>> & { source: string; at: number };

const clip = (v: string, n = 100) => v.trim().slice(0, n);

/** A ref as we store it: lower case, letters, digits, dot, dash and underscore, 2 to 40 (same rule as lib/home/ref.ts). */
export function cleanRefValue(raw: string | null | undefined): string | null {
  const r = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,40}$/.test(r) ? r : null;
}

/** The referrer's host when it's another site (never ours, never a path or query: just "tiktok.com"). */
export function externalHost(referer: string | null | undefined, ownHost: string): string | null {
  if (!referer) return null;
  try {
    const h = new URL(referer).hostname.toLowerCase().replace(/^www\./, "").replace(/^(m|l|lm|out)\./, "");
    const own = ownHost.toLowerCase().split(":")[0]!.replace(/^www\./, "");
    if (!h || h === own || h.endsWith(`.${own}`) || h === "localhost" || h === "127.0.0.1") return null;
    return h.slice(0, 100);
  } catch { return null; }
}

/** The grouping key: ref, else utm_source, else the referrer's host, else direct. Lower case. */
export function sourceOf(t: Partial<Record<TouchKey, string>> | null | undefined): string {
  const s = cleanRefValue(t?.ref) ?? (t?.utm_source ? clip(t.utm_source, 40).toLowerCase() : null) ?? (t?.referrer ? t.referrer.toLowerCase() : null);
  return s || "direct";
}

/** The touch a request carries, or null when it carries none. */
export function touchFrom(url: URL, referer: string | null, now: number): Touch | null {
  const out: Partial<Record<TouchKey, string>> = {};
  const ref = cleanRefValue(url.searchParams.get("ref"));
  if (ref) out.ref = ref;
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = url.searchParams.get(k);
    if (v && v.trim()) out[k] = clip(v);
  }
  const host = externalHost(referer, url.host);
  if (host) out.referrer = host;
  if (!Object.keys(out).length) return null;
  out.landing = clip(url.pathname, 120);
  return { ...out, source: sourceOf(out), at: now };
}

/** The first touch of a visitor who came with none. */
export const directTouch = (url: URL, now: number): Touch => ({ source: "direct", landing: clip(url.pathname, 120), at: now });

export function readTouch(raw: string | null | undefined): Touch | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    const out: Partial<Record<TouchKey, string>> = {};
    for (const k of TOUCH_KEYS) if (typeof o[k] === "string" && (o[k] as string).length <= 120) out[k] = o[k] as string;
    const at = typeof o.at === "number" && Number.isFinite(o.at) ? o.at : 0;
    return { ...out, source: sourceOf(out), at };
  } catch { return null; }
}

export const writeTouch = (t: Touch): string => JSON.stringify(t);

/** Platform of a short link's prefix. */
const PREFIX: Record<string, string> = { tt: "tiktok", ig: "instagram", x: "x" };
export const platformOfRef = (ref: string): string | null => PREFIX[/^(tt|ig|x)\d{1,3}$/.exec(ref)?.[1] ?? ""] ?? null;

/** Extra short-link names from SHORT_LINKS ("yt1,newsletter,..."), on top of /tt<N>, /ig<N>, /x<N>. */
export function extraShortLinks(env: string | undefined): Set<string> {
  return new Set((env ?? "").split(/[,\s]+/).map(s => cleanRefValue(s)).filter((s): s is string => Boolean(s)));
}

/** Pages that already exist at a short path: never a short link. */
const RESERVED = new Set(["go", "t", "bet", "copy", "race", "book", "data", "faq", "help", "read", "login", "reset", "admin", "api"]);

/** "/tt1?utm_content=reel42" → "/?ref=tt1&utm_content=reel42" (every other tag kept as given; the platform is read
 *  from the name, platformOfRef); null when the path isn't a short link. */
export function shortLinkTarget(url: URL, extra: ReadonlySet<string> = new Set()): string | null {
  const m = /^\/([A-Za-z0-9._-]{2,40})\/?$/.exec(url.pathname);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  if (RESERVED.has(name)) return null;
  const platform = platformOfRef(name);
  if (!platform && !extra.has(name)) return null;
  const q = new URLSearchParams();
  q.set("ref", name);
  for (const [k, v] of url.searchParams) if (k !== "ref") q.set(k, v);
  return `/?${q.toString()}`;
}

/** The secret middleware.ts sends with each touch to /api/touch over loopback (http://127.0.0.1, never off the
 *  machine): TOUCH_SECRET, else ADMIN_TOKEN, else the database URL (always set where touches can be stored). */
export const touchSecret = (env: Record<string, string | undefined> = process.env): string => env.TOUCH_SECRET || env.ADMIN_TOKEN || env.DATABASE_URL || "";
