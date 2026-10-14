import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  tickerForms, sourceUrls, classifyFailure, identityRisk, nameTokens, namesAgree, infoboxParams, infoboxLogo, fileNameFrom,
  wikimediaFileUrls, acceptableWikidataLogo, parseWikidataItems, expandSvgEntities, strictBadge, darkMonochrome,
  opaqueTileColor, innerTileColor, framed, measureMark, prepareMark, resolveLogo, logoForTicker, KNOWN_BAD, LOGO_TTL, NEGATIVE_TTL, PARTIAL_TTL
} from "../src/logo-resolver.mjs";
import { iou, rasterize } from "../src/image-analysis.mjs";

/* ---------- fixtures (offline) ---------- */
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${body}</svg>`);
const CIRCLE_WHITE = svg('<circle cx="50" cy="50" r="40" fill="#ffffff"/>');
const CIRCLE_BLACK = svg('<circle cx="50" cy="50" r="40" fill="#000000"/>');
const CORNERS_WHITE = svg('<rect x="5" y="5" width="25" height="25" fill="#ffffff"/><rect x="70" y="70" width="25" height="25" fill="#ffffff"/>');
const WORDMARK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60" viewBox="0 0 300 60"><rect x="0" y="10" width="300" height="40" fill="#e0e0e0"/></svg>');
const BADGE = svg('<rect x="5" y="5" width="90" height="90" rx="8" fill="#1b2a5c"/><rect x="25" y="35" width="50" height="30" fill="#ffffff"/>');
const NOW = Date.parse("2026-10-14T00:00:00Z");
async function tilePng() {
  const inner = await sharp(svg('<circle cx="50" cy="50" r="30" fill="#d01010"/>'), { density: 72 }).png().toBuffer();
  return sharp({ create: { width: 100, height: 100, channels: 4, background: "#ffffff" } }).composite([{ input: inner }]).png().toBuffer();
}
const established = (extra = {}) => ({ name: "Example Corp", formerNames: [], filings: { recent: { form: ["10-K", "10-Q"], filingDate: ["2026-02-01", "2019-05-01"] }, files: [] }, ...extra });
const fresh = () => ({ name: "Example Corp", formerNames: [], filings: { recent: { form: ["8-A12B", "424B4", "S-1"], filingDate: ["2025-07-30", "2025-08-01", "2025-07-07"] }, files: [] } });
const httpError = status => Object.assign(new Error("Image responded " + status), { upstreamStatus: status });

/* A whole fake world: images by URL, Wikidata/Wikipedia payloads, SEC submissions, a store that
 * records what was cached. Unknown URLs are 404s. */
function world({ images = {}, wikidataItem = null, wikitext = null, submissions = established(), website = null } = {}) {
  const calls = [];
  const records = new Map();
  const puts = [];
  const media = new Map();
  const fetchers = {
    async image(url) {
      calls.push(url);
      const hit = images[url];
      if (hit instanceof Error) throw hit;
      if (!hit) throw httpError(404);
      return { bytes: hit.bytes, type: hit.type, url };
    },
    async text(url, options) {
      calls.push(url);
      if (url.startsWith("https://query.wikidata.org/")) {
        const query = new URLSearchParams(options.body).get("query");
        const byCik = /P5531/.test(query);
        if (!wikidataItem || (byCik && wikidataItem.via === "ticker") || (!byCik && wikidataItem.via !== "ticker")) return { results: { bindings: [] } };
        const row = { item: { value: "http://www.wikidata.org/entity/" + wikidataItem.id }, itemLabel: { value: wikidataItem.label } };
        if (wikidataItem.article) row.article = { value: wikidataItem.article };
        const rows = (wikidataItem.logos || [null]).map(logo => logo ? { ...row, logo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(logo) }, rank: { value: "http://wikiba.se/ontology#NormalRank" } } : row);
        return { results: { bindings: rows } };
      }
      if (url.startsWith("https://en.wikipedia.org/w/index.php")) {
        if (wikitext instanceof Error) throw wikitext;
        if (wikitext == null) throw httpError(404);
        return wikitext;
      }
      throw httpError(404);
    },
    async sec(url) {
      calls.push(url);
      if (url.endsWith("company_tickers.json")) return { 0: { cik_str: 1234, ticker: "EXM", title: "Example Corp" } };
      if (submissions instanceof Error) throw submissions;
      return submissions;
    },
    async website() { return website; }
  };
  const store = {
    async getRecord(kind, key) { return records.get(kind + ":" + key) || null; },
    async putRecord(kind, key, value, ttl) { records.set(kind + ":" + key, value); puts.push({ kind, key, ttl }); },
    async putMedia(image) {
      const sha = createHash("sha256").update(image.bytes).digest("hex");
      media.set(sha, image);
      return { sha, url: "/v1/media/" + sha + "." + image.type };
    }
  };
  return { fetchers, store, calls, puts, media, records };
}
const svgImage = bytes => ({ bytes, type: "svg" });
const urlsFor = ticker => sourceUrls(ticker);
const commons = name => wikimediaFileUrls(name).commons;

/* ---------- pure helpers ---------- */
test("each source gets its own share-class spelling", () => {
  assert.deepEqual(tickerForms("brk-b"), { sa: "brk.b", cmc: "BRK-B", fmp: "BRK-B", eodhd: ["brk-b", "BRK-B"], nvstly: "BRK-B" });
  const u = sourceUrls("BRK.B");
  assert.equal(u.s1Light, "https://logos.stockanalysis.com/brk.b.svg");
  assert.equal(u.s1Dark, "https://logos.stockanalysis.com/brk.b-dark.svg");
  assert.equal(u.s3Dark, "https://companiesmarketcap.com/img/company-logos/256/BRK-B.D.webp");
  assert.deepEqual(u.eodhd, ["https://eodhd.com/img/logos/US/brk-b.png", "https://eodhd.com/img/logos/US/BRK-B.png"]);
  assert.equal(tickerForms("../etc"), null);
});

test("429, 5xx, 403 and network errors are unknown; 404 and non-images are missing", () => {
  assert.equal(classifyFailure(httpError(404)), "missing");
  assert.equal(classifyFailure(httpError(410)), "missing");
  assert.equal(classifyFailure(new Error("Not an image")), "missing");
  for (const s of [429, 500, 503, 403]) assert.equal(classifyFailure(httpError(s)), "unknown", String(s));
  assert.equal(classifyFailure(new Error("fetch failed")), "unknown");
});

test("identity risk: recent rename or fresh listing, but not routine filings of an established filer", () => {
  const renamed = identityRisk(established({ name: "Core Natural Resources, Inc.", formerNames: [{ name: "CONSOL Energy Inc.", from: "2017-01-01", to: "2025-01-10" }] }), NOW);
  assert.equal(renamed.flag, true);
  assert.match(renamed.reasons[0], /CONSOL/);
  // Case/punctuation-only "renames" are SEC housekeeping, not a new identity.
  assert.equal(identityRisk(established({ name: "Cisco Systems, Inc.", formerNames: [{ name: "CISCO SYSTEMS, INC.", to: "2026-10-13" }] }), NOW).flag, false);
  // Older renames are outside the 36-month window.
  assert.equal(identityRisk(established({ formerNames: [{ name: "Facebook Inc", to: "2021-10-28" }] }), NOW).flag, false);
  const ipo = identityRisk(fresh(), NOW);
  assert.equal(ipo.flag, true);
  assert.equal(ipo.established, false);
  assert.ok(ipo.reasons.some(r => /8-A12B/.test(r)));
  const acquirer = established();
  acquirer.filings.recent.form.push("S-4", "8-A12B");
  acquirer.filings.recent.filingDate.push("2026-01-01", "2026-02-02");
  assert.equal(identityRisk(acquirer, NOW).flag, false);
  // Long filers whose recent page is all new still count as established through older pages.
  const big = fresh();
  big.filings.files = [{ name: "CIK-001.json", filingFrom: "2001-01-01", filingTo: "2024-01-01" }];
  assert.equal(identityRisk(big, NOW).flag, false);
  assert.deepEqual(identityRisk(null, NOW).flag, true);
  assert.equal(identityRisk(null, NOW).unknown, true);
});

test("names: significant tokens decide ticker-fallback identity", () => {
  assert.deepEqual(nameTokens("JPMORGAN CHASE & CO"), ["jpmorgan", "chase"]);
  assert.equal(namesAgree("ExxonMobil Holdings Corp", "ExxonMobil"), true);
  assert.equal(namesAgree("EXXON MOBIL CORP", "ExxonMobil"), true);
  assert.equal(namesAgree("Ares Management Corp", "Ares Management"), true);
  assert.equal(namesAgree("Dave Inc./DE", "Famous Dave's"), false);
  assert.equal(namesAgree("SHOULDER INNOVATIONS, INC.", "Siemens"), false);
  assert.equal(namesAgree("Core Natural Resources, Inc.", "Canadian National Railway"), false);
});

test("infobox logo: logo, then logo_image, then image only when it names a logo", () => {
  const text = `{{Short description|x}}
{{Infobox company
| name = Example
| logo = <!-- current -->[[File:Example Corp logo 2024.svg|frameless|250px|alt={{lang|en|x}}]]
| image = HQ.jpg
| founded = {{Start date|1999}}
}}
'''Example''' is a company.`;
  assert.equal(infoboxParams(text).name, "Example");
  assert.equal(infoboxLogo(text), "Example_Corp_logo_2024.svg");
  assert.equal(infoboxLogo("{{Infobox company\n| logo_image = Foo.png\n}}"), "Foo.png");
  assert.equal(infoboxLogo("{{Infobox company\n| image = Building.jpg\n}}"), null);
  assert.equal(infoboxLogo("{{Infobox company\n| image = Tutor Perini logo.png\n}}"), "Tutor_Perini_logo.png");
  assert.equal(infoboxLogo("no infobox here"), null);
  assert.equal(fileNameFrom("http://commons.wikimedia.org/wiki/Special:FilePath/Exxon%20Mobil%20Logo.svg"), "Exxon_Mobil_Logo.svg");
  assert.equal(fileNameFrom("[[File:../../etc/passwd.png]]"), null);
});

test("Wikimedia file URLs use the md5 path for Commons and the enwiki-local repository", () => {
  const u = wikimediaFileUrls("Example.jpg");
  assert.equal(u.commons, "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg");
  assert.equal(u.en, "https://upload.wikimedia.org/wikipedia/en/a/a9/Example.jpg");
  assert.equal(u.commonsThumb, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/500px-Example.jpg");
  assert.match(wikimediaFileUrls("a logo.svg").commonsThumb, /\/500px-A_logo\.svg\.png$/);
});

test("Wikidata P154 fallback rejects historic marks and other countries' entities", () => {
  assert.equal(acceptableWikidataLogo("Kroger_logo_(1961-2019).svg", "KROGER CO"), false);
  assert.equal(acceptableWikidataLogo("Prudential do Brasil logo.svg", "PRUDENTIAL FINANCIAL INC"), false);
  assert.equal(acceptableWikidataLogo("Apple logo black.svg", "Apple Inc."), true);
  const items = parseWikidataItems({ results: { bindings: [
    { item: { value: "http://www.wikidata.org/entity/Q1" }, itemLabel: { value: "X" }, logo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Old.svg" }, rank: { value: "http://wikiba.se/ontology#NormalRank" } },
    { item: { value: "http://www.wikidata.org/entity/Q1" }, itemLabel: { value: "X" }, logo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/New.svg" }, rank: { value: "http://wikiba.se/ontology#PreferredRank" } }
  ] } });
  assert.deepEqual(items[0].logos, ["New.svg"]);
});

/* ---------- pixels ---------- */
test("SVG DTD entities are expanded before rendering (Illustrator exports)", async () => {
  const withEntities = Buffer.from(`<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x" [<!ENTITY ns_svg "http://www.w3.org/2000/svg"><!ENTITY fill "#ffffff">]><svg xmlns="&ns_svg;" width="100" height="100"><circle cx="50" cy="50" r="40" fill="&fill;"/></svg>`);
  const expanded = expandSvgEntities(withEntities).toString();
  assert.doesNotMatch(expanded, /DOCTYPE|&ns_svg;/);
  const m = await measureMark(expandSvgEntities(withEntities), "svg");
  assert.ok(m.visible > .9);
});

