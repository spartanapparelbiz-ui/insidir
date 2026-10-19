/* Archived copies of a company's own pages, from the Internet Archive's Wayback Machine.
 *
 * Some companies answer every automated visitor with a bot wall (PayPal, Ferguson, Qualcomm, Regal Rexnord in
 * October 2026), so their leadership and board pages cannot be read live, though they are public and the
 * Internet Archive keeps copies of them. For such a page, and only when the live site refused us with a bot
 * wall (never when robots.txt disallows the path), the crawler reads the archived copy instead:
 *   1. the availability API (archive.org/wayback/available) names the snapshot closest to today;
 *   2. a snapshot older than ARCHIVE_MAX_AGE_DAYS is not used (a stale board);
 *   3. the snapshot is fetched unmodified (the id_ form) and every picture in it is pointed at its archived
 *      copy (the im_ form), so nothing is requested from the site that refused us;
 *   4. the page keeps its original URL, so links and the company-domain checks work as for a live page, and
 *      the result carries the snapshot's address and date for the photo credit.
 * The same strict card matching then applies: a name alone never attaches a photo. */
import { fetchImage } from "./media.mjs";

export const ARCHIVE_MAX_AGE_DAYS = 548;          // about 18 months
const AVAILABLE = "https://archive.org/wayback/available";
const WAYBACK = "https://web.archive.org/web/";
const UA = "InsidirResearch/1.0 (+https://insidir.com; hello@aethric.llc)";
const DAY = 86400000;

/* "20260412093011" -> Date (UTC), or null. */
export function timestampDate(ts) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(String(ts || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
}
export const rawSnapshotUrl = (ts, url) => WAYBACK + ts + "id_/" + url;
export const archivedImageUrl = (ts, url) => WAYBACK + ts + "im_/" + url;
export const isArchiveUrl = url => String(url || "").startsWith(WAYBACK);

/* The availability API's answer -> {timestamp, date} for a usable snapshot of exactly this page, or null. */
export function pickSnapshot(payload, url, now = Date.now()) {
  const closest = payload?.archived_snapshots?.closest;
  if (!closest || closest.available !== true || String(closest.status) !== "200") return null;
  const date = timestampDate(closest.timestamp);
  if (!date || now - date.getTime() > ARCHIVE_MAX_AGE_DAYS * DAY || date.getTime() - now > DAY) return null;
  // The API may answer with a nearby URL (a redirect target, another path): only the same page counts.
  const norm = u => String(u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const archived = String(closest.url || "").replace(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\//i, "");
  if (norm(archived) !== norm(url)) return null;
  return { timestamp: String(closest.timestamp), date: date.toISOString().slice(0, 10) };
}

/* Every picture reference in the page (src, data-src, data-lazy-src, srcset, og:image, inline background
 * images) made absolute against the original page and pointed at its archived copy. */
export function rewriteImages(html, pageUrl, ts) {
  const abs = u => { try { const x = new URL(String(u).trim().replace(/&amp;/g, "&"), pageUrl); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
  const wrap = u => { const a = abs(u); return a ? archivedImageUrl(ts, a) : u; };
  return String(html)
    .replace(/(\s(?:src|data-src|data-lazy-src|data-original)\s*=\s*)(["'])([^"']+)\2/gi, (m, attr, q, u) => /^(data|javascript):/i.test(u.trim()) ? m : attr + q + wrap(u) + q)
    .replace(/(\s(?:srcset|data-srcset)\s*=\s*)(["'])([^"']+)\2/gi, (m, attr, q, list) => attr + q + list.split(",").map(part => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return u ? [wrap(u), ...rest].join(" ") : part;
    }).join(", ") + q)
    .replace(/(<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*\bcontent\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, u) => pre + q + wrap(u) + q)
    .replace(/(background(?:-image)?\s*:\s*url\(\s*)(["']?)([^"')]+)\2(\s*\))/gi, (m, pre, q, u, post) => /^data:/i.test(u) ? m : pre + q + wrap(u) + q + post);
}

/* url -> {status:'ok', url, html, archived:{timestamp, date, snapshot}} | null (no usable snapshot). */
export async function archivedPage(url, deps = {}) {
  const getJson = deps.archiveJson || (async u => {
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Object.assign(new Error("Wayback availability responded " + r.status), { upstreamStatus: r.status });
    return r.json();
  });
  const getText = deps.archiveText || (async u => {
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Object.assign(new Error("Wayback snapshot responded " + r.status), { upstreamStatus: r.status });
    const type = String(r.headers.get("content-type") || "");
    if (type && !/html|xml/i.test(type)) return null;
    return r.text();
  });
  const now = deps.now ?? Date.now();
  let snap;
  try {
    const stamp = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
    snap = pickSnapshot(await getJson(AVAILABLE + "?url=" + encodeURIComponent(url) + "&timestamp=" + stamp), url, now);
  } catch { return null; }
  if (!snap) return null;
  let html;
  try { html = await getText(rawSnapshotUrl(snap.timestamp, url)); } catch { return null; }
  if (!html || html.length > 6_000_000) return null;
  return { status: "ok", url, html: rewriteImages(html, url, snap.timestamp), archived: { ...snap, snapshot: WAYBACK + snap.timestamp + "/" + url } };
}

/* Pictures from the archive are downloaded straight from it (one request at a time is plenty here). */
export const fetchArchivedImage = (url, options = {}) => fetchImage(url, { ...options, userAgent: UA });
