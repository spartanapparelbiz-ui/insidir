/* Wikidata/Commons photos for a company's SEC reporting owners (design P1 and P4).
 *
 *  1. Linked people: everyone Wikidata ties to the company by a statement (company-profile.mjs
 *     peopleQuery: CEO, chair, board, founder, officer, employer, position-held qualifiers).
 *     An insider matches when exactly ONE linked person passes the strict name matcher.
 *  2. EntitySearch: for officers and directors still unmatched, a name search that runs inside
 *     the query service (SERVICE wikibase:mwapi) and reports any statement tying the candidate
 *     to the company. Accepted only with that tie, or a description naming the company in full.
 *  3. Wikipedia search (optional, low priority): the quoted name; accepted only when the article
 *     links to the company's page (or its lead names the company) and the page's item is a human.
 *  Photo: the person's P18 image first, else the pageimage of the person's own English article
 *  when that page's Wikidata item is the matched one. Free files only; author and licence come
 *  from Commons extmetadata.
 * A name alone never attaches a photo: two candidates for one insider, or one person claimed by
 * two insiders, leaves everyone involved unmatched. Results are cached per CIK for 7 days (1 hour
 * when a rate limit cut the run short). 429 means "unknown, retry later", never "no photo". */
import { externalFetch } from "./external.mjs";
import { fetchLinkedPeople, commonsFileUrl } from "./company-profile.mjs";
import { samePerson, isEntityName, nameTokens } from "./person-match.mjs";
import { getRecord, putRecord } from "./media-store.mjs";

const SPARQL = "https://query.wikidata.org/sparql";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const DAY = 86400000;
const TTL = 7 * DAY, PARTIAL_TTL = 60 * 60 * 1000, FILE_TTL = 7 * DAY;
const VERSION = 2;
const MAX_SEARCHES = 40, MAX_WIKI_SEARCHES = 15, MAX_LEADERS = 40;

/* ---------- polite, serial access per host ---------- */
const lanes = new Map();
const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function resetLanes() { lanes.clear(); }
function lane(host) {
  if (!lanes.has(host)) lanes.set(host, { tail: Promise.resolve(), last: 0, until: 0 });
  return lanes.get(host);
}
const GAP = { "query.wikidata.org": 700, "en.wikipedia.org": 1000 };
const MAX_WAIT = 125_000;
const rateLimited = host => Object.assign(new Error(host + " rate limited; retry later"), { rateLimited: true });
async function polite(url, fetcher, options, sleep) {
  const host = new URL(url).hostname, l = lane(host);
  for (let attempt = 0; ; attempt++) {
    const run = l.tail.then(async () => {
      const wait = Math.max(l.until - Date.now(), l.last + (GAP[host] || 1000) - Date.now());
      if (l.until - Date.now() > MAX_WAIT) throw rateLimited(host);
      if (wait > 0) await sleep(wait);
      l.last = Date.now();
      return fetcher(url, options);
    });
    l.tail = run.catch(() => {});
    try { return await run; }
    catch (e) {
      if (e?.rateLimited) throw e;
      const status = e?.upstreamStatus;
      if (status === 429 || status === 503) {
        const seconds = Math.max(5, Math.min(600, Number(e.retryAfter) || 60));
        l.until = Math.max(l.until, Date.now() + seconds * 1000);
        if (attempt < 2 && seconds * 1000 <= MAX_WAIT) continue;
        throw rateLimited(host);
      }
      if ((status === 502 || status === 504 || e?.name === "AbortError") && attempt < 1) { await sleep(3000); continue; }
      throw e;
    }
  }
}
function sparql(query, ctx) {
  return polite(SPARQL, ctx.fetcher, {
    json: true, method: "POST", accept: "application/sparql-results+json", maxBytes: 4_000_000, timeoutMs: 25000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString()
  }, ctx.sleep);
}
function wikiApi(params, ctx) {
  const url = WIKI_API + "?" + new URLSearchParams({ ...params, format: "json", formatversion: "2", maxlag: "5" }).toString();
  return polite(url, ctx.fetcher, { json: true, maxBytes: 3_000_000 }, ctx.sleep);
}
const rows = payload => Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
const val = (row, key) => typeof row?.[key]?.value === "string" ? row[key].value : null;
const qidOf = uri => /\/(Q\d+)$/.exec(String(uri || ""))?.[1] || null;

