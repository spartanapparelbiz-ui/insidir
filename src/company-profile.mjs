/* Company profile facts that SEC filings do not carry in structured form — founding year,
 * employees, website, logo, leadership — from Wikidata (CC0), matched exactly by SEC CIK
 * (Wikidata property P5531), plus the Wikipedia summary (CC BY-SA 4.0, attributed). */
import { createHash } from "node:crypto";
import { createCache } from "./cache.mjs";
import { externalFetch } from "./external.mjs";

const cache = createCache(300);
const TTL = 24 * 60 * 60 * 1000;
const SPARQL = "https://query.wikidata.org/sparql";

/* Commons file name → direct upload.wikimedia.org URL (allowed by the site CSP). */
export function commonsFileUrl(fileUrlOrName, width) {
  let name = String(fileUrlOrName || "");
  const marker = name.indexOf("Special:FilePath/");
  if (marker >= 0) name = name.slice(marker + "Special:FilePath/".length);
  try { name = decodeURIComponent(name); } catch { return null; }
  name = name.replace(/ /g, "_").trim();
  if (!name || name.length > 240 || /[/\\#?]/.test(name) || !/\.(svg|png|jpe?g|gif|webp)$/i.test(name)) return null;
  const hash = createHash("md5").update(name).digest("hex");
  const path = hash[0] + "/" + hash.slice(0, 2) + "/" + encodeURIComponent(name);
  if (!width) return "https://upload.wikimedia.org/wikipedia/commons/" + path;
  const thumbName = encodeURIComponent(name) + (/\.svg$/i.test(name) ? ".png" : "");
  return "https://upload.wikimedia.org/wikipedia/commons/thumb/" + path + "/" + width + "px-" + thumbName;
}
const filePage = fileUrl => {
  const url = commonsFileUrl(fileUrl);
  if (!url) return null;
  return "https://commons.wikimedia.org/wiki/File:" + url.split("/").pop();
};

export function profileQuery(cik) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  return `SELECT ?item ?itemLabel ?itemDescription ?inception ?employees ?employeesDate ?employeesRank ?website ?websiteRank ?websiteLanguage ?logo ?hqLabel ?motto ?article WHERE {
  VALUES ?cik { "${plain}" "${padded}" }
  ?item wdt:P5531 ?cik .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item p:P1128 ?es . ?es ps:P1128 ?employees ; wikibase:rank ?employeesRank . FILTER(?employeesRank != wikibase:DeprecatedRank) OPTIONAL { ?es pq:P585 ?employeesDate } }
  OPTIONAL { ?item p:P856 ?ws . ?ws ps:P856 ?website ; wikibase:rank ?websiteRank . FILTER(?websiteRank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?ws pq:P582 [] } OPTIONAL { ?ws pq:P407 ?websiteLanguage } }
  OPTIONAL { ?item p:P154 ?ls . ?ls ps:P154 ?logo ; wikibase:rank ?lr . FILTER(?lr != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?ls pq:P582 [] } }
  OPTIONAL { ?item p:P159 ?hs . ?hs ps:P159 ?hq . FILTER NOT EXISTS { ?hs pq:P582 [] } }
  OPTIONAL { ?item wdt:P1451 ?motto . FILTER(LANG(?motto) = "en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 300`;
}
export function peopleQuery(cik) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  // The optimizer hint keeps evaluation anchored on the CIK match; without it the
  // query planner can scan every human on Wikidata and time out.
  return `SELECT ?person ?name ?role (SAMPLE(?image) AS ?photo) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?cik { "${plain}" "${padded}" }
  ?item wdt:P5531 ?cik .
  VALUES (?statement ?claim ?role ?current) {
    (p:P169 ps:P169 "Chief Executive Officer" true) (p:P488 ps:P488 "Chairperson" true)
    (p:P1037 ps:P1037 "Director / manager" true) (p:P112 ps:P112 "Founder" false)
  }
  ?item ?statement ?st .
  ?st ?claim ?person ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER(!?current || NOT EXISTS { ?st pq:P582 [] })
  ?person wdt:P31 wd:Q5 ; rdfs:label ?name . FILTER(LANG(?name) = "en")
  OPTIONAL { ?person wdt:P18 ?image }
  OPTIONAL { ?person skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }
} GROUP BY ?person ?name ?role LIMIT 40`;
}

