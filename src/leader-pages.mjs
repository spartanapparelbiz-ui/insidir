/* Photos of insiders from the company's own leadership and board pages (synthesis P2).
 *
 * Crawl: the verified company domain only (company-domain.mjs; never a low-confidence domain),
 * homepage + links it names (leadership, board, management, bios...), a short list of usual
 * paths, the investor-relations host's governance pages, and one hop of matching links on any
 * subdomain of the company domain (capped at 25). Pages are fetched politely through
 * public-fetch.mjs (robots.txt, 1 request/second/host, bot walls recorded and never bypassed).
 *
 * Cards: JSON-LD Person, profile pages (og:image + h1), and every <img> (src, data-src,
 * data-lazy-src, srcset), inline or class-based CSS background image. From each image we climb
 * at most 6 ancestors and stop as soon as the container holds more than one image, so a name can
 * never attach to a neighbour's photo.
 *
 * Matching: samePerson() (surname + given/nickname/prefix, middle-initial conflicts rejected).
 * A surname-only match (anglicised names: "Lam Yat Tung" -> "Job Lam") needs the surname to be
 * unique across every card on the site, unique among the insiders, and the card title to
 * corroborate the SEC role; it is marked medium confidence. One image belongs to one person;
 * images reused across cards (placeholders) are dropped. Image checks: raster, short side >= 120,
 * aspect 0.6-1.7. This module returns URLs; it downloads images only to check their dimensions. */
import { createHash } from "node:crypto";
import { fetchImage, imageSize } from "./media.mjs";
import { getRecord, putRecord } from "./media-store.mjs";
import { samePerson, isEntityName, secNameReadings, nameTokens } from "./person-match.mjs";
import { companyDomain, fetchHomepage } from "./company-domain.mjs";
import {
  publicFetcher, PUBLIC_UA, registrableDomain, parseHtml, elements, ancestors, classList, textStrings, pageMeta, jsonLd, ldTypes, ldUrl, absoluteUrl
} from "./public-fetch.mjs";

const DAY = 86400000;
const PAGES_TTL = 90 * DAY;
export const MAX_DISCOVERED = 25;
export const MAX_PAGES = 45;
const MIN_SHORT_SIDE = 120;
const ASPECT_MIN = 0.6, ASPECT_MAX = 1.7;

export const WWW_PATHS = ["/leadership", "/about/leadership", "/company/leadership", "/about-us/leadership", "/our-company/leadership", "/management", "/team",
  "/about/board-of-directors", "/about", "/about-us"];
export const IR_HOSTS = ["investors", "ir", "investor"];
// The IR root's own navigation supplies the rest (e.g. /governance/management-team/default.aspx).
export const IR_PATHS = ["/governance/management", "/governance/board-of-directors", "/corporate-governance/management"];
const GENERIC_PATH = /^\/(about|about-us|company|team)\/?$/i;
// "management" alone is a product word (talent management); only management team/page counts.
const KEYWORDS = /leadership|leaders\b|management[- ]team|\/management\/?$|^management$|board|executive|officers|directors|governance|bios\b|our[- ]people|our[- ]team|meet[- ]the[- ]team|who[- ]we[- ]are/i;
const STRONG = /leadership|leaders\b|board-of-directors|board|directors|executive-(?:team|bios|leadership|officers)|executives|management-team|\/management\/?$|officers|bios\b|our-team/i;
const SKIP_LINK = /\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4)$|committee|charter|guideline|policy|policies|news|press|event|career|job|login|signin|contact|privacy|terms|cookie|sitemap|search|subscribe|webcast|presentation|sec-filings|stock|dividend|quarterly|annual-report|esg|sustainab/i;