test("strict badge: light content inside a dark shape, not a bright stroke beside dark text", async () => {
  const badge = await rasterize(BADGE, "svg", 256);
  assert.equal(strictBadge(badge.data, badge.width, badge.height), true);
  const amazonLike = await rasterize(svg('<rect x="5" y="20" width="90" height="25" fill="#111a22"/><rect x="5" y="60" width="90" height="25" fill="#ff9900"/>'), "svg", 256);
  assert.equal(strictBadge(amazonLike.data, amazonLike.width, amazonLike.height), false);
  // Colliers: navy badge with a white outline and bright stripes along the edge, white text inside.
  const outlined = await rasterize(svg('<rect x="4" y="14" width="92" height="72" rx="6" fill="#ffffff"/><rect x="7" y="17" width="86" height="56" fill="#1b2a5c"/><rect x="7" y="73" width="86" height="5" fill="#ffd200"/><rect x="7" y="78" width="86" height="5" fill="#6ec1e4"/><rect x="22" y="36" width="56" height="14" fill="#ffffff"/>'), "svg", 256);
  assert.equal(strictBadge(outlined.data, outlined.width, outlined.height), true);
  const navy = await rasterize(svg('<circle cx="50" cy="50" r="40" fill="#14206a"/>'), "svg", 256);
  assert.equal(darkMonochrome(navy.data, navy.width, navy.height), true);
  const prepared = await prepareMark(svg('<circle cx="50" cy="50" r="40" fill="#14206a"/>'), "svg");
  assert.equal(prepared.method, "recolor");
  const after = await measureMark(prepared.bytes, "png");
  assert.ok(after.visible > .95);
});