const value = (binding, key) => typeof binding?.[key]?.value === "string" ? binding[key].value : null;
function safeWebsite(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    return { url: u.href, label: u.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

export function parseProfile(payload) {
  const rows = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  if (!rows.length) return null;
  // Prefer the entity that has an English Wikipedia article if a CIK is shared.
  const items = [...new Set(rows.map(r => value(r, "item")).filter(Boolean))];
  const item = items.find(id => rows.some(r => value(r, "item") === id && value(r, "article"))) || items[0];
  const mine = rows.filter(r => value(r, "item") === item);
  const first = mine[0];
  const years = mine.map(r => value(r, "inception")).filter(Boolean).map(d => /^([+-]?\d{4})/.exec(d)?.[1]).filter(Boolean).map(Number).filter(y => y > 1600 && y <= new Date().getUTCFullYear());
  const employeeRows = mine.filter(r => Number.isFinite(Number(value(r, "employees")))).map(r => ({
    value: Math.round(Number(value(r, "employees"))), asOf: value(r, "employeesDate")?.slice(0, 10) || null,
    preferred: /PreferredRank$/.test(value(r, "employeesRank") || "")
  })).filter(e => e.value > 0);
  // Most recent dated head count first; undated statements only when nothing is dated.
  employeeRows.sort((a, b) => String(b.asOf || "").localeCompare(String(a.asOf || "")) || Number(b.preferred) - Number(a.preferred));
  const employees = employeeRows[0] || null;
  // Official site: preferred rank, then English-language or unqualified, then .com, then shortest.
  const siteScore = new Map();
  for (const r of mine) {
    const site = safeWebsite(value(r, "website"));
    if (!site) continue;
    const language = value(r, "websiteLanguage");
    const score = (/PreferredRank$/.test(value(r, "websiteRank") || "") ? 8 : 0) + (!language || /\/Q1860$/.test(language) ? 4 : 0) +
      (/\.com$/.test(site.label) ? 2 : 0) + (site.url.startsWith("https:") ? 1 : 0);
    const previous = siteScore.get(site.url);
    siteScore.set(site.url, { site, score: previous ? Math.min(previous.score, score) : score });
  }
  const websites = [...siteScore.values()].sort((a, b) => b.score - a.score || a.site.url.length - b.site.url.length).map(x => x.site);
  const logos = [...new Set(mine.map(r => value(r, "logo")).filter(Boolean))];
  const svgLogo = logos.find(l => /\.svg$/i.test(decodeURIComponent(l))) || logos[0] || null;
  const article = value(first, "article");
  return {
    wikidataId: item ? item.split("/").pop() : null,
    wikidataUrl: item ? item.replace(/^http:/, "https:") : null,
    label: value(first, "itemLabel"),
    shortDescription: value(first, "itemDescription"),
    founded: years.length ? Math.min(...years) : null,
    employees: employees ? { value: employees.value, asOf: employees.asOf } : null,
    website: websites[0] || null,
    headquarters: [...new Set(mine.map(r => value(r, "hqLabel")).filter(x => x && !/^Q\d+$/.test(x)))][0] || null,
    motto: value(first, "motto"),
    logo: svgLogo ? { url: /\.svg$/i.test(decodeURIComponent(svgLogo)) ? commonsFileUrl(svgLogo) : commonsFileUrl(svgLogo, 330), source: filePage(svgLogo) } : null,
    wikipediaUrl: article && article.startsWith("https://en.wikipedia.org/wiki/") ? article : null
  };
}

export function parsePeople(payload) {
  const rows = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  const people = new Map();
  for (const row of rows) {
    const id = value(row, "person"), name = value(row, "name");
    if (!id || !name) continue;
    const entry = people.get(id) || { name, wikidataUrl: id.replace(/^http:/, "https:"), roles: [], aliases: [], photo: null };
    const role = value(row, "role");
    if (role && !entry.roles.includes(role)) entry.roles.push(role);
    for (const alias of String(value(row, "aliases") || "").split("|").map(x => x.trim()).filter(Boolean)) if (!entry.aliases.includes(alias)) entry.aliases.push(alias);
    const photo = value(row, "photo");
    if (photo && !entry.photo) {
      const src = commonsFileUrl(photo, 120);
      if (src) entry.photo = { src, large: commonsFileUrl(photo, 330), source: filePage(photo), credit: "Wikimedia Commons" };
    }
    people.set(id, entry);
  }
  const order = ["Chief Executive Officer", "Chairperson", "Director / manager", "Founder"];
  return [...people.values()].map(p => ({ ...p, aliases: p.aliases.slice(0, 8) }))
    .sort((a, b) => Math.min(...a.roles.map(r => order.indexOf(r))) - Math.min(...b.roles.map(r => order.indexOf(r))) || a.name.localeCompare(b.name));
}

/* SEC reporting-owner names are usually "LAST FIRST MIDDLE"; Wikidata names are "First Last". */
const tokens = name => String(name || "").toUpperCase().replace(/[^A-Z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(t => t.length > 0 && !["JR", "SR", "II", "III", "IV", "MR", "MS", "DR"].includes(t));
export function namesMatch(secName, person) {
  const sec = tokens(secName);
  if (sec.length < 2) return false;
  return [person.name, ...(person.aliases || [])].some(candidate => {
    const wiki = tokens(candidate);
    if (wiki.length < 2) return false;
    const last = wiki.at(-1), first = wiki[0];
    if (!sec.includes(last)) return false;
    return sec.some(t => t !== last && t.length >= 3 && first.length >= 3 && (t.startsWith(first) || first.startsWith(t)));
  });
}

async function wikipediaSummary(articleUrl, fetcher) {
  if (!articleUrl) return null;
  const title = articleUrl.slice("https://en.wikipedia.org/wiki/".length);
  if (!title || title.length > 200 || /[/?#]/.test(decodeURIComponent(title))) return null;
  const data = await fetcher("https://en.wikipedia.org/api/rest_v1/page/summary/" + title, { json: true, maxBytes: 400_000 });
  const extract = typeof data?.extract === "string" ? data.extract.replace(/\s+/g, " ").trim() : "";
  if (!extract) return null;
  return { text: extract.slice(0, 1600), url: articleUrl, license: "CC BY-SA 4.0", source: "Wikipedia" };
}

export async function getCompanyProfile(cik, fetcher = externalFetch) {
  const id = String(Number(cik));
  if (!/^\d{1,10}$/.test(id) || id === "0") throw Object.assign(new Error("Invalid CIK"), { status: 400 });
  const work = async () => {
    const sparql = query => fetcher(SPARQL, {
      json: true, method: "POST", accept: "application/sparql-results+json", maxBytes: 2_000_000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString()
    });
    const [profilePayload, peoplePayload] = await Promise.all([sparql(profileQuery(id)), sparql(peopleQuery(id)).catch(() => null)]);
    const profile = parseProfile(profilePayload);
    if (!profile) return { matched: false, people: [], sources: [] };
    const summary = await wikipediaSummary(profile.wikipediaUrl, fetcher).catch(() => null);
    return {
      matched: true, ...profile, summary, people: parsePeople(peoplePayload),
      sources: [
        { name: "Wikidata (CC0)", url: profile.wikidataUrl },
        ...(summary ? [{ name: "Wikipedia (CC BY-SA 4.0)", url: summary.url }] : [])
      ],
      retrievedAt: new Date().toISOString()
    };
  };
  return fetcher === externalFetch ? cache("profile:" + id, TTL, work) : work();
}
