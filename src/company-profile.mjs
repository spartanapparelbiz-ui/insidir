/* Company profile facts that SEC filings do not carry in structured form — founding year,
 * employees, website, logo, leadership — from Wikidata (CC0), matched exactly by SEC CIK
 * (Wikidata property P5531), plus the Wikipedia summary (CC BY-SA 4.0, attributed). */
import { createHash } from "node:crypto";
import { createCache } from "./cache.mjs";
import { externalFetch } from "./external.mjs";
import { samePerson } from "./person-match.mjs";

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
/* Every person Wikidata links to the company ("step A" of the photo research). Company-side
 * statements: CEO (P169), chair (P488), director/manager (P1037), board member (P3320), founder
 * (P112), corporate officer (P2828). Person-side statements: employer (P108), member of (P463),
 * board member (P3320), and a position held (P39) whose qualifier "of" (P642), "conferred by"
 * (P1027) or "position of organization" (P2389) is the company. Ended roles are kept (they still
 * prove identity, e.g. a former CEO) and flagged.
 * Query planning: with hint:optimizer "None" Blazegraph runs triples in the order written, so the
 * CIK lookup comes first and every branch starts from the triple whose object is the company;
 * '?person p:P108 ?st . ?st ps:P108 ?item' scans all of Wikidata and times out. */
export const PEOPLE_RELATIONS = {
  ceo: { property: "P169", label: "Chief Executive Officer", leadership: true },
  chair: { property: "P488", label: "Chairperson", leadership: true },
  director: { property: "P1037", label: "Director / manager", leadership: true },
  board: { property: "P3320", label: "Board member", leadership: true },
  founder: { property: "P112", label: "Founder", leadership: true },
  officer: { property: "P2828", label: "Corporate officer", leadership: true },
  "board-of": { property: "P3320", label: "Board member", leadership: true },
  position: { property: "P39", label: "Position held", leadership: true },
  employer: { property: "P108", label: "Employee", leadership: false },
  member: { property: "P463", label: "Member", leadership: false }
};
const ROLE_ORDER = ["Chief Executive Officer", "Chairperson", "Founder", "Director / manager", "Board member", "Corporate officer", "Position held", "Employee", "Member"];
export function peopleQuery(cik) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  const ended = "OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?st pq:P580 ?start }";
  const position = qualifier => `UNION { ?st pq:${qualifier} ?item . ?person p:P39 ?st . BIND("position" AS ?rel) BIND("P39/${qualifier}" AS ?via) OPTIONAL { ?st ps:P39 ?pos } ${ended} }`;
  return `SELECT ?item ?person ?personLabel ?personDescription ?rel ?via ?posLabel ?ended ?rank (MAX(?start) AS ?since) (SAMPLE(?img) AS ?image) (SAMPLE(?art) AS ?article) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?cik { "${plain}" "${padded}" }
  ?item wdt:P5531 ?cik .
  { VALUES (?p ?ps ?rel ?via) { (p:P169 ps:P169 "ceo" "P169") (p:P488 ps:P488 "chair" "P488") (p:P1037 ps:P1037 "director" "P1037") (p:P3320 ps:P3320 "board" "P3320") (p:P112 ps:P112 "founder" "P112") (p:P2828 ps:P2828 "officer" "P2828") }
    ?item ?p ?st . ?st ?ps ?person . ${ended} }
  UNION { ?st ps:P108 ?item . ?person p:P108 ?st . BIND("employer" AS ?rel) BIND("P108" AS ?via) ${ended} }
  UNION { ?st ps:P463 ?item . ?person p:P463 ?st . BIND("member" AS ?rel) BIND("P463" AS ?via) ${ended} }
  UNION { ?st ps:P3320 ?item . ?person p:P3320 ?st . BIND("board-of" AS ?rel) BIND("P3320" AS ?via) ${ended} }
  ${position("P642")}
  ${position("P1027")}
  ${position("P2389")}
  ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
  ?person wdt:P31 wd:Q5 .
  BIND(BOUND(?end) AS ?ended)
  OPTIONAL { ?person wdt:P18 ?img }
  OPTIONAL { ?art schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?person skos:altLabel ?alias . FILTER(LANG(?alias) = "en" || LANG(?alias) = "mul") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} GROUP BY ?item ?person ?personLabel ?personDescription ?rel ?via ?posLabel ?ended ?rank LIMIT 3000`;
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