test("an opaque raster tile is keyed out even when the mark touches an edge", async () => {
  const tile = await tilePng();
  const r = await rasterize(tile, "png", 128);
  assert.deepEqual(opaqueTileColor(r.data, r.width, r.height).map(v => v > 240), [true, true, true]);
  const m = await measureMark(tile, "png");
  assert.equal(m.boxed, true);
  const prepared = await prepareMark(tile, "png");
  assert.match(prepared.method, /^debox/);
  const corner = await sharp(prepared.bytes).ensureAlpha().raw().toBuffer();
  assert.equal(corner[3], 0, "corner is transparent after preparation");
});

test("the shape fixtures behave as agreeing and disagreeing marks", async () => {
  const [a, b, c] = await Promise.all([measureMark(CIRCLE_WHITE, "svg"), measureMark(CIRCLE_BLACK, "svg"), measureMark(CORNERS_WHITE, "svg")]);
  assert.ok(iou(a.shape, b.shape) > .9);
  assert.ok(iou(a.shape, c.shape) < .5);
});

/* ---------- resolution ---------- */
test("unflagged company: stockanalysis symbol as square, Wikipedia wordmark as wide, cached 30 days", async () => {
  const u = urlsFor("EXM");
  const w = world({
    images: { [u.s1Light]: svgImage(CIRCLE_WHITE), [u.s1Dark]: svgImage(CIRCLE_WHITE), [commons("Example logo.svg")]: svgImage(WORDMARK) },
    wikidataItem: { id: "Q1", label: "Example", article: "https://en.wikipedia.org/wiki/Example_Corp" },
    wikitext: "{{Infobox company\n| logo = Example logo.svg\n}}"
  });
  const r = await resolveLogo({ ticker: "EXM", cik: "1234", name: "Example Corp" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.cik, "0000001234");
  assert.equal(r.variants.square.source, "stockanalysis");
  assert.equal(r.variants.square.method, "asis");
  assert.match(r.variants.square.url, /^\/v1\/media\/[a-f0-9]{64}\.png$/);
  assert.ok(r.variants.square.aspect <= 1.6);
  assert.equal(r.variants.wide.source, "wikipedia");
  assert.ok(r.variants.wide.aspect > 1.8);
  assert.equal(r.risk.flag, false);
  assert.equal(r.incomplete, false);
  assert.deepEqual(w.puts.map(p => p.ttl), [LOGO_TTL]);
  // Ticker sources after S3 are not fetched when S1 already resolved the company.
  assert.equal(w.calls.some(c => /financialmodelingprep|eodhd|nvstly/.test(c)), false);
  // A second call is served from the stored decision.
  const again = await resolveLogo({ ticker: "EXM", cik: "1234" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.deepEqual(again, r);
});

test("rule 1: a stockanalysis dark file with another shape is discarded and the light file recoloured", async () => {
  const u = urlsFor("NWF");
  const w = world({ images: { [u.s1Light]: svgImage(CIRCLE_BLACK), [u.s1Dark]: svgImage(CORNERS_WHITE) } });
  const r = await resolveLogo({ ticker: "NWF", cik: "77", name: "Norwood" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.variants.square.source, "stockanalysis");
  assert.equal(r.variants.square.method, "recolor");
  assert.ok(r.support.some(s => typeof s === "string" && /dark discarded/.test(s)));
  assert.equal(r.variants.wide, undefined);
});

test("identity risk: a disagreeing ticker logo loses to the CIK-keyed Wikipedia logo and is queued for review", async () => {
  const u = urlsFor("SI");
  const w = world({
    submissions: fresh(),
    images: { [u.s1Light]: svgImage(CIRCLE_WHITE), [u.s1Dark]: svgImage(CIRCLE_WHITE), [u.s3Light]: svgImage(CIRCLE_WHITE), [commons("Shoulder logo.svg")]: svgImage(CORNERS_WHITE) },
    wikidataItem: { id: "Q2", label: "Shoulder Innovations", article: "https://en.wikipedia.org/wiki/Shoulder_Innovations" },
    wikitext: "{{Infobox company\n| logo = [[File:Shoulder logo.svg]]\n}}"
  });
  const r = await resolveLogo({ ticker: "SI", cik: "88", name: "SHOULDER INNOVATIONS, INC." }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.risk.flag, true);
  assert.equal(r.variants.square.source, "wikipedia");
  assert.equal(r.review, true);
  assert.equal(Object.values(r.variants).some(v => /stockanalysis|companiesmarketcap/.test(v.source)), false);
});

test("identity risk without Wikipedia: stockanalysis is accepted, FMP/EODHD never unconfirmed", async () => {
  const u = urlsFor("NEWC");
  const tile = await tilePng();
  const onlyFmp = world({ submissions: fresh(), images: { [u.fmp]: { bytes: CIRCLE_WHITE, type: "svg" }, [u.eodhd[0]]: { bytes: tile, type: "png" } } });
  const none = await resolveLogo({ ticker: "NEWC", cik: "99", name: "New Co" }, { fetchers: onlyFmp.fetchers, store: onlyFmp.store, now: NOW });
  assert.equal(none.status, "none");
  assert.deepEqual(onlyFmp.puts.map(p => p.ttl), [NEGATIVE_TTL]);
  const withS1 = world({ submissions: fresh(), images: { [u.s1Light]: svgImage(CIRCLE_WHITE), [u.fmp]: { bytes: CIRCLE_WHITE, type: "svg" } } });
  const ok = await resolveLogo({ ticker: "NEWC", cik: "99", name: "New Co" }, { fetchers: withS1.fetchers, store: withS1.store, now: NOW });
  assert.equal(ok.variants.square.source, "stockanalysis");
});

test("seeded known-bad pairs are never used (PGOL's FMP image)", async () => {
  assert.ok(KNOWN_BAD.fmp.has("PGOL"));
  const u = urlsFor("PGOL");
  const w = world({ images: { [u.fmp]: { bytes: CIRCLE_WHITE, type: "svg" } } });
  const r = await resolveLogo({ ticker: "PGOL", cik: "101", name: "Patriot Gold" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "none");
});

test("an unreachable source is unknown: no negative result is cached", async () => {
  const u = urlsFor("ZZZ");
  const w = world({ images: { [u.s1Light]: httpError(429) } });
  const r = await resolveLogo({ ticker: "ZZZ", cik: "102", name: "Zed" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "none");
  assert.equal(r.incomplete, true);
  assert.equal(r.sources.stockanalysis, "unknown");
  assert.equal(w.puts.length, 0);
  // A found logo with an unreachable better source is kept only briefly.
  const v = world({ images: { [u.s1Light]: svgImage(CIRCLE_WHITE), [u.s1Dark]: httpError(503) } });
  const partial = await resolveLogo({ ticker: "ZZZ", cik: "102", name: "Zed" }, { fetchers: v.fetchers, store: v.store, now: NOW });
  assert.equal(partial.status, "ok");
  assert.deepEqual(v.puts.map(p => p.ttl), [PARTIAL_TTL]);
  // SEC unavailable: identity unknown is treated as risky and incomplete.
  const s = world({ submissions: new Error("SEC responded 503"), images: { [u.s1Light]: svgImage(CIRCLE_WHITE) } });
  const unknownRisk = await resolveLogo({ ticker: "ZZZ", cik: "102", name: "Zed" }, { fetchers: s.fetchers, store: s.store, now: NOW });
  assert.equal(unknownRisk.risk.unknown, true);
  assert.equal(unknownRisk.incomplete, true);
});

test("a boxed tile is the last resort and comes out deboxed", async () => {
  const u = urlsFor("TILE");
  // A second service showing the same mark confirms it.
  const w = world({ images: { [u.fmp]: { bytes: await tilePng(), type: "png" }, [u.nvstly]: { bytes: await tilePng(), type: "png" } } });
  const r = await resolveLogo({ ticker: "TILE", cik: "103", name: "Tile Co" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.variants.square.source, "fmp");
  assert.match(r.variants.square.method, /^debox/);
});

test("a logo only one ticker-keyed tile service supplies is not shown", async () => {
  // Audit: FMP showed Altex Inc. (Canada) for ALTX and EODHD a product brand for FMHS.
  const u = urlsFor("LONE");
  const w = world({ images: { [u.fmp]: { bytes: await tilePng(), type: "png" } } });
  const r = await resolveLogo({ ticker: "LONE", cik: "113", name: "Lone Co" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "none");
  assert.ok(r.support.some(n => /not confirmed/.test(String(n))));
});

test("checked-in overrides replace the sources, can crop, and can force no logo", async () => {
  const u = urlsFor("FIXD");
  const own = "https://fixed.example/logo.svg";
  const w = world({ images: { [u.s1Light]: svgImage(CIRCLE_WHITE), [own]: svgImage(CIRCLE_WHITE) } });
  const overrides = { "0000000114": { url: own, crop: { bottom: 0.1 }, reason: "test" }, "0000000115": { none: true } };
  const r = await resolveLogo({ ticker: "FIXD", cik: "114" }, { fetchers: w.fetchers, store: w.store, now: NOW, overrides });
  assert.equal(r.status, "ok");
  assert.equal(r.variants.square.source, "override");
  const none = await resolveLogo({ ticker: "FIXD", cik: "115" }, { fetchers: w.fetchers, store: w.store, now: NOW, overrides });
  assert.equal(none.status, "none");
});

test("website candidates fill in when ticker sources have nothing; a missing website module is harmless", async () => {
  const w = world({ website: [{ bytes: CIRCLE_WHITE, type: "svg", url: "https://example.com/logo.svg", kind: "json-ld" }] });
  const r = await resolveLogo({ ticker: "WEB", cik: "104", name: "Web Co" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.variants.square.source, "website");
  assert.equal(r.variants.square.sourceUrl, "https://example.com/logo.svg");
  const broken = world();
  broken.fetchers.website = async () => { throw new Error("module failed"); };
  const r2 = await resolveLogo({ ticker: "WEB", cik: "105", name: "Web Co" }, { fetchers: broken.fetchers, store: broken.store, now: NOW });
  assert.equal(r2.status, "none");
  assert.equal(r2.incomplete, true);
});

test("operator override can force no logo", async () => {
  const w = world({ images: { [urlsFor("OVR").s1Light]: svgImage(CIRCLE_WHITE) } });
  w.records.set("logo-override:0000000106", { none: true });
  const r = await resolveLogo({ ticker: "OVR", cik: "106" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "none");
  assert.equal(w.calls.length, 0);
});

test("invalid CIK is refused", async () => {
  await assert.rejects(resolveLogo({ ticker: "X", cik: "abc" }), /Invalid CIK/);
});

test("logoForTicker maps ticker to CIK and shares one resolution between concurrent callers", async () => {
  const u = urlsFor("EXM");
  const w = world({ images: { [u.s1Light]: svgImage(CIRCLE_WHITE) } });
  const options = { fetchers: w.fetchers, store: w.store, now: NOW };
  const [a, b] = await Promise.all([logoForTicker("exm", options), logoForTicker("EXM", options)]);
  assert.equal(a, b);
  assert.equal(a.cik, "0000001234");
  assert.equal(w.calls.filter(c => c === u.s1Light).length, 1);
  assert.equal(await logoForTicker("NOPE", options), null);
  assert.equal(await logoForTicker("bad ticker!", options), null);
});

test("an app-icon tile inside transparent padding is keyed out for the fallback services only", async () => {
  const icon = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect x="10" y="10" width="100" height="100" rx="22" fill="#6a1b9a"/><circle cx="60" cy="60" r="25" fill="#ffffff"/></svg>')).png().toBuffer();
  const r = await rasterize(icon, "png", 256);
  const color = innerTileColor(r.data, r.width, r.height);
  assert.ok(color && Math.abs(color[0] - 0x6a) < 8 && Math.abs(color[2] - 0x9a) < 8);
  assert.equal((await measureMark(icon, "png")).boxed, false);
  assert.equal((await measureMark(icon, "png", { innerTile: true })).boxed, true);
  const u = urlsFor("APPI");
  const w = world({ images: { [u.eodhd[0]]: { bytes: icon, type: "png" }, [u.nvstly]: { bytes: icon, type: "png" } } });
  const res = await resolveLogo({ ticker: "APPI", cik: "107", name: "App Co" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(res.variants.square.source, "eodhd");
  assert.match(res.variants.square.method, /^debox/);
  const png = w.media.get(res.variants.square.sha).bytes;
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let purple = 0;
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] > 128 && data[i * 4] < 140 && data[i * 4 + 2] > 120 && data[i * 4 + 1] < 60) purple++;
  assert.equal(purple, 0, "no tile colour left");
});

test("an unrenderable Wikipedia SVG falls back to its PNG thumbnail", async () => {
  const broken = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#fff"></svg>');
  const files = wikimediaFileUrls("Broken logo.svg");
  const thumb = await sharp(CORNERS_WHITE).png().toBuffer();
  const w = world({
    images: { [files.commons]: svgImage(broken), [files.commonsThumb]: { bytes: thumb, type: "png" } },
    wikidataItem: { id: "Q3", label: "Broken", article: "https://en.wikipedia.org/wiki/Broken" },
    wikitext: "{{Infobox company\n| logo = Broken logo.svg\n}}"
  });
  const r = await resolveLogo({ ticker: "BRKN", cik: "108", name: "Broken Corp" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.variants.square.source, "wikipedia");
  assert.equal(r.variants.square.sourceUrl, files.commonsThumb);
});

test("operator override URL replaces every source", async () => {
  const w = world({ images: { "https://example.com/brand.svg": svgImage(CIRCLE_WHITE), [urlsFor("OVU").s1Light]: svgImage(CORNERS_WHITE) } });
  w.records.set("logo-override:0000000109", { url: "https://example.com/brand.svg" });
  const r = await resolveLogo({ ticker: "OVU", cik: "109" }, { fetchers: w.fetchers, store: w.store, now: NOW });
  assert.equal(r.variants.square.source, "override");
  assert.deepEqual(w.calls, ["https://example.com/brand.svg"]);
});

test("a rounded tile on an opaque white canvas leaves no corner wedges or rim after keying", async () => {
  const icon = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><rect width="200" height="200" rx="40" fill="#6a1b9a"/><circle cx="100" cy="100" r="45" fill="none" stroke="#ffffff" stroke-width="8"/></svg>')).png().toBuffer();
  const prepared = await prepareMark(icon, "png", { innerTile: true });
  assert.match(prepared.method, /^debox/);
  const { data, info } = await sharp(prepared.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) assert.equal(data[(y * info.width + x) * 4 + 3], 0);
  assert.equal(framed(data, info.width, info.height), false);
  assert.ok(prepared.aspect > .9 && prepared.aspect < 1.1, "trimmed to the ring itself");
});
