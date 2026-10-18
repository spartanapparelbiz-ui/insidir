import test from "node:test";
import assert from "node:assert/strict";
import { peopleQuery, parseLinkedPeople, parsePeople, namesMatch, itemAnchor } from "../src/company-profile.mjs";
import {
  matchInsidersToWikidata, searchNames, companyNames, mentionsCompany, acceptSearchCandidates, entitySearchQuery, parseEntitySearch,
  parseWikipediaSearch, parseFileInfo, strictSamePerson, photoFromFile, parseCompanyItems, entitySearchPeople, wikidataPhotos, resetLanes, pickTickerItem, companyItemQuery
} from "../src/wikidata-people.mjs";

const b = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, value]) => [k, { value: String(value) }]));
const W = "http://www.wikidata.org/entity/";
const FP = "http://commons.wikimedia.org/wiki/Special:FilePath/";
const row = (qid, label, rel, via, extra = {}) => b({ item: W + "Q182477", person: W + qid, personLabel: label, rel, via, ended: extra.ended ? "true" : "false", ...extra, ended_: undefined });

test("step-A people query anchors every branch on the company and covers every relation", () => {
  const q = peopleQuery("0001045810");
  assert.match(q, /hint:Query hint:optimizer "None"/);
  assert.match(q, /"1045810" "0001045810"/);
  for (const p of ["P169", "P488", "P1037", "P3320", "P112", "P2828"]) assert.match(q, new RegExp("p:" + p + " ps:" + p));
  // Person-side branches start from the triple whose object is the company (the other order times out).
  assert.match(q, /\?st ps:P108 \?item \. \?person p:P108 \?st/);
  for (const qual of ["P642", "P1027", "P2389"]) assert.match(q, new RegExp("\\?st pq:" + qual + " \\?item \\. \\?person p:P39 \\?st"));
  assert.ok(q.indexOf("?item wdt:P5531 ?cik") < q.indexOf("UNION"), "CIK lookup comes first");
  assert.match(q, /pq:P582/, "ended roles are kept and flagged, not filtered out");
});