/* ---------------- names ---------------- */
export function cleanName(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:headshot|photo|portrait|image|picture|bio(?:graphy)?|profile)\s*(?:of|for|:|-)?\s+/i, "");
  t = t.replace(/^(?:mr|mrs|ms|dr|prof|sir|dame)\.?\s+/i, "");
  t = t.replace(/\s*\((?:[^)]*)\)\s*$/, "");
  t = t.replace(/,?\s*\b(?:Ph\.?\s?D|M\.?\s?D|CPA|J\.?\s?D|Esq|MBA|CFA|CFP|CPA|P\.?\s?E|RN|DVM|Pharm\.?\s?D|D\.?\s?Phil|FCA|ACA|CAIA|PMP|LLM|LL\.M)\.?(?=\W|$).*$/i, "");
  t = t.replace(/\s*[|–—:,-]\s*$/, "").trim();
  return t;
}
const PARTICLE = "(?:de|da|del|della|der|di|du|la|le|van|von|den|dos|das|bin|al|el|st\\.?)";
const NAMELIKE = new RegExp("^\\p{Lu}[\\p{L}.'’-]*(?:\\s+(?:" + PARTICLE + "\\s+)*(?:[\"“][\\p{L}.'’-]+[\"”]\\s+)?\\p{Lu}[\\p{L}.'’-]*\\.?){1,4}(?:,?\\s+(?:Jr|Sr|II|III|IV)\\.?)?$", "u");
const TITLE_WORDS = /\b(chief|officer|president|director|directors|chair|chairman|chairwoman|chairperson|board|vice|executive|senior|general|counsel|founder|co-founder|partner|leadership|team|management|our|meet|the|company|corporate|secretary|treasurer|controller|head|lead|global|group|investor|relations|about|us|view|read|more|bio|biography|independent|member|committee|operations|financial|technology|marketing|sales|human|resources|strategy|legal|news|contact|careers|home|menu|close|inc|llc|corp|ltd|trust|fund|capital|holdings)\b/i;
export function nameLike(s) {
  const t = cleanName(s);
  if (!t || t.length > 48 || t.length < 4) return null;
  if (!NAMELIKE.test(t)) return null;
  if (TITLE_WORDS.test(t)) return null;
  const words = t.split(/\s+/).filter(w => !/^\(?["“]/.test(w));
  if (words.length < 2 || words.length > 5) return null;
  return t;
}
/* Extra spellings of a page name that keep surname and given name: quoted nickname ("Jen-Hsun
 * "Jensen" Huang" -> Jensen Huang) and a leading initial the SEC name also has (W. Patrick Mattson). */
function nameAliases(name, secName) {
  const out = [];
  const nick = /["“]([^"”]+)["”]/.exec(name);
  const plain = name.replace(/\s*["“][^"”]+["”]\s*/g, " ").replace(/\s+/g, " ").trim();
  if (nick) out.push(plain, nick[1].trim() + " " + plain.split(" ").at(-1));
  const lead = /^(\p{Lu})\.?\s+(.+)$/u.exec(plain);
  if (lead && lead[2].split(/\s+/).length >= 2 && nameTokens(secName).some(t => t[0] === lead[1].toUpperCase())) out.push(lead[2]);
  return out;
}
export function matchesPerson(secName, cardName) {
  return samePerson(secName, cardName, nameAliases(cardName, secName));
}
const surnameOf = n => { const t = nameTokens(n); return t.length >= 2 ? t.at(-1) : null; };

/* SEC role "Chief Operating Officer · Director" corroborated by a card title. */
export function roleCorroborated(role, cardTitle) {
  const title = String(cardTitle || "").toLowerCase();
  if (!title) return false;
  const parts = String(role || "").split(/[·,;/]|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const p of parts) {
    if (/10%|owner|other/.test(p)) continue;
    if (/^director$/.test(p)) { if (/\bdirector\b|\bboard\b/.test(title) && !/\b(managing|executive|senior|associate)\s+director\b/.test(title)) return true; continue; }
    if (/^officer$/.test(p)) continue;
    const m = /^chief\s+(\w+)(?:\s+\w+)?\s+officer$/.exec(p);
    if (m) {
      const acronym = "c" + m[1][0] + "o";
      if (title.includes(p) || new RegExp("\\b" + acronym + "\\b").test(title) || new RegExp("chief\\s+" + m[1]).test(title)) return true;
      continue;
    }
    if (/president/.test(p) && /\bpresident\b/.test(title) && (!/vice/.test(p) || /vice/.test(title))) return true;
    if (/chair/.test(p) && /\bchair/.test(title)) return true;
    if (/counsel/.test(p) && /counsel|legal/.test(title)) return true;
    if (p.length >= 8 && title.includes(p)) return true;
  }
  return false;
}

/* ---------------- card extraction ---------------- */
const BAD_IMAGE = /logo|icon|sprite|\.svg(?:$|\?)|placeholder|silhouette|no[-_]?(?:photo|image|picture)|blank\.|spacer|pixel\.|1x1|default[-_](?:avatar|profile|user|person)|generic[-_]|loader|loading|chart|signat|banner|cover[-_]|hero[-_]/i;
function srcsetBest(ss, base) {
  let best = null, bestW = -1;
  for (const part of String(ss || "").split(/,(?=\s*\S+\s+\d|\s*\S+\s*$)|,\s+/)) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = d ? parseFloat(d) * (/x$/.test(d) ? 1000 : 1) : 0;
    if (w >= bestW) { bestW = w; best = u; }
  }
  return best ? absoluteUrl(best, base) : null;
}
function imgUrls(node, base) {
  const out = [];
  for (const k of ["data-src", "data-lazy-src", "data-original", "src"]) {
    const v = node.attrs[k];
    if (v && !/^data:/i.test(v)) { const u = absoluteUrl(v, base); if (u) out.push(u); }
  }
  for (const k of ["srcset", "data-srcset", "data-lazy-srcset"]) {
    const u = node.attrs[k] && srcsetBest(node.attrs[k], base);
    if (u) out.unshift(u); // the largest rendition first
  }
  const pic = node.parent?.tag === "picture" ? node.parent : null;
  if (pic) for (const s of pic.children) if (s.tag === "source" && (s.attrs.srcset || s.attrs["data-srcset"])) { const u = srcsetBest(s.attrs.srcset || s.attrs["data-srcset"], base); if (u) out.push(u); }
  return [...new Set(out)];
}
const BG_RX = /background(?:-image)?\s*:[^;}]*?url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
function styleUrls(style, base) {
  const out = [];
  for (const m of String(style || "").matchAll(BG_RX)) { const u = absoluteUrl(m[1], base); if (u) out.push(u); }
  return out;
}
/* class name -> background image URLs declared in <style> blocks (Apple's leadership grid). */
export function cssBackgrounds(root, base) {
  const map = new Map();
  for (const e of elements(root)) {
    if (e.tag !== "style" || !e.raw) continue;
    for (const m of e.raw.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const urls = styleUrls(m[2], base);
      if (!urls.length) continue;
      const sel = m[1].trim().split(",").map(s => s.trim()).filter(Boolean);
      for (const s of sel) {
        const cls = /\.([\w-]+)(?:::?[\w-]+(?:\([^)]*\))?)*\s*$/.exec(s)?.[1];
        if (!cls) continue;
        const list = map.get(cls) || [];
        for (const u of urls) if (!list.includes(u)) list.push(u);
        map.set(cls, list);
      }
    }
  }
  return map;
}

/* All person cards on one page: [{name, names, title, images:[url], how, pageUrl}] */
export function extractCards(html, pageUrl) {
  const root = typeof html === "string" ? parseHtml(html) : html;
  const meta = pageMeta(root, pageUrl);
  const base = meta.base || pageUrl;
  const cards = [];
  // (a) JSON-LD Person
  for (const o of jsonLd(root)) {
    if (!ldTypes(o).includes("Person") || typeof o.name !== "string") continue;
    const url = absoluteUrl(ldUrl(o.image), base);
    const name = nameLike(o.name);
    if (url && name && !BAD_IMAGE.test(url)) cards.push({ name, names: [name], title: String(o.jobTitle || "").slice(0, 160), images: [url], how: "jsonld", pageUrl });
  }
  // (b) profile page: og:image with a person-name h1
  const h1 = nameLike(meta.h1 || "");
  if (h1 && meta["og:image"]) {
    const url = absoluteUrl(meta["og:image"], base);
    const sub = textStrings(root, 400);
    const at = sub.findIndex(s => cleanName(s) === h1);
    if (url && !BAD_IMAGE.test(url)) cards.push({ name: h1, names: [h1], title: at >= 0 ? sub.slice(at + 1, at + 3).join(" | ").slice(0, 160) : "", images: [url], how: "profile", pageUrl });
  }
  // (c) image-bearing elements
  const css = cssBackgrounds(root, base);
  const bearers = [];
  for (const e of elements(root)) {
    if (e.tag === "script" || e.tag === "style" || e.tag === "noscript" || e.tag === "svg") continue;
    let urls = [];
    if (e.tag === "img") urls = imgUrls(e, base);
    else if (e.tag === "source") continue;
    if (e.attrs.style) urls.push(...styleUrls(e.attrs.style, base));
    if (e.attrs["data-bg"] || e.attrs["data-background"] || e.attrs["data-bg-src"]) { const u = absoluteUrl(e.attrs["data-bg"] || e.attrs["data-background"] || e.attrs["data-bg-src"], base); if (u) urls.push(u); }
    if (e.tag !== "img") for (const c of classList(e)) if (css.has(c)) { urls.push(...css.get(c)); }
    urls = [...new Set(urls)].filter(u => !BAD_IMAGE.test(u.split("?")[0]));
    if (!urls.length) continue;
    if (e.tag === "img" && BAD_IMAGE.test(String(e.attrs.alt || "").replace(/\s/g, "")) && /\.\w{3,4}$/.test(e.attrs.alt || "")) continue; // filename-like alt naming a logo/icon
    bearers.push({ e, urls });
  }
  // Images per container, so the climb can stop as soon as a container holds two pictures.
  const count = new Map();
  for (const b of bearers) {
    count.set(b.e, (count.get(b.e) || 0) + 1);
    for (const a of ancestors(b.e)) count.set(a, (count.get(a) || 0) + 1);
  }
  for (const { e, urls } of bearers) {
    let found = null;
    const chain = e.tag === "img" ? ancestors(e).slice(0, 6) : [e, ...ancestors(e).slice(0, 5)];
    for (const anc of chain) {
      if ((count.get(anc) || 0) > 1) break;
      const strings = textStrings(anc, 12).map(s => s.trim()).filter(s => s.length < 400);
      const head = strings.slice(0, 6);
      const names = [...new Set(head.map(nameLike).filter(Boolean))];
      if (names.length) {
        const name = names[0];
        const rest = strings.filter(s => cleanName(s) !== name).slice(0, 3).join(" | ").slice(0, 160);
        found = { name, names, title: rest };
        break;
      }
    }
    if (found) { cards.push({ ...found, images: urls, how: "card", pageUrl }); continue; }
    const alt = e.tag === "img" ? nameLike(e.attrs.alt || e.attrs.title || "") : null;
    if (alt) cards.push({ name: alt, names: [alt], title: "", images: urls, how: "alt", pageUrl });
  }
  return cards;
}

/* ---------------- matching ---------------- */
const keyFor = p => p.key || (p.cik ? "cik:" + String(p.cik).replace(/^0+/, "") : "name:" + String(p.name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80));
const HOW_RANK = { jsonld: 0, card: 1, profile: 2, alt: 3 };

/* Pure matcher: people [{name, cik?, role?, key?, extra?}] x cards -> [{person, card, rule, confidence}] */
export function matchCards(people, cards) {
  const persons = people.filter(p => p?.name && !isEntityName(p.name));
  // Images shown under two different names are placeholders or group shots.
  const namesByImage = new Map();
  for (const c of cards) for (const u of c.images) {
    const s = namesByImage.get(u) || new Set();
    s.add(nameTokens(c.name).join(" "));
    namesByImage.set(u, s);
  }
  const usable = c => ({ ...c, images: c.images.filter(u => (namesByImage.get(u)?.size || 0) <= 1) });
  const pool = cards.map(usable).filter(c => c.images.length);
  const out = [];
  for (const p of persons) {
    const hits = pool.filter(c => c.names.some(n => matchesPerson(p.name, n)));
    // A card that also fits another insider cannot decide between them.
    const clean = hits.filter(c => !persons.some(o => o !== p && c.names.some(n => matchesPerson(o.name, n))));
    if (clean.length) {
      clean.sort((a, b) => HOW_RANK[a.how] - HOW_RANK[b.how]);
      out.push({ person: p, cards: clean, rule: "full", confidence: "high" });
      continue;
    }
    if (hits.length || p.extra || !p.role) continue;
    // Surname only: unique surname on the whole site and among the insiders, and the title agrees.
    const surnames = new Set(secNameReadings(p.name).slice(0, 2).map(r => r.surname).filter(s => s.length >= 3));
    if (!surnames.size) continue;
    const distinctNames = new Map();
    for (const c of pool) for (const n of c.names) { const s = surnameOf(n); if (s && surnames.has(s)) distinctNames.set(nameTokens(n).join(" "), c); }
    const allNames = new Set(cards.flatMap(c => c.names.map(n => nameTokens(n).join(" "))).filter(n => surnames.has(n.split(" ").at(-1))));
    const otherInsider = persons.some(o => o !== p && secNameReadings(o.name).some(r => surnames.has(r.surname)));
    if (distinctNames.size !== 1 || allNames.size !== 1 || otherInsider) continue;
    const sameNameCards = pool.filter(c => c.names.some(n => surnames.has(surnameOf(n) || "")));
    const titled = sameNameCards.filter(c => roleCorroborated(p.role, c.title));
    if (!titled.length) continue;
    titled.sort((a, b) => HOW_RANK[a.how] - HOW_RANK[b.how]);
    out.push({ person: p, cards: titled, rule: "surname-only", confidence: "medium" });
  }
  return out;
}

/* ---------------- crawling ---------------- */
function linkCandidates(root, pageUrl, domain) {
  const meta = pageMeta(root, pageUrl);
  const base = meta.base || pageUrl;
  const out = [];
  for (const a of elements(root)) {
    if (a.tag !== "a" || !a.attrs.href) continue;
    let url = absoluteUrl(a.attrs.href, base);
    if (!url) continue;
    url = url.replace(/^http:\/\//, "https://").split("#")[0];
    let u;
    try { u = new URL(url); } catch { continue; }
    if (registrableDomain(u.hostname) !== domain) continue;
    const text = textStrings(a, 6).join(" ").slice(0, 120);
    const kw = KEYWORDS.test(text.trim()) || KEYWORDS.test(u.pathname);
    const about = /^about(?: us)?$|^who we are$|^our company$|^company$/i.test(text.trim()) || /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:about|about-us|company|who-we-are|our-company)(?:\/(?:about|about-us|overview))?\/?$/i.test(u.pathname);
    if (!kw && !about) continue;
    if (SKIP_LINK.test(u.pathname) && !/bios|leadership|board-of-directors/i.test(u.pathname)) continue;
    out.push({ url, text, about: about && !kw, strong: STRONG.test(u.pathname) || /leadership|leaders\b|board|management team|^management$|executive|directors|officers/i.test(text.trim()) });
  }
  return out;
}

/* leadershipPhotos({cik, name, ticker, insiders:[{name,cik,role,key?}], extraPeople?:[{name,key,aliases?}]})
 *   -> {status:'ok'|'none'|'blocked'|'no-domain', domain, pages:[url], matches:[...], requests} */
const GOOD_SHORT_SIDE = 200;
export async function leadershipPhotos({ cik, name, ticker, insiders = [], extraPeople = [], need = null } = {}, deps = {}) {
  const fetcher = deps.fetcher || publicFetcher();
  const page = deps.page || (url => fetcher.page(url));
  const store = deps.store || { getRecord, putRecord };
  const people = [
    ...insiders.filter(p => p?.name && !isEntityName(p.name)).map(p => ({ ...p, key: keyFor(p) })),
    ...extraPeople.filter(p => p?.name).map(p => ({ ...p, key: p.key || "name:" + p.name, extra: true }))
  ];
  // need: keys still without a photo. Everyone stays in the roster (a card must name exactly one
  // known person), but only these people are worth downloading images and crawling further for.
  const wanted = need ? new Set(need) : null;
  const isWanted = p => !wanted || wanted.has(p.key);
  const id = String(Number(cik || 0)).padStart(10, "0");
  const domain = await (deps.companyDomain || companyDomain)({ cik, name, ticker }, deps);
  if (!domain?.domain || domain.confidence === "low") return { status: "no-domain", domain: domain?.domain || null, pages: [], matches: [] };
  if (!people.some(isWanted)) return { status: "none", domain: domain.domain, pages: [], matches: [] };
  const d = domain.domain;
  const wwwHost = domain.host || "www." + d;

  const seen = new Map(), fetched = [], cardsByPage = new Map(), statusLog = [];
  let requests = 0, discovered = 0, productive = 0;
  const queue = [];
  const enqueue = (url, priority, why) => {
    const key = url.replace(/\/+$/, "").toLowerCase();
    const known = seen.get(key);
    // A real link raises a guessed path's priority; the page keeps its own role (a fixed path still
    // gets one hop of discovery, as in the research crawler).
    if (known) { if (priority < known.priority) known.priority = priority; return false; }
    const item = { url, priority, why, order: seen.size };
    seen.set(key, item);
    queue.push(item);
    return true;
  };
  const cached = await store.getRecord("leader-pages", id).catch(() => null);
  for (const u of cached?.pages || []) enqueue(u, 0, "cached");
  const home = deps.page ? null : await fetchHomepage(d, deps).catch(() => null);
  const homeUrl = home?.url || domain.homepage || "https://" + wwwHost + "/";
  const wwwOrigin = new URL(homeUrl).origin;
  enqueue(homeUrl, 1, "home");
  for (const p of WWW_PATHS) enqueue(wwwOrigin + p, GENERIC_PATH.test(p) ? 4 : 3.3, "path");
  IR_HOSTS.forEach((h, i) => enqueue("https://" + h + "." + d + "/", 3.5 + i * 0.01, "ir-root"));

  // Image checks run as matches appear, so a person counts as found only with a usable picture.
  const best = new Map(), triedUrls = new Map(), shaOwner = new Map();
  async function evaluate() {
    let gained = 0;
    for (const m of matchCards(people, [...cardsByPage.values()].flat())) {
      const key = m.person.key;
      if (!isWanted(m.person)) continue;
      const have = best.get(key);
      if (have && have.short >= GOOD_SHORT_SIDE) continue;
      const tried = triedUrls.get(key) || new Set();
      triedUrls.set(key, tried);
      for (const card of m.cards) {
        if (tried.size >= 4) break;
        for (const url of card.images.slice(0, 2)) {
          if (tried.has(url) || tried.size >= 4) continue;
          tried.add(url);
          const check = await checkImage(url, card.pageUrl, deps);
          if (!check.ok || (shaOwner.has(check.sha) && shaOwner.get(check.sha) !== key)) continue;
          shaOwner.set(check.sha, key);
          const short = Math.min(check.width, check.height), cur = best.get(key);
          if (!cur || short > cur.short) { if (!cur) gained++; best.set(key, { person: m.person, card, url: check.url || url, sourceUrl: url, check, short, rule: m.rule, confidence: m.confidence }); }
          break; // one picture per card
        }
        if (best.get(key)?.short >= GOOD_SHORT_SIDE) break;
      }
    }
    return gained;
  }
  const done = () => people.filter(isWanted).every(p => best.get(p.key)?.short >= GOOD_SHORT_SIDE);

  const deadHosts = new Set();
  let wwwBlocked = false;
  while (queue.length && requests < MAX_PAGES && !done()) {
    queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
    const item = queue.shift();
    const host = new URL(item.url).hostname;
    if (deadHosts.has(host)) continue;
    if (productive && item.priority >= 4) continue; // generic /about pages only when nothing better worked
    let r;
    if (item.why === "home" && home?.status === "ok") r = { status: "ok", url: home.url, html: home.html, root: home.root };
    else { r = await page(item.url); requests++; }
    statusLog.push({ url: item.url, status: r.status, code: r.code || null });
    if (r.status !== "ok") {
      // A bot wall, rate limit or dead host ends that host; a 404 or robots rule ends only that page.
      if (r.status === "blocked" || r.status === "rate-limited" || r.status === "unreachable") deadHosts.add(host);
      if (host === wwwHost && (r.status === "blocked" || r.status === "rate-limited")) wwwBlocked = true;
      if (item.why === "ir-root" && r.status === "http" && r.code === 404) IR_PATHS.forEach(p => enqueue(new URL(item.url).origin + p, 2.6, "ir-path"));
      continue;
    }
    const finalUrl = r.url;
    const root = r.root || parseHtml(r.html);
    cardsByPage.set(finalUrl, extractCards(root, finalUrl));
    fetched.push(finalUrl);
    if (await evaluate()) productive++;
    if (item.why === "ir-root") IR_PATHS.forEach(p => enqueue(new URL(finalUrl).origin + p, 2.5, "ir-path"));
    // One hop of leadership-looking links on the company's domain.
    if (item.why !== "discovered" && item.why !== "profile-link") {
      // Strong links first; a page full of "About"/keyword links (mega-menus) may not use up the cap.
      const links = linkCandidates(root, finalUrl, d);
      const ordered = [...links.filter(l => l.strong), ...links.filter(l => !l.strong && l.about).slice(0, 3), ...links.filter(l => !l.strong && !l.about).slice(0, 3)];
      for (const l of ordered) {
        if (discovered >= MAX_DISCOVERED) break;
        // Linked "About us" pages often carry the leadership grid; they rank below leadership links.
        if (enqueue(l.url, l.strong ? 2 : l.about ? 3.2 : 3.8, "discovered")) discovered++;
      }
    }
    // Profile links named after a person still without a good picture (counted in the same cap).
    for (const a of elements(root)) {
      if (discovered >= MAX_DISCOVERED) break;
      if (a.tag !== "a" || !a.attrs.href) continue;
      const labels = textStrings(a, 3).map(nameLike).filter(Boolean);
      const person = labels.length && people.find(p => isWanted(p) && !(best.get(p.key)?.short >= GOOD_SHORT_SIDE) && labels.some(l => matchesPerson(p.name, l)));
      if (!person) continue;
      const url = absoluteUrl(a.attrs.href, finalUrl)?.replace(/^http:\/\//, "https://").split("#")[0];
      if (!url || url === finalUrl || registrableDomain(new URL(url).hostname) !== d) continue;
      if (enqueue(url, 1.5, "profile-link")) discovered++;
    }
  }

  // Final decision on all cards seen: a pick survives only if the complete evidence still points to
  // that card (a later page can reveal a second card with the same surname or an ambiguous name).
  const allCards = [...cardsByPage.values()].flat();
  const final = new Map(matchCards(people, allCards).map(m => [m.person.key, m]));
  const matches = [];
  for (const [key, b] of best) {
    const m = final.get(key);
    if (!m || !m.cards.some(c => c.images.includes(b.sourceUrl))) continue;
    matches.push({
      ownerCik: b.person.extra ? null : (b.person.cik ? String(b.person.cik).replace(/^0+/, "") : null), key,
      personName: b.person.name, cardName: b.card.name, cardTitle: b.card.title || "",
      imageUrl: b.url, pageUrl: b.card.pageUrl, rule: m.rule + (b.card.how === "card" ? "" : ":" + b.card.how), confidence: m.confidence,
      width: b.check.width, height: b.check.height
    });
  }
  const pages = [...new Set(matches.map(m => m.pageUrl))];
  if (pages.length) await store.putRecord("leader-pages", id, { pages, domain: d, at: new Date().toISOString() }, PAGES_TTL).catch(() => {});
  const status = matches.length ? "ok" : (wwwBlocked && !fetched.some(u => new URL(u).hostname === wwwHost)) ? "blocked" : "none";
  return { status, domain: d, pages: pages.length ? pages : fetched.filter(u => (cardsByPage.get(u) || []).length >= 2).slice(0, 5), matches, requests,
    log: deps.debug ? statusLog : undefined, cards: deps.debug ? allCards : undefined };
}

/* Download once to prove the picture is a usable portrait: raster, short side >= 120, aspect 0.6-1.7. */
export async function checkImage(url, pageUrl, deps = {}) {
  let target = url.replace(/^http:\/\//, "https://");
  const fetcher = deps.fetcher || publicFetcher();
  if (!deps.fetchImage && !(await fetcher.gate(target))) return { ok: false, reason: "robots-or-blocked" };
  let image;
  try {
    const get = deps.fetchImage || ((u, o) => fetcher.paced(u, () => fetchImage(u, o)));
    image = await get(target, { maxBytes: 4_000_000, timeoutMs: 15000, userAgent: PUBLIC_UA, headers: { Referer: pageUrl } });
  } catch (e) { return { ok: false, reason: String(e?.message || e).slice(0, 60) }; }
  if (!["png", "jpeg", "webp", "gif"].includes(image.type)) return { ok: false, reason: "not raster" };
  const size = imageSize(image.bytes, image.type);
  if (!size || !size.width || !size.height) return { ok: false, reason: "unknown size" };
  const short = Math.min(size.width, size.height), aspect = size.width / size.height;
  if (short < MIN_SHORT_SIDE) return { ok: false, reason: "too small", ...size };
  if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) return { ok: false, reason: "aspect", ...size };
  return { ok: true, url: image.url || target, width: size.width, height: size.height, type: image.type, sha: createHash("sha256").update(image.bytes).digest("hex") };
}