const LABEL_IS_ID = /^Q\d+$/;
function positionLabel(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text || LABEL_IS_ID.test(text)) return PEOPLE_RELATIONS.position.label;
  if (/^(member of the )?board of directors( member)?$|^(board )?director$|^board member$/i.test(text)) return PEOPLE_RELATIONS.board.label;
  if (/^chief executive officer$|^ceo$/i.test(text)) return PEOPLE_RELATIONS.ceo.label;
  if (/^chair(man|woman|person)?( of the board( of directors)?)?$/i.test(text)) return PEOPLE_RELATIONS.chair.label;
  return text.charAt(0).toUpperCase() + text.slice(1, 80);
}
/* A Commons file reference (Special:FilePath URL or bare name) -> the photo object the page uses. */
export function commonsPhoto(file) {
  const src = commonsFileUrl(file, 120);
  if (!src || /\.svg$/i.test(src.replace(/\.png$/i, ""))) return null;
  return { src, large: commonsFileUrl(file, 330), source: filePage(file), credit: "Wikimedia Commons", file: decodeURIComponent(src.split("/").at(-2)).replace(/_/g, " ") };
}

/* Every linked person with the evidence for the link. Accepts the step-A bindings and the older
 * {name, role, photo} bindings. current = some leadership role without an end date; a person-side
 * position that never got an end date does not outweigh an ended company-side statement. */
export function parseLinkedPeople(payload) {
  const rows = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  const people = new Map();
  for (const row of rows) {
    const id = value(row, "person");
    const name = value(row, "personLabel") || value(row, "name");
    if (!id || !/\/Q\d+$/.test(id)) continue;
    const qid = id.split("/").pop();
    const entry = people.get(qid) || { name: name && !LABEL_IS_ID.test(name) ? name : null, qid, wikidataUrl: "https://www.wikidata.org/wiki/" + qid,
      description: value(row, "personDescription"), article: null, relations: [], aliases: [], image: null };
    const rel = value(row, "rel");
    const legacyRole = value(row, "role");
    const relation = rel && PEOPLE_RELATIONS[rel]
      ? { rel, via: value(row, "via") || PEOPLE_RELATIONS[rel].property, ended: value(row, "ended") === "true",
        role: rel === "position" ? positionLabel(value(row, "posLabel")) : PEOPLE_RELATIONS[rel].label, leadership: PEOPLE_RELATIONS[rel].leadership,
        companySide: COMPANY_SIDE.has(rel), item: value(row, "item")?.split("/").pop() || null,
        preferred: /PreferredRank$/.test(value(row, "rank") || ""), since: /^[+-]?\d{4}/.test(value(row, "since") || "") ? value(row, "since").slice(0, 10) : null }
      : legacyRole ? { rel: "legacy", via: null, ended: false, role: legacyRole, leadership: true, companySide: true, item: null } : null;
    if (relation && !entry.relations.some(r => r.rel === relation.rel && r.via === relation.via && r.ended === relation.ended && r.role === relation.role)) entry.relations.push(relation);
    for (const alias of String(value(row, "aliases") || "").split("|").map(x => x.trim()).filter(Boolean)) if (!entry.aliases.includes(alias) && alias !== entry.name) entry.aliases.push(alias);
    const image = value(row, "image") || value(row, "photo");
    if (image && !entry.image) entry.image = image;
    const article = value(row, "article");
    if (article && article.startsWith("https://en.wikipedia.org/wiki/") && !entry.article) entry.article = article;
    people.set(qid, entry);
  }
  supersede([...people.values()]);
  const out = [];
  for (const p of people.values()) {
    if (!p.name) p.name = p.aliases.find(a => /\s/.test(a)) || null;
    if (!p.name) continue;
    // Current = a company-side leadership statement (CEO, chair, board, officer...) with no end date
    // that a newer holder has not superseded. Person-side positions only add role names.
    const live = r => r.leadership && !r.ended && !r.superseded && r.rel !== "founder";
    const current = p.relations.some(r => live(r) && r.companySide);
    const currentRoles = current ? p.relations.filter(live).map(r => r.role) : [];
    const roles = dedupeRoles([...currentRoles, ...p.relations.filter(r => r.rel === "founder").map(r => r.role)]);
    const formerRoles = dedupeRoles(p.relations.filter(r => r.leadership && r.rel !== "founder" && (r.ended || r.superseded || !current)).map(r => r.role))
      .filter(r => !roles.some(x => x.toLowerCase() === r.toLowerCase()));
    out.push({
      name: p.name, qid: p.qid, wikidataUrl: p.wikidataUrl, description: p.description || null, article: p.article,
      roles, formerRoles, current,
      leadership: p.relations.some(r => r.leadership), founder: p.relations.some(r => r.rel === "founder"),
      aliases: p.aliases.slice(0, 12), photo: p.image ? commonsPhoto(p.image) : null,
      evidence: p.relations.map(r => (r.item ? r.item + " " : "") + (r.via || "role") + " " + r.role + (r.ended ? " (ended)" : r.superseded ? " (superseded)" : ""))
    });
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current) || rank(a.roles[0]) - rank(b.roles[0]) || a.name.localeCompare(b.name));
}
const COMPANY_SIDE = new Set(["ceo", "chair", "director", "board", "founder", "officer"]);
function dedupeRoles(list) {
  const seen = new Map();
  for (const role of list) if (!seen.has(role.toLowerCase())) seen.set(role.toLowerCase(), role);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b));
}
/* A company usually has one CEO and one chair. When several people hold an open-ended statement,
 * the preferred-rank one wins; otherwise the latest start date wins. The others stay as evidence
 * of identity but are not presented as current. */