test("linked people keep ended roles as evidence but only current leaders and founders are listed", () => {
  const payload = { results: { bindings: [
    row("Q305177", "Jensen Huang", "ceo", "P169", { image: FP + "Jen-Hsun%20Huang%202025.jpg", aliases: "Jen-hsun Huang|Huang Jen-hsun", article: "https://en.wikipedia.org/wiki/Jensen_Huang" }),
    row("Q305177", "Jensen Huang", "founder", "P112"),
    row("Q1763248", "Persis Drell", "board", "P3320", { ended: true }),
    row("Q1763248", "Persis Drell", "position", "P39/P2389", { posLabel: "board of directors member" }),
    row("Q124912278", "Colette Kress", "officer", "P2828"),
    row("Q124912278", "Colette Kress", "position", "P39/P2389", { posLabel: "chief financial officer" }),
    row("Q50", "Old Boss", "ceo", "P169", { since: "2001-01-01T00:00:00Z" }),
    row("Q51", "Pat Person", "position", "P39/P642", { posLabel: "chief executive officer" }),
    row("Q58810320", "Gal Chechik", "employer", "P108"),
    row("Q99", "Q99", "board", "P3320", { aliases: "Ada Example" })
  ] } };
  const linked = parseLinkedPeople(payload);
  const by = Object.fromEntries(linked.map(p => [p.qid, p]));
  assert.deepEqual(by.Q305177.roles, ["Chief Executive Officer", "Founder"]);
  assert.equal(by.Q305177.current, true);
  assert.equal(by.Q305177.photo.src, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jen-Hsun_Huang_2025.jpg/120px-Jen-Hsun_Huang_2025.jpg");
  assert.equal(by.Q305177.photo.large.includes("/330px-"), true);
  assert.equal(by.Q1763248.current, false, "an open person-side position does not outweigh an ended board statement");
  assert.deepEqual(by.Q1763248.formerRoles, ["Board member"]);
  assert.ok(by.Q1763248.evidence.includes("Q182477 P3320 Board member (ended)"));
  assert.deepEqual(by.Q124912278.roles, ["Corporate officer", "Chief financial officer"]);
  assert.equal(by.Q305177.current, true, "an undated CEO statement is not superseded by an older dated one");
  assert.equal(by.Q51.current, false, "a person-side position alone is identity evidence, not current leadership");
  assert.deepEqual(by.Q51.formerRoles, ["Chief Executive Officer"]);
  const two = parseLinkedPeople({ results: { bindings: [row("Q60", "Ann Older", "ceo", "P169", { since: "2005-01-01T00:00:00Z" }), row("Q61", "Bea Newer", "ceo", "P169", { since: "2018-05-01T00:00:00Z" })] } });
  assert.deepEqual(two.map(p => [p.name, p.current]), [["Bea Newer", true], ["Ann Older", false]]);
  const ranked = parseLinkedPeople({ results: { bindings: [row("Q60", "Ann Older", "ceo", "P169"), row("Q61", "Bea Newer", "ceo", "P169", { rank: "http://wikiba.se/ontology#PreferredRank" })] } });
  assert.equal(ranked.find(p => p.qid === "Q60").current, false);
  assert.equal(by.Q58810320.leadership, false);
  assert.equal(by.Q99.name, "Ada Example", "an item without an English label falls back to a full-name alias");
  const listed = parsePeople(payload).map(p => p.name);
  assert.ok(listed.includes("Jensen Huang") && listed.includes("Colette Kress"));
  assert.ok(!listed.includes("Gal Chechik"), "employees found only through P108 are not shown as leadership");
  assert.ok(!listed.includes("Persis Drell"), "former board members are not shown as current leadership");
  assert.equal(namesMatch("HUANG JEN HSUN", by.Q305177), true);
  assert.equal(namesMatch("RUSSELL DAVID ERIC", { name: "David O. Russell" }), false, "conflicting middle initials");
});

const person = (qid, name, aliases = [], extra = {}) => ({ qid, name, aliases, evidence: ["Q1 P3320 Board member"], ...extra });

test("an insider matches exactly one linked person; ambiguity and shared people leave insiders unmatched", () => {
  const people = [person("Q1", "Tim Cook"), person("Q2", "Ginni Rometty", ["Virginia M. Rometty"]), person("Q3", "John Smith"), person("Q4", "John A. Smith"), person("Q5", "Mike Sievert")];
  const insiders = [
    { name: "COOK TIMOTHY D", cik: "0001214156" }, { name: "Rometty Virginia M", cik: "2" }, { name: "SMITH JOHN", cik: "3" },
    { name: "SIEVERT G MICHAEL", cik: "4" }, { name: "Sanitam Partners LLC", cik: "5" }, { name: "Cook Timothy", cik: "6" }, { name: "Nobody Here", cik: "7" }
  ];
  const { matches, unmatched } = matchInsidersToWikidata({ insiders, people });
  const got = Object.fromEntries(matches.map(m => [m.insider.cik, m.person.qid]));
  assert.deepEqual(got, { 2: "Q2", 4: "Q5" });
  const reason = Object.fromEntries(unmatched.map(u => [u.insider.cik, u.reason]));
  assert.equal(reason[3], "ambiguous", "two linked John Smiths");
  assert.equal(reason["0001214156"], "shared", "two different owners claim Tim Cook");
  assert.equal(reason[6], "shared");
  assert.equal(reason[5], "entity");
  assert.equal(reason[7], "none");
  assert.equal(matches[0].rule, "wikidata-linked");
});

test("a name form stating a different middle name rejects the candidate even when a short alias fits", () => {
  assert.equal(strictSamePerson("HARRISON ANDREW R", "Andrew Philip Harrison", ["Andrew Harrison"]), false);
  assert.equal(strictSamePerson("Turner Christopher Lee", "Christopher Turner", ["Christopher John Bridgman Turner"]), false);
  assert.equal(strictSamePerson("HUANG JEN HSUN", "Jensen Huang", ["Jen-hsun Huang", "Jen-hsun Jensen Huang"]), true, "extra token is a form of the given name");
  assert.equal(strictSamePerson("NORA JOHNSON SUZANNE M", "Suzanne Nora Johnson"), true);
  assert.equal(strictSamePerson("Teter Timothy S.", "Tim Teter", ["Timothy S. Teter"]), true);
  assert.equal(strictSamePerson("Newstead Jennifer", "Jennifer Gillian Newstead"), true, "a stated middle name is fine when the SEC has none");
  assert.equal(strictSamePerson("Rometty Virginia M", "Ginni Rometty", ["Virginia Marie Rometty"]), true);
});

test("search names skip initials, allow two-word surnames and drop suffixes", () => {
  assert.deepEqual(searchNames("SIEVERT G MICHAEL"), ["Michael Sievert"]);
  assert.deepEqual(searchNames("NORA JOHNSON SUZANNE M"), ["Johnson Nora", "Suzanne Nora Johnson"]);
  assert.deepEqual(searchNames("Fernandez Bernardo B. Jr."), ["Bernardo Fernandez"]);
  assert.deepEqual(searchNames("HUND-MEJEAN MARC"), ["Marc Hund-Mejean"]);
  assert.deepEqual(searchNames("Sanitam Partners LLC"), []);
  assert.deepEqual(searchNames("Madonna"), []);
  assert.deepEqual(searchNames("WALKER JOHN KENT"), ["John Walker", "Kent Walker John", "Kent Walker"], "people who go by their middle name");
});

test("company names for text ties are full names or long, distinctive cleaned names", () => {
  const names = companyNames("The Coca-Cola Company", "COCA COLA CO");
  assert.ok(names.includes("the coca cola company") && names.includes("coca cola"));
  assert.equal(mentionsCompany("Chief Technical and Innovation Officer The Coca-Cola Company", names) !== null, true);
  assert.deepEqual(companyNames("Dave", "DAVE INC /DE/").filter(n => !n.includes(" ")), [], "short names are never matched as bare words");
  assert.equal(mentionsCompany("American musician Dave", companyNames("Dave", "DAVE INC /DE/")), null);
  assert.equal(mentionsCompany("Alaska Airlines pilot", companyNames("Alaska Air Group")), null, "word boundaries");
  assert.ok(companyNames("NVIDIA CORP").includes("nvidia"));
});

test("EntitySearch accepts a candidate only with a statement tie or the company named in the description", () => {
  const q = entitySearchQuery("Judson Althoff\" } DROP", ["Q2283"]);
  assert.match(q, /mwapi:search "Judson Althoff DROP"/, "quotes and braces cannot escape the literal");
  assert.match(q, /VALUES \?co \{ wd:Q2283 \}/);
  assert.match(q, /hint:Query hint:optimizer "None"/);
  const candidates = parseEntitySearch({ results: { bindings: [
    b({ cand: W + "Q314342", candLabel: "David O. Russell", candDescription: "American film director", aliases: "David Owen Russell", ties: "" }),
    b({ cand: W + "Q7", candLabel: "Nancy Quan", candDescription: "Chief Technical and Innovation Officer The Coca-Cola Company", ties: "" }),
    b({ cand: W + "Q8", candLabel: "Nancy Quan", candDescription: "Canadian swimmer", ties: "" }),
    b({ cand: W + "Q9", candLabel: "Judson Althoff", candDescription: "businessman", ties: "person P108|company P3320", image: FP + "Judson.jpg" })
  ] } });
  assert.equal(candidates.length, 4);
  const names = companyNames("The Coca-Cola Company", "COCA COLA CO");
  assert.deepEqual(acceptSearchCandidates("Russell David Eric", candidates, names).accepted, []);
  const quan = acceptSearchCandidates("QUAN NANCY", candidates, names);
  assert.deepEqual(quan.accepted.map(c => c.qid), ["Q7"]);
  assert.equal(quan.rejected[0].qid, "Q8");
  assert.deepEqual(acceptSearchCandidates("Althoff Judson", candidates, []).accepted[0].evidence.ties, ["person P108", "company P3320"]);
  // Duplicate items for one executive: the statement-tied one wins; two tied ones stay ambiguous.
  const dup = (qid, ties, description = "") => ({ qid, name: "Philipp Schindler", description, aliases: [], ties });
  assert.deepEqual(acceptSearchCandidates("Schindler Philipp", [dup("Q1", [], "Google executive"), dup("Q2", ["person P1416"])], ["google"]).accepted.map(c => c.qid), ["Q2"]);
  assert.equal(acceptSearchCandidates("Schindler Philipp", [dup("Q1", ["person P108"]), dup("Q2", ["person P1416"])], ["google"]).accepted.length, 2);
});

test("Wikipedia search hits need a name match and a link to the company page or the company named in the lead", () => {
  const names = companyNames("Apple Inc.", "Apple Inc.");
  const payload = { query: { pages: [
    { index: 1, title: "Jennifer Newstead (politician)", pageprops: { wikibase_item: "Q39663578" }, links: [{ title: "Apple Inc." }], pageimage: "Jennifer_Newstead.jpg", extract: "Jennifer Newstead is an American lawyer." },
    { index: 2, title: "Jennifer Newstead", pageprops: { wikibase_item: "Q6178670" }, extract: "New Zealand Paralympic swimmer." },
    { index: 3, title: "Jennifer Newstead (disambiguation)", pageprops: { wikibase_item: "Q1", disambiguation: "" }, links: [{ title: "Apple Inc." }] }
  ] } };
  const hits = parseWikipediaSearch(payload, "Newstead Jennifer", names);
  assert.deepEqual(hits.map(h => h.qid), ["Q39663578"]);
  assert.equal(hits[0].name, "Jennifer Newstead");
  assert.equal(hits[0].evidence.linksCompany, true);
});

test("file metadata yields author and licence credits and rejects non-free files", () => {
  const info = parseFileInfo({ query: { normalized: [{ from: "File:Jen-Hsun_Huang_2025.jpg", to: "File:Jen-Hsun Huang 2025.jpg" }], pages: [
    { title: "File:Jen-Hsun Huang 2025.jpg", imagerepository: "shared", imageinfo: [{ width: 2000, height: 2500, thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jen-Hsun_Huang_2025.jpg/330px-Jen-Hsun_Huang_2025.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Jen-Hsun_Huang_2025.jpg",
      extmetadata: { Artist: { value: "<a href=\"//x\">The White House</a>" }, LicenseShortName: { value: "Public domain" } } }] },
    { title: "File:Logo.png", imagerepository: "local", imageinfo: [{ thumburl: "https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Logo.png/330px-Logo.png", descriptionurl: "https://en.wikipedia.org/wiki/File:Logo.png",
      extmetadata: { LicenseShortName: { value: "Fair use" }, NonFree: { value: "true" } } }] },
    { title: "File:Local.jpg", imagerepository: "local", imageinfo: [{ width: 400, height: 500, thumburl: "https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Local.jpg/330px-Local.jpg", descriptionurl: "https://en.wikipedia.org/wiki/File:Local.jpg",
      extmetadata: { Artist: { value: "Jane Doe" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] },
    { title: "File:Gone.jpg", missing: true }
  ] } });
  const huang = photoFromFile("Jen-Hsun Huang 2025.jpg", info["Jen-Hsun Huang 2025.jpg"], "P18");
  assert.equal(huang.credit, "The White House · Public domain");
  assert.equal(huang.src, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jen-Hsun_Huang_2025.jpg/120px-Jen-Hsun_Huang_2025.jpg");
  assert.equal(huang.source, "https://commons.wikimedia.org/wiki/File:Jen-Hsun_Huang_2025.jpg");
  assert.deepEqual([huang.width, huang.height], [2000, 2500]);
  assert.equal(photoFromFile("Logo.png", info["Logo.png"], "pageimage"), null);
  assert.equal(photoFromFile("Gone.jpg", info["Gone.jpg"], "P18"), null);
  const local = photoFromFile("Local.jpg", info["Local.jpg"], "pageimage");
  assert.equal(local.src, "https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Local.jpg/120px-Local.jpg");
  assert.equal(local.credit, "Jane Doe · CC BY-SA 4.0");
  assert.equal(photoFromFile("Plain.jpg", undefined, "P18").credit, "Wikimedia Commons", "Commons P18 still usable when metadata is unavailable");
});

test("company item prefers the entity with an English article", () => {
  const item = parseCompanyItems({ results: { bindings: [b({ item: W + "Q5", itemLabel: "Q5" }), b({ item: W + "Q312", itemLabel: "Apple Inc.", article: "https://en.wikipedia.org/wiki/Apple_Inc." })] } });
  assert.deepEqual(item, { qid: "Q312", qids: ["Q5", "Q312"], label: "Apple Inc.", title: "Apple Inc.", subsidiaries: [] });
  assert.equal(parseCompanyItems({ results: { bindings: [] } }), null);
  // Notable subsidiaries join the tie set (Alphabet officers are usually recorded at Google).
  const alphabet = parseCompanyItems({ results: { bindings: [
    b({ item: W + "Q20800404", itemLabel: "Alphabet Inc.", article: "https://en.wikipedia.org/wiki/Alphabet_Inc.", sub: W + "Q95", subLabel: "Google" }),
    b({ item: W + "Q20800404", itemLabel: "Alphabet Inc.", article: "https://en.wikipedia.org/wiki/Alphabet_Inc.", sub: W + "Q9372", subLabel: "Q9372" })
  ] } });
  assert.deepEqual(alphabet.qids, ["Q20800404", "Q95", "Q9372"]);
  assert.deepEqual(alphabet.subsidiaries, ["Google"]);
});

/* A fake network: routes SPARQL by query content and Wikipedia by action/prop. */
function fakeNet({ rateLimitOnce = false } = {}) {
  const calls = [];
  let limited = !rateLimitOnce;
  const fetcher = async (url, options = {}) => {
    const query = options.body ? new URLSearchParams(options.body).get("query") : null;
    calls.push(query ? "sparql:" + (query.includes("EntitySearch") ? "search:" + /mwapi:search "([^"]*)"/.exec(query)[1] : query.includes("wdt:P5531 ?cik .\n  OPTIONAL") ? "company" : query.includes("VALUES ?p") ? "humans" : "people") : "wiki:" + new URL(url).searchParams.get("prop"));
    if (!limited && !query) { limited = true; throw Object.assign(new Error("Upstream responded 429"), { upstreamStatus: 429, retryAfter: "20" }); }
    if (query?.includes("EntitySearch")) {
      const term = /mwapi:search "([^"]*)"/.exec(query)[1];
      if (term === "Amy Hood") return { results: { bindings: [b({ cand: W + "Q20", candLabel: "Amy Hood", candDescription: "American businesswoman", ties: "person P108", image: FP + "Amy%20Hood.jpg" })] } };
      if (term === "David Russell") return { results: { bindings: [b({ cand: W + "Q314342", candLabel: "David O. Russell", candDescription: "film director", ties: "" })] } };
      return { results: { bindings: [] } };
    }
    if (query?.includes("VALUES ?p")) return { results: { bindings: [b({ p: W + "Q30", pLabel: "Kathleen Hogan" })] } };
    if (query?.includes("wdt:P5531")) {
      if (query.includes("?rel")) return { results: { bindings: [
        b({ item: W + "Q2283", person: W + "Q10", personLabel: "Satya Nadella", rel: "ceo", via: "P169", ended: "false", image: FP + "Satya%20Nadella.jpg" }),
        b({ item: W + "Q2283", person: W + "Q11", personLabel: "Brad Smith", rel: "officer", via: "P2828", ended: "false", article: "https://en.wikipedia.org/wiki/Brad_Smith_(American_lawyer)" }),
        b({ item: W + "Q2283", person: W + "Q12", personLabel: "Bill Gates", rel: "founder", via: "P112", ended: "false", image: FP + "Bill%20Gates.jpg" })
      ] } };
      return { results: { bindings: [b({ item: W + "Q2283", itemLabel: "Microsoft", article: "https://en.wikipedia.org/wiki/Microsoft" })] } };
    }
    const params = new URL(url).searchParams;
    if (params.get("prop") === "redirects") return { query: { pages: [{ title: "Microsoft", redirects: [{ title: "Microsoft Corporation" }] }] } };
    if (params.get("generator") === "search") {
      if (params.get("gsrsearch") === "\"Kathleen Hogan\"") return { query: { pages: [{ index: 1, title: "Kathleen Hogan", pageprops: { wikibase_item: "Q30" }, links: [{ title: "Microsoft" }], pageimage: "Kathleen_Hogan.jpg" }] } };
      return { query: { pages: [] } };
    }
    if (params.get("prop") === "pageprops|pageimages") return { query: { pages: [{ title: "Brad Smith (American lawyer)", pageprops: { wikibase_item: "Q11" }, pageimage: "Brad_Smith_2019.jpg" }] } };
    if (params.get("prop") === "imageinfo") {
      const titles = params.get("titles").split("|");
      return { query: { pages: titles.map(t => ({ title: t, imagerepository: "shared", imageinfo: [{ width: 800, height: 1000, descriptionurl: "https://commons.wikimedia.org/wiki/" + t.replace(/ /g, "_"), extmetadata: { Artist: { value: "Author " + t.slice(5, 9) }, LicenseShortName: { value: "CC BY 2.0" } } }] })) } };
    }
    throw new Error("unexpected " + url);
  };
  return { fetcher, calls };
}
function memoryStore() {
  const m = new Map();
  return { m, getRecord: async (k, key) => m.get(k + ":" + key)?.value ?? null, putRecord: async (k, key, value, ttl) => { m.set(k + ":" + key, { value: JSON.parse(JSON.stringify(value)), ttl }); } };
}

test("wikidataPhotos links, searches with a tie, uses own-article pageimages, credits files and caches", async () => {
  resetLanes();
  const { fetcher, calls } = fakeNet({ rateLimitOnce: true });
  const store = memoryStore();
  const sleeps = [];
  const insiders = [
    { name: "Nadella Satya", cik: "0001513142", isOfficer: true }, { name: "SMITH BRADFORD L", cik: "1", isOfficer: true },
    { name: "Hood Amy", cik: "2", isOfficer: true }, { name: "Hogan Kathleen T", cik: "3", isDirector: true },
    { name: "RUSSELL DAVID ERIC", cik: "4", isDirector: true }, { name: "Big Fund LP", cik: "5", role: "10% owner" }
  ];
  const r = await wikidataPhotos({ cik: "789019", companyName: "MICROSOFT CORP", insiders, fetcher, store, sleep: async ms => { sleeps.push(ms); } });
  assert.equal(r.companyQid, "Q2283");
  const by = Object.fromEntries(r.matches.map(m => [m.ownerName, m]));
  assert.deepEqual(Object.keys(by).sort(), ["Hogan Kathleen T", "Hood Amy", "Nadella Satya", "SMITH BRADFORD L"]);
  assert.equal(by["Nadella Satya"].rule, "wikidata-linked");
  assert.equal(by["Nadella Satya"].ownerCik, "1513142");
  assert.equal(by["Nadella Satya"].key, "cik:1513142");
  assert.equal(by["Nadella Satya"].photo.origin, "P18");
  assert.equal(by["Nadella Satya"].photo.credit, "Author Saty · CC BY 2.0");
  assert.equal(by["SMITH BRADFORD L"].photo.origin, "pageimage", "own-article pageimage when the item matches");
  assert.equal(by["SMITH BRADFORD L"].photo.src, "https://upload.wikimedia.org/wikipedia/commons/thumb/" + by["SMITH BRADFORD L"].photo.src.split("/thumb/")[1]);
  assert.equal(by["Hood Amy"].rule, "wikidata-search");
  assert.deepEqual(by["Hood Amy"].evidence.ties, ["person P108"]);
  assert.equal(by["Hogan Kathleen T"].rule, "wikipedia-search");
  assert.equal(by["Hogan Kathleen T"].photo.origin, "pageimage");
  assert.ok(!by["RUSSELL DAVID ERIC"], "a name-only candidate is never accepted");
  assert.deepEqual(r.leaders.map(l => l.name), ["Bill Gates"]);
  assert.equal(r.leaders[0].photo.file, "Bill Gates.jpg");
  assert.equal(r.complete, true);
  assert.ok(sleeps.some(ms => ms >= 19000), "a 429 waits for Retry-After before retrying");
  assert.ok(!calls.includes("sparql:search:Big Fund"), "10% owner entities are not searched");
  assert.equal(store.m.get("wikidata-people:789019").ttl, 7 * 86400000);

  const before = calls.length;
  const again = await wikidataPhotos({ cik: "789019", companyName: "MICROSOFT CORP", insiders, fetcher, store, sleep: async () => {} });
  assert.equal(calls.length, before, "a cached company makes no network calls");
  assert.deepEqual(again.matches.map(m => m.qid).sort(), r.matches.map(m => m.qid).sort());

  // A new insider only triggers the searches it needs.
  const more = await wikidataPhotos({ cik: "789019", companyName: "MICROSOFT CORP", insiders: [...insiders, { name: "Gates William H III", cik: "9", isDirector: true }], fetcher, store, sleep: async () => {} });
  assert.equal(calls.length, before, "linked people match without new requests");
  assert.equal(more.matches.find(m => m.ownerCik === "9").personName, "Bill Gates");
  assert.equal(more.leaders.length, 0);
});

test("companies without a Wikidata item are cached as empty, and errors are not cached as negatives", async () => {
  resetLanes();
  const store = memoryStore();
  let n = 0;
  const empty = async () => { n++; return { results: { bindings: [] } }; };
  const r = await wikidataPhotos({ cik: "1", insiders: [{ name: "Doe John", cik: "2" }], fetcher: empty, store, sleep: async () => {} });
  assert.deepEqual([r.companyQid, r.matches.length, n], [null, 0, 1]);
  await wikidataPhotos({ cik: "1", insiders: [], fetcher: empty, store, sleep: async () => {} });
  assert.equal(n, 1);
  const down = async () => { throw Object.assign(new Error("Upstream responded 500"), { upstreamStatus: 500 }); };
  await assert.rejects(wikidataPhotos({ cik: "2", insiders: [], fetcher: down, store, sleep: async () => {} }), /Wikidata unavailable/);
  assert.equal(store.m.has("wikidata-people:2"), false);
});

test("entitySearchPeople returns one tied match per name or nothing", async () => {
  resetLanes();
  const { fetcher } = fakeNet();
  const out = await entitySearchPeople({ companyQid: "Q2283", companyName: "MICROSOFT CORP", names: ["Hood Amy", "RUSSELL DAVID ERIC"], fetcher, sleep: async () => {} });
  assert.equal(out[0].match.qid, "Q20");
  assert.equal(out[1].match, null);
});

test("a company item without an SEC CIK is found by ticker only when exactly one listed item agrees with the SEC name", () => {
  assert.equal(pickTickerItem([{ id: "Q1347782", label: "Marvell Technology" }], "Marvell Technology, Inc."), "Q1347782");
  assert.equal(pickTickerItem([{ id: "Q1", label: "Pandora Media" }], "Everpure, Inc."), null, "a recycled ticker naming another company is refused");
  assert.equal(pickTickerItem([{ id: "Q1", label: "Ferguson plc" }, { id: "Q2", label: "Ferguson Enterprises" }], "Ferguson Enterprises Inc. /DE/"), null, "two agreeing items: no guess");
  assert.equal(pickTickerItem([], "Anything"), null);
  // Queries then start from that item instead of the CIK.
  for (const q of [peopleQuery("1835632", ["Q1347782"]), companyItemQuery("1835632", ["Q1347782"])]) {
    assert.match(q, /VALUES \?item \{ wd:Q1347782 \}/);
    assert.doesNotMatch(q, /P5531/);
  }
  assert.match(itemAnchor("1835632"), /wdt:P5531/);
  assert.match(itemAnchor("1835632", ["bad", "Q5"]), /wd:Q5 \}/);
});

test("with no company item at all, a Wikipedia article whose lead names the company still ties a filer to it", async () => {
  resetLanes();
  const asked = [];
  const fetcher = async (url, options = {}) => {
    asked.push(url);
    if (url.startsWith("https://query.wikidata.org/")) {
      const query = new URLSearchParams(options.body || "").get("query") || "";
      if (/wdt:P31 wd:Q5/.test(query)) return { results: { bindings: [b({ p: W + "Q6777103", pLabel: "Martine Rothblatt", image: FP + "Martine-Rothblatt2-5773.jpg" })] } };
      return { results: { bindings: [] } };
    }
    if (url.startsWith("https://en.wikipedia.org/w/api.php")) {
      return { query: { pages: [
        { index: 1, title: "Martine Rothblatt", pageprops: { wikibase_item: "Q6777103" }, extract: "Martine Aliana Rothblatt is an American lawyer, author, entrepreneur and the founder and chief executive of United Therapeutics.", description: "American entrepreneur" },
        { index: 2, title: "Martine Rothblatt (disambiguation)", pageprops: { wikibase_item: "Q99", disambiguation: "" } }
      ] } };
    }
    if (url.includes("commons.wikimedia.org") || url.includes("api.php")) return { query: { pages: [] } };
    throw Object.assign(new Error("unexpected " + url), { upstreamStatus: 404 });
  };
  const r = await wikidataPhotos({ cik: "1082554", companyName: "UNITED THERAPEUTICS Corp", insiders: [{ name: "ROTHBLATT MARTINE A", cik: "1106578", role: "Chairperson and CEO" }],
    fetcher, store: memoryStore(), sleep: async () => {} });
  assert.equal(r.companyQid, null);
  assert.deepEqual(r.matches.map(m => [m.ownerName, m.qid, m.rule]), [["ROTHBLATT MARTINE A", "Q6777103", "wikipedia-search"]]);
  const search = asked.find(u => u.startsWith("https://en.wikipedia.org/w/api.php"));
  assert.doesNotMatch(search, /pltitles|prop=[^&]*links/, "without the company's article no link test is asked for (it would match any link)");

  // The same article without the company in its lead ties nobody.
  resetLanes();
  const unrelated = async (url, options) => url.startsWith("https://en.wikipedia.org/w/api.php")
    ? { query: { pages: [{ index: 1, title: "Martine Rothblatt", pageprops: { wikibase_item: "Q6777103" }, extract: "An American lawyer and author.", description: "" }] } }
    : fetcher(url, options);
  const none = await wikidataPhotos({ cik: "1082554", companyName: "UNITED THERAPEUTICS Corp", insiders: [{ name: "ROTHBLATT MARTINE A", cik: "1106578", role: "CEO" }], fetcher: unrelated, store: memoryStore(), sleep: async () => {} });
  assert.deepEqual(none.matches, []);
});