/* ---------- names ---------- */
const SUFFIX = new Set(["JR", "SR", "II", "III", "IV", "V", "MR", "MRS", "MS", "DR", "PHD", "MD", "CPA", "ESQ", "MBA", "CFA", "JD", "HON"]);
const nice = t => /[a-z]/.test(t) ? t : t.toLowerCase().replace(/(^|[-'’\s])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
/* Natural-order search strings for an SEC "LAST FIRST MIDDLE" name; an initial is never used as
 * the given name ("SIEVERT G MICHAEL" -> "Michael Sievert"); a third token allows a two-word
 * surname ("NORA JOHNSON SUZANNE M" -> "Suzanne Nora Johnson"). */
export function searchNames(secName) {
  if (isEntityName(secName)) return [];
  const t = String(secName || "").normalize("NFC").replace(/[,()"]/g, " ").split(/\s+/)
    .map(x => x.replace(/\.+$/, "").replace(/[^\p{L}'’.-]/gu, "")).filter(x => x && !SUFFIX.has(x.toUpperCase().replace(/\./g, "")));
  if (t.length < 2) return [];
  const given = from => t.slice(from).find(x => x.replace(/[.'’-]/g, "").length > 1);
  const out = [];
  const g1 = given(1);
  if (g1) out.push(nice(g1) + " " + nice(t[0]));
  if (t.length >= 3 && t[1].replace(/\./g, "").length > 1) { const g2 = given(2); if (g2) out.push(nice(g2) + " " + nice(t[0]) + " " + nice(t[1])); }
  // People who go by their middle name ("WALKER JOHN KENT" is Kent Walker).
  if (t.length === 3 && g1 && t[1] === g1) { const g3 = given(2); if (g3 && g3 !== g1) out.push(nice(g3) + " " + nice(t[0])); }
  return [...new Set(out)].filter(s => s.length <= 80);
}
const normText = text => " " + String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim() + " ";
const STOP = new Set(["general", "american", "national", "international", "united", "global", "first", "financial", "capital", "holdings", "group", "company", "corporation", "systems", "services", "industries", "technologies", "partners", "brands"]);
const LEGAL = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|holdings?|group|n ?v|s ?a|ag|the)\b/g;
/* Company names safe for free-text matching: full names, and cleaned names of 6+ characters that
 * are not ordinary words ("Dave", "Okta" or "Global" would match unrelated text). */
export function companyNames(...names) {
  const out = new Set();
  for (const raw of names) {
    const base = String(raw || "").replace(/\/[A-Z]{2,}\/?/g, " ");
    const full = normText(base).trim();
    if (full.length >= 6 && full.includes(" ")) out.add(full);
    const cleaned = full.replace(LEGAL, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length >= 6 && !STOP.has(cleaned)) out.add(cleaned);
  }
  return [...out];
}
export const mentionsCompany = (text, names) => names.find(n => normText(text).includes(" " + n + " ")) || null;
const isLeadershipRole = insider => insider.isOfficer || insider.isDirector ||
  /\b(director|officer|chief|president|ceo|cfo|coo|cto|evp|svp|vp|vice|chair|chairman|chairwoman|secretary|treasurer|counsel|controller|founder|head)\b/i.test(String(insider.role || ""));
/* samePerson() accepts when ANY of a candidate's names fits. A name form that states a different
 * middle name ("Andrew Philip Harrison" for HARRISON ANDREW R) is a conflict even when a shorter
 * alias fits, unless the extra token is a form of the SEC given name (Jen-hsun Jensen Huang). */
export function strictSamePerson(secName, name, aliases = []) {
  if (!samePerson(secName, name, aliases)) return false;
  const sec = nameTokens(secName);
  for (const n of [name, ...aliases]) {
    const t = nameTokens(n);
    if (t.length < 3 || samePerson(secName, n)) continue;
    if (!samePerson(secName, t[0] + " " + t.at(-1))) continue;
    const dropped = t.slice(1, -1);
    const explained = dropped.every(m => sec.some(x => x === m || (m.length >= 3 && x.length >= 3 && (x.startsWith(m) || m.startsWith(x)))));
    if (!explained) return false;
  }
  return true;
}
const keyFor = person => person.key || (person.cik ? "cik:" + String(person.cik).replace(/^0+/, "") : "name:" + String(person.name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80));
const searchKey = name => nameTokens(name).join(" ");

/* ---------- 1. linked people ---------- */
/* Each insider gets the single linked person whose label or alias passes samePerson(). Two
 * matching people, or one person matching two insiders, leaves those insiders unmatched. */
export function matchInsidersToWikidata({ insiders = [], people = [] }) {
  const matches = [], unmatched = [];
  for (const insider of insiders) {
    if (!insider?.name || isEntityName(insider.name)) { unmatched.push({ insider, reason: "entity" }); continue; }
    const hits = people.filter(p => p?.name && strictSamePerson(insider.name, p.name, p.aliases || []));
    if (hits.length === 1) matches.push({ insider, person: hits[0], rule: "wikidata-linked", evidence: { relations: hits[0].evidence || [], matchedName: hits[0].name } });
    else unmatched.push({ insider, reason: hits.length ? "ambiguous" : "none", candidates: hits.map(h => h.qid) });
  }
  return dropShared(matches, unmatched);
}
function dropShared(matches, unmatched) {
  const owners = new Map();
  for (const m of matches) {
    const who = m.insider.cik ? "cik:" + String(m.insider.cik).replace(/^0+/, "") : "name:" + searchKey(m.insider.name);
    if (!owners.has(m.person.qid)) owners.set(m.person.qid, new Set());
    owners.get(m.person.qid).add(who);
  }
  const kept = [];
  for (const m of matches) {
    if (owners.get(m.person.qid).size > 1) unmatched.push({ insider: m.insider, reason: "shared", candidates: [m.person.qid] });
    else kept.push(m);
  }
  return { matches: kept, unmatched };
}

/* ---------- company item ---------- */
export function companyItemQuery(cik) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  // Notable subsidiaries (with an English article) count as the company for tie checks: officers of
  // Alphabet are usually recorded on Wikidata as Google employees, Meta's as Facebook's.
  return `SELECT ?item ?itemLabel ?article ?sub ?subLabel WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?cik { "${plain}" "${padded}" }
  ?item wdt:P5531 ?cik .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { { ?item wdt:P355 ?sub } UNION { ?sub wdt:P749 ?item } ?subArticle schema:about ?sub ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} LIMIT 300`;
}
const MAX_SUBSIDIARIES = 30;
export function parseCompanyItems(payload) {
  const list = rows(payload).map(r => ({ qid: qidOf(val(r, "item")), label: val(r, "itemLabel"), article: val(r, "article") })).filter(x => x.qid);
  if (!list.length) return null;
  const best = list.find(x => x.article?.startsWith("https://en.wikipedia.org/wiki/")) || list[0];
  const title = best.article?.startsWith("https://en.wikipedia.org/wiki/") ? decodeURIComponent(best.article.slice(30)).replace(/_/g, " ") : null;
  const items = [...new Set(list.map(x => x.qid))];
  const subs = new Map();
  for (const r of rows(payload)) {
    const q = qidOf(val(r, "sub")), label = val(r, "subLabel");
    if (q && !items.includes(q) && !subs.has(q) && subs.size < MAX_SUBSIDIARIES) subs.set(q, label && !/^Q\d+$/.test(label) ? label : null);
  }
  return { qid: best.qid, qids: [...items, ...subs.keys()], label: best.label && !/^Q\d+$/.test(best.label) ? best.label : null, title,
    subsidiaries: [...subs.values()].filter(Boolean) };
}

/* ---------- 2. EntitySearch with a tie check ---------- */
const safeSearch = text => String(text || "").normalize("NFC").replace(/[^\p{L}\p{M}\s.'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
export function entitySearchQuery(search, companyQids) {
  const items = companyQids.filter(q => /^Q\d+$/.test(q)).map(q => "wd:" + q).join(" ");
  return `SELECT ?cand ?candLabel ?candDescription (SAMPLE(?img) AS ?image) (SAMPLE(?art) AS ?article) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) (GROUP_CONCAT(DISTINCT ?tie; separator="|") AS ?ties) WHERE {
  hint:Query hint:optimizer "None" .
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch"; mwapi:search "${safeSearch(search)}"; mwapi:language "en"; mwapi:limit "10" .
    ?cand wikibase:apiOutputItem mwapi:item . }
  ?cand wdt:P31 wd:Q5 .
  OPTIONAL { ?cand wdt:P18 ?img }
  OPTIONAL { ?cand skos:altLabel ?alias . FILTER(LANG(?alias) = "en" || LANG(?alias) = "mul") }
  OPTIONAL { ?art schema:about ?cand ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL {
    VALUES ?co { ${items} }
    { ?cand ?pp ?co . FILTER(STRSTARTS(STR(?pp), "http://www.wikidata.org/prop/direct/P")) BIND(CONCAT("person ", STRAFTER(STR(?pp), "direct/")) AS ?tie) }
    UNION { ?cand ?p2 ?st . FILTER(STRSTARTS(STR(?p2), "http://www.wikidata.org/prop/P")) ?st ?q2 ?co . FILTER(STRSTARTS(STR(?q2), "http://www.wikidata.org/prop/qualifier/P"))
      BIND(CONCAT("person ", STRAFTER(STR(?p2), "prop/"), "/", STRAFTER(STR(?q2), "qualifier/")) AS ?tie) }
    UNION { ?co ?p3 ?st3 . FILTER(STRSTARTS(STR(?p3), "http://www.wikidata.org/prop/P")) ?st3 ?q3 ?cand .
      FILTER(STRSTARTS(STR(?q3), "http://www.wikidata.org/prop/statement/P") || STRSTARTS(STR(?q3), "http://www.wikidata.org/prop/qualifier/P"))
      BIND(CONCAT("company ", STRAFTER(STR(?p3), "prop/")) AS ?tie) }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} GROUP BY ?cand ?candLabel ?candDescription LIMIT 50`;
}
export function parseEntitySearch(payload) {
  return rows(payload).map(r => {
    const qid = qidOf(val(r, "cand")), label = val(r, "candLabel");
    const aliases = String(val(r, "aliases") || "").split("|").map(x => x.trim()).filter(Boolean).slice(0, 12);
    return { qid, name: label && !/^Q\d+$/.test(label) ? label : aliases.find(a => /\s/.test(a)) || null, description: val(r, "candDescription") || "",
      image: val(r, "image"), article: val(r, "article"), aliases, ties: String(val(r, "ties") || "").split("|").filter(Boolean) };
  }).filter(c => c.qid && c.name);
}
/* Accepted candidates for one SEC name: strict name match AND (a statement tie OR a description
 * naming the company in full). */
export function acceptSearchCandidates(secName, candidates, names) {
  const accepted = [], rejected = [];
  for (const c of candidates) {
    if (!strictSamePerson(secName, c.name, c.aliases)) continue;
    const named = mentionsCompany(c.description, names);
    if (c.ties.length || named) accepted.push({ ...c, evidence: { ties: c.ties, description: named ? c.description.slice(0, 160) : null, matchedName: c.name } });
    else rejected.push({ qid: c.qid, name: c.name, description: c.description.slice(0, 120), reason: "no tie" });
  }
  let unique = [...new Map(accepted.map(c => [c.qid, c])).values()];
  // Wikidata often holds duplicate items for one executive (one from a news import, one from a
  // conference database). A single candidate tied by a statement wins over ones that only name
  // the company in their description; two statement-tied candidates stay ambiguous.
  if (unique.length > 1) {
    const tied = unique.filter(c => c.ties.length);
    if (tied.length === 1) unique = tied;
  }
  return { accepted: unique, rejected };
}
/* For each SEC name (officers/directors still unmatched): the single tied candidate or null. */
export async function entitySearchPeople({ companyQid, companyQids, companyName, companyLabel, names = [], fetcher = externalFetch, sleep = realSleep }) {
  const qids = companyQids?.length ? companyQids : [companyQid].filter(Boolean);
  const known = companyNames(companyLabel, companyName);
  const ctx = { fetcher, sleep };
  const out = [];
  for (const secName of names) {
    const candidates = [];
    for (const search of searchNames(secName)) candidates.push(...parseEntitySearch(await sparql(entitySearchQuery(search, qids), ctx)));
    const { accepted, rejected } = acceptSearchCandidates(secName, candidates, known);
    out.push({ secName, match: accepted.length === 1 ? accepted[0] : null, ambiguous: accepted.length > 1, rejected });
  }
  return out;
}

/* ---------- 3. Wikipedia search (optional) ---------- */
export function parseWikipediaSearch(payload, secName, names) {
  const pages = (payload?.query?.pages || []).slice().sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const accepted = [];
  for (const page of pages) {
    const title = String(page.title || "");
    const bare = title.replace(/\s*\(.*\)\s*$/, "");
    const qid = page.pageprops?.wikibase_item;
    if (!qid || !/^Q\d+$/.test(qid) || page.pageprops?.disambiguation !== undefined) continue;
    if (!strictSamePerson(secName, bare)) continue;
    const linked = Array.isArray(page.links) && page.links.length > 0;
    const named = mentionsCompany(String(page.extract || "").slice(0, 2000) + " " + String(page.description || ""), names);
    if (!linked && !named) continue;
    accepted.push({ qid, name: bare, title, article: "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")), pageimage: page.pageimage || null,
      evidence: { wikipedia: title, linksCompany: linked, lead: named ? "names " + named : null, matchedName: bare } });
  }
  return [...new Map(accepted.map(a => [a.qid, a])).values()];
}
async function companyTitles(title, ctx) {
  if (!title) return [];
  const data = await wikiApi({ action: "query", titles: title, prop: "redirects", rdnamespace: "0", rdlimit: "max", redirects: "1" }, ctx);
  const page = data?.query?.pages?.[0];
  const titles = [page?.title || title, ...(page?.redirects || []).map(r => r.title)];
  return [...new Set(titles)].filter(Boolean).slice(0, 50);
}

/* ---------- photos ---------- */
const fileName = ref => {
  let name = String(ref || "");
  const marker = name.indexOf("Special:FilePath/");
  if (marker >= 0) name = name.slice(marker + "Special:FilePath/".length);
  try { name = decodeURIComponent(name); } catch { return null; }
  name = name.replace(/^File:/i, "").replace(/_/g, " ").trim();
  return name && /\.(jpe?g|png|webp|gif|tiff?)$/i.test(name) && name.length < 240 ? name : null;
};
const stripHtml = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function cleanAuthor(text) {
  let a = String(text || "").replace(/\s+/g, " ").trim();
  const half = a.length / 2;
  if (a.length % 2 === 1 && a.slice(0, Math.floor(half)) === a.slice(Math.ceil(half))) a = a.slice(0, Math.floor(half)); // "X X" repeated
  if (!a || /^(unknown|anonymous)( author)?$/i.test(a)) return null;
  return a.length > 100 ? a.slice(0, 99) + "…" : a;
}
/* imageinfo for up to 50 files per request; local (English Wikipedia) and non-free files are
 * recorded so they are never used as Commons images. */
export function parseFileInfo(payload) {
  const out = {};
  const normalized = new Map((payload?.query?.normalized || []).map(n => [n.to, n.from]));
  for (const page of payload?.query?.pages || []) {
    const name = fileName(page.title);
    if (!name) continue;
    const info = page.imageinfo?.[0];
    if (!info) { out[name] = { missing: true }; continue; }
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value).slice(0, 60) || null;
    const nonFree = String(meta.NonFree?.value || "").toLowerCase() === "true" || /fair use|non-free/i.test(license || "");
    out[name] = {
      repository: page.imagerepository === "local" ? "local" : "commons",
      width: info.width || null, height: info.height || null,
      thumb: typeof info.thumburl === "string" ? info.thumburl.split("?")[0] : null,
      page: typeof info.descriptionurl === "string" ? info.descriptionurl : null,
      author: cleanAuthor(stripHtml(meta.Artist?.value)),
      license, licenseUrl: typeof meta.LicenseUrl?.value === "string" && /^https?:\/\//.test(meta.LicenseUrl.value) ? meta.LicenseUrl.value : null,
      nonFree
    };
    if (normalized.has(page.title)) out[fileName(normalized.get(page.title))] ??= out[name];
  }
  return out;
}
/* The photo object for one file; null when unusable (non-free, missing, not raster). */
export function photoFromFile(file, info, origin) {
  if (!file) return null;
  if (info?.missing || info?.nonFree) return null;
  const credit = info?.author || info?.license ? [info.author, info.license].filter(Boolean).join(" · ") : "Wikimedia Commons";
  const meta = { credit, author: info?.author || null, license: info?.license || null, licenseUrl: info?.licenseUrl || null, width: info?.width || null, height: info?.height || null, file, origin };
  if (!info || info.repository !== "local") {
    const src = commonsFileUrl(file, 120);
    if (!src) return null;
    return { src, large: commonsFileUrl(file, 330), source: info?.page || "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file.replace(/ /g, "_")), ...meta };
  }
  // A local English-Wikipedia file: only with known free licence metadata and a thumbnail URL.
  if (!info.thumb || !info.license || !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\/thumb\//.test(info.thumb)) return null;
  return { src: info.thumb.replace(/\/330px-/, "/120px-"), large: info.thumb, source: info.page, ...meta };
}
async function fileInfo(files, record, ctx) {
  const wanted = [...new Set(files.filter(Boolean))].filter(f => !record.files[f]);
  for (const f of [...wanted]) {
    const cached = await ctx.store.getRecord("commons-file", f).catch(() => null);
    if (cached) { record.files[f] = cached; wanted.splice(wanted.indexOf(f), 1); }
  }
  for (let i = 0; i < wanted.length; i += 50) {
    const batch = wanted.slice(i, i + 50);
    const data = await wikiApi({ action: "query", titles: batch.map(f => "File:" + f).join("|"), prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "330",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|NonFree", iiextmetadatalanguage: "en" }, ctx);
    const parsed = parseFileInfo(data);
    for (const f of batch) {
      const info = parsed[f] || { missing: true };
      record.files[f] = info;
      await ctx.store.putRecord("commons-file", f, info, FILE_TTL).catch(() => {});
    }
  }
}
/* Pageimage of each person's own English article, kept only when the article's item is that person. */
async function pageImages(people, record, ctx) {
  const todo = people.filter(p => p.qid && p.article && !(p.qid in record.pageImages));
  const byTitle = new Map(todo.map(p => [decodeURIComponent(p.article.slice(30)).replace(/_/g, " "), p.qid]));
  const titles = [...byTitle.keys()];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wikiApi({ action: "query", titles: batch.join("|"), prop: "pageprops|pageimages", ppprop: "wikibase_item", piprop: "name", redirects: "1" }, ctx);
    const rename = new Map([...(data?.query?.normalized || []), ...(data?.query?.redirects || [])].map(n => [n.to, n.from]));
    const original = t => { let x = t; for (let k = 0; k < 3 && rename.has(x); k++) x = rename.get(x); return x; };
    for (const page of data?.query?.pages || []) {
      const qid = byTitle.get(original(page.title));
      if (!qid) continue;
      record.pageImages[qid] = page.pageprops?.wikibase_item === qid && page.pageimage ? fileName(page.pageimage) : null;
    }
    for (const t of batch) if (!(byTitle.get(t) in record.pageImages)) record.pageImages[byTitle.get(t)] = null;
  }
}
const photoFileFor = (person, record) => {
  const p18 = fileName(person.image || person.photo?.file);
  if (p18) return { file: p18, origin: "P18" };
  const page = record.pageImages[person.qid];
  return page ? { file: page, origin: "pageimage" } : null;
};

/* ---------- the job ---------- */
function emptyRecord(cik) {
  return { v: VERSION, cik, company: null, linked: [], searches: {}, wikiSearches: {}, titles: null, humans: {}, pageImages: {}, files: {}, fetchedAt: new Date().toISOString(), partial: false };
}

/* {companyQid, matches:[{ownerCik, ownerName, key, qid, personName, wikidataUrl, roles, current,
 * photo:{src,large,source,credit,author,license,...}|null, rule, evidence}], leaders:[...]} */
export async function wikidataPhotos({ cik, companyName, insiders = [], fetcher = externalFetch, sleep = realSleep, store = { getRecord, putRecord },
  refresh = false, wikipediaSearch = true, linkedPeople = fetchLinkedPeople } = {}) {
  const id = String(Number(cik));
  if (!/^\d{1,10}$/.test(id) || id === "0") throw Object.assign(new Error("Invalid CIK"), { status: 400 });
  const ctx = { fetcher, sleep, store };
  const people = [];
  const seen = new Set();
  for (const p of insiders) {
    if (!p?.name) continue;
    const key = keyFor(p);
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ ...p, key });
  }
  let record = refresh ? null : await store.getRecord("wikidata-people", id).catch(() => null);
  if (record?.v !== VERSION) record = null;
  const fresh = !record;
  record ||= emptyRecord(id);
  record.partial = false;
  const errors = [];
  const attempt = async (label, work) => {
    try { await work(); return true; }
    catch (e) { errors.push(label + ": " + String(e?.message || e).slice(0, 100)); record.partial = true; return false; }
  };

  if (fresh) {
    const ok = await attempt("company", async () => { record.company = parseCompanyItems(await sparql(companyItemQuery(id), ctx)); });
    if (!ok) throw new Error("Wikidata unavailable: " + errors[0]);
    if (record.company) {
      const ok2 = await attempt("linked", async () => {
        record.linked = await linkedPeople(id, fetcher === externalFetch ? undefined : fetcher);
      });
      if (!ok2) throw new Error("Wikidata unavailable: " + errors.at(-1));
    }
  }
  const company = record.company;
  if (!company) {
    if (fresh) await store.putRecord("wikidata-people", id, record, TTL).catch(() => {});
    return { companyQid: null, matches: [], leaders: [], complete: true, stats: { insiders: people.length, linkedPeople: 0, matched: 0, withPhoto: 0, byRule: {} } };
  }
  const names = companyNames(company.label, companyName, company.title, ...(company.subsidiaries || []));

  // 1. linked people.
  const linkedMatch = matchInsidersToWikidata({ insiders: people, people: record.linked.filter(p => p.name) });
  const found = linkedMatch.matches.map(m => ({ ...m, qid: m.person.qid }));
  let unmatched = linkedMatch.unmatched.filter(u => u.reason === "none" && isLeadershipRole(u.insider));

  // 2. EntitySearch for unmatched officers and directors.
  let budget = MAX_SEARCHES, deferred = 0;
  for (const u of unmatched) {
    const k = searchKey(u.insider.name);
    if (!record.searches[k]) {
      const terms = searchNames(u.insider.name);
      if (!terms.length) { record.searches[k] = { candidates: [] }; continue; }
      if (budget <= 0) { record.partial = true; deferred++; continue; }
      budget -= terms.length;
      const candidates = [];
      const ok = await attempt("search", async () => { for (const term of terms) candidates.push(...parseEntitySearch(await sparql(entitySearchQuery(term, company.qids), ctx))); });
      if (!ok) { if (errors.at(-1).includes("rate limited")) break; continue; }
      record.searches[k] = { candidates: candidates.map(c => ({ ...c, description: c.description.slice(0, 200) })) };
    }
    const { accepted } = acceptSearchCandidates(u.insider.name, record.searches[k].candidates, names);
    if (accepted.length === 1) found.push({ insider: u.insider, person: { ...accepted[0], evidence: accepted[0].ties }, qid: accepted[0].qid, rule: "wikidata-search", evidence: accepted[0].evidence });
    else if (accepted.length > 1) u.reason = "ambiguous";
  }
  unmatched = unmatched.filter(u => u.reason === "none" && !found.some(f => f.insider.key === u.insider.key));

  // 3. Wikipedia search, quoted name; the article must link to the company page or name it.
  if (wikipediaSearch && company.title && unmatched.length) {
    if (!record.titles) await attempt("titles", async () => { record.titles = await companyTitles(company.title, ctx); });
    let wikiBudget = MAX_WIKI_SEARCHES;
    for (const u of record.titles ? unmatched : []) {
      const k = searchKey(u.insider.name);
      if (!record.wikiSearches[k]) {
        const term = searchNames(u.insider.name)[0];
        if (!term) { record.wikiSearches[k] = { pages: [] }; continue; }
        if (wikiBudget-- <= 0) { record.partial = true; deferred++; continue; }
        const ok = await attempt("wikipedia", async () => {
          const data = await wikiApi({ action: "query", generator: "search", gsrsearch: "\"" + safeSearch(term) + "\"", gsrlimit: "5", gsrnamespace: "0",
            prop: "pageprops|pageimages|extracts|description|links", ppprop: "wikibase_item|disambiguation", piprop: "name", explaintext: "1", exintro: "1", exlimit: "max",
            redirects: "1", pltitles: record.titles.join("|"), pllimit: "max" }, ctx);
          record.wikiSearches[k] = { pages: parseWikipediaSearch(data, u.insider.name, names) };
        });
        if (!ok) { if (errors.at(-1).includes("rate limited")) break; continue; }
      }
      const pages = record.wikiSearches[k].pages;
      if (pages.length === 1) found.push({ insider: u.insider, person: { qid: pages[0].qid, name: pages[0].name, article: pages[0].article, aliases: [] }, qid: pages[0].qid, rule: "wikipedia-search", evidence: pages[0].evidence, pageimage: pages[0].pageimage });
    }
    // Wikipedia hits must be humans on Wikidata; fetch their P18 and label at the same time.
    const check = found.filter(f => f.rule === "wikipedia-search" && !(f.qid in record.humans)).map(f => f.qid);
    if (check.length) await attempt("humans", async () => {
      const data = await sparql(`SELECT ?p ?pLabel (SAMPLE(?img) AS ?image) WHERE { VALUES ?p { ${check.map(q => "wd:" + q).join(" ")} } ?p wdt:P31 wd:Q5 . OPTIONAL { ?p wdt:P18 ?img }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } GROUP BY ?p ?pLabel`, ctx);
      for (const q of check) record.humans[q] = null;
      for (const r of rows(data)) { const q = qidOf(val(r, "p")); if (q) record.humans[q] = { image: val(r, "image"), label: val(r, "pLabel") }; }
    });
    for (let i = found.length - 1; i >= 0; i--) {
      const f = found[i];
      if (f.rule !== "wikipedia-search") continue;
      const human = record.humans[f.qid];
      if (!human) { found.splice(i, 1); continue; }
      f.person.image = human.image;
      if (human.label && !/^Q\d+$/.test(human.label)) f.person.name = human.label;
      if (f.pageimage && !(f.qid in record.pageImages)) record.pageImages[f.qid] = fileName(f.pageimage);
    }
  }
  if (deferred) errors.push(deferred + " name searches deferred to the next run (per-run budget)");
  const { matches: finalMatches } = dropShared(found, []);

  // Leaders: current leadership (or founders) not matched to any insider.
  const matchedQids = new Set(finalMatches.map(m => m.qid));
  const leaders = record.linked.filter(p => (p.current || p.founder) && p.leadership && !matchedQids.has(p.qid)).slice(0, MAX_LEADERS);

  // Photos: P18 first, else the person's own article pageimage; then licence metadata.
  const subjects = [...finalMatches.map(m => m.person), ...leaders];
  const imageOf = p => p.image || p.photo?.file || null;
  await attempt("pageimages", () => pageImages(subjects.filter(p => !imageOf(p) && p.article), record, ctx));
  const files = subjects.map(p => photoFileFor(p, record)?.file).filter(Boolean);
  await attempt("fileinfo", () => fileInfo(files, record, ctx));
  const photoOf = p => {
    const chosen = photoFileFor(p, record);
    if (!chosen) return null;
    const info = record.files[chosen.file];
    if (!info && chosen.origin !== "P18") return null; // a pageimage needs its licence checked first
    return photoFromFile(chosen.file, info, chosen.origin);
  };

  const matches = finalMatches.map(m => ({
    ownerCik: m.insider.cik ? String(m.insider.cik).replace(/^0+/, "") : null, ownerName: m.insider.name, key: m.insider.key,
    qid: m.qid, personName: m.person.name, wikidataUrl: "https://www.wikidata.org/wiki/" + m.qid,
    roles: m.person.roles || [], current: m.person.current ?? null,
    photo: photoOf(m.person), rule: m.rule, evidence: m.evidence
  }));
  const leaderList = leaders.map(p => ({ name: p.name, qid: p.qid, wikidataUrl: p.wikidataUrl, roles: p.roles, formerRoles: p.formerRoles || [], current: p.current,
    aliases: (p.aliases || []).slice(0, 8), description: p.description, photo: photoOf(p), evidence: p.evidence }));

  record.fetchedAt = record.fetchedAt || new Date().toISOString();
  await store.putRecord("wikidata-people", id, record, record.partial ? PARTIAL_TTL : TTL).catch(() => {});
  return {
    companyQid: company.qid, companyLabel: company.label, matches, leaders: leaderList, complete: !record.partial, errors: errors.length ? errors : undefined,
    stats: { insiders: people.length, linkedPeople: record.linked.length, matched: matches.length, withPhoto: matches.filter(m => m.photo).length,
      byRule: matches.reduce((acc, m) => ({ ...acc, [m.rule]: (acc[m.rule] || 0) + 1 }), {}) }
  };
}