function supersede(people) {
  for (const rel of ["ceo", "chair"]) {
    const open = people.flatMap(p => p.relations.filter(r => r.rel === rel && !r.ended).map(r => ({ p, r })));
    if (open.length < 2) continue;
    if (open.some(x => x.r.preferred)) { for (const x of open) if (!x.r.preferred) x.r.superseded = true; continue; }
    const latest = open.map(x => x.r.since).filter(Boolean).sort().at(-1);
    if (latest) for (const x of open) if (x.r.since && x.r.since < latest) x.r.superseded = true;
  }
}
function rank(role) { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.indexOf("Position held") + 0.5 : i; }

/* The leadership shown on the company profile: people with a current leadership role, plus
 * founders. Employees found only through P108 (often researchers) and people whose roles all
 * ended are kept for photo matching but not listed. */
export function parsePeople(payload, { limit = 40 } = {}) {
  return leadershipPeople(parseLinkedPeople(payload), limit);
}
export function leadershipPeople(linked, limit = 40) {
  return linked.filter(p => p.current || p.founder).slice(0, limit);
}

/* SEC reporting-owner names are usually "LAST FIRST MIDDLE"; Wikidata names are "First Last".
 * Delegates to the shared strict matcher (surname + given/nickname/prefix, middle initials). */
export function namesMatch(secName, person) {
  return samePerson(secName, person?.name, person?.aliases || []);
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

const sparqlPost = (fetcher, query, timeoutMs) => fetcher(SPARQL, {
  json: true, method: "POST", accept: "application/sparql-results+json", maxBytes: 4_000_000, ...(timeoutMs ? { timeoutMs } : {}),
  headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString()
});
/* Everyone Wikidata links to the company with this CIK (see peopleQuery), parsed. Shared by the
 * profile (leadership list) and the photo matcher, so one query serves both. */
export function fetchLinkedPeople(cik, fetcher = externalFetch) {
  const id = String(Number(cik));
  if (!/^\d{1,10}$/.test(id) || id === "0") return Promise.reject(Object.assign(new Error("Invalid CIK"), { status: 400 }));
  const work = async () => parseLinkedPeople(await sparqlPost(fetcher, peopleQuery(id), 20000));
  return fetcher === externalFetch ? cache("people:" + id, TTL, work) : work();
}

export async function getCompanyProfile(cik, fetcher = externalFetch) {
  const id = String(Number(cik));
  if (!/^\d{1,10}$/.test(id) || id === "0") throw Object.assign(new Error("Invalid CIK"), { status: 400 });
  const work = async () => {
    const [profilePayload, linked] = await Promise.all([sparqlPost(fetcher, profileQuery(id)), fetchLinkedPeople(id, fetcher).catch(() => [])]);
    const profile = parseProfile(profilePayload);
    if (!profile) return { matched: false, people: [], sources: [] };
    const summary = await wikipediaSummary(profile.wikipediaUrl, fetcher).catch(() => null);
    return {
      matched: true, ...profile, summary,
      people: leadershipPeople(linked).map(({ name, qid, wikidataUrl, roles, formerRoles, current, aliases, photo, evidence }) => ({ name, qid, wikidataUrl, roles, formerRoles, current, aliases: aliases.slice(0, 8), photo, evidence })),
      sources: [
        { name: "Wikidata (CC0)", url: profile.wikidataUrl },
        ...(summary ? [{ name: "Wikipedia (CC BY-SA 4.0)", url: summary.url }] : [])
      ],
      retrievedAt: new Date().toISOString()
    };
  };
  return fetcher === externalFetch ? cache("profile:" + id, TTL, work) : work();
}
