/* First-visit attribution. Every link Insidir posts carries ?ref=<one of REFS>. The first time a browser arrives with
 * one, the server sets insidir_ref (90 days, first touch wins); funnel events, the account (users.signup_ref) and the
 * Stripe customer (metadata[insidir_ref]) carry it, and /admin counts visits, trials and paid members by ref.
 * INSIDIR_REFS replaces the list (comma-separated). Unknown values are ignored, never stored. */
export const DEFAULT_REFS = Object.freeze(["insidirfinance", "marketreceipts", "wallstreetdecoded", "companybriefdaily", "marketexplaineddaily", "tiktok", "youtube"]);
export const REF_COOKIE = "insidir_ref";
const DAYS = 90;

export function allowedRefs(env = process.env) {
  const list = String(env.INSIDIR_REFS || "").split(",").map(s => s.trim().toLowerCase()).filter(s => /^[a-z0-9_-]{2,40}$/.test(s));
  return list.length ? list : DEFAULT_REFS;
}
export const cleanRef = (value, env = process.env) => { const v = String(value ?? "").trim().toLowerCase(); return allowedRefs(env).includes(v) ? v : null; };

export function refFromCookie(req, env = process.env) {
  const raw = String(req?.headers?.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(REF_COOKIE + "="));
  return raw ? cleanRef(decodeURIComponent(raw.slice(REF_COOKIE.length + 1)), env) : null;
}

/* The Set-Cookie for a page request that arrives with an allowed ?ref= and no ref cookie yet; otherwise null. */
export function refCookieFor(req, url, { env = process.env, secure = true } = {}) {
  const ref = cleanRef(url.searchParams.get("ref"), env);
  if (!ref || refFromCookie(req, env)) return null;
  return `${REF_COOKIE}=${ref}; Path=/; Max-Age=${DAYS * 86400}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
