/* Picture sources audited as not being photographs of the person, kept off every page.
 *
 * Some companies print illustrated avatars of their directors in the proxy statement instead of
 * photographs. They pass every automated portrait check (caption match, aspect, continuous tone:
 * Reddit's 3D-rendered avatars measured like real portraits on every pixel statistic tried), so they
 * are listed here by issuer CIK after a visual audit. Nothing from these proxies is used as a
 * headshot, and records stored before an entry was added stop being served. */
export const ILLUSTRATED_PROXIES = Object.freeze({
  "1713445": "Reddit, Inc.: the DEF 14A shows illustrated avatars of its directors, not photographs (audited October 2026)"
});

const issuerOfDocument = url => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/0*(\d{1,10})\//.exec(String(url || ""))?.[1] || null;

/* The reason this issuer's proxy is never used for headshots, or null. */
export const illustratedProxy = cik => ILLUSTRATED_PROXIES[String(cik ?? "").replace(/^0+/, "")] || null;

/* The reason a stored photo ({source, sourceUrl}) must not be shown, or null. */
export function excludedPhoto(photo) {
  if (!photo || photo.source !== "sec-proxy") return null;
  const issuer = issuerOfDocument(photo.sourceUrl);
  return issuer ? illustratedProxy(issuer) : null;
}
