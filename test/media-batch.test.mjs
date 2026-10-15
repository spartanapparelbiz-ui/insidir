import test from "node:test";
import assert from "node:assert/strict";

// Nothing in these tests may reach the network: every resolver is injected, and a stray upstream
// call fails loudly instead of waiting on a socket.
globalThis.fetch = async url => { throw new Error("Network used in a unit test: " + url); };
// The route needs a configured SEC contact before it answers (config reads it once, at import).
process.env.SEC_USER_AGENT ||= "Insidir Research hello@aethric.llc";
const { parseMediaQuery, mediaBatch, createMediaState, indexMaps, ownersParams, loadOwnersFrom, OWNERS_SQL, loadIssuersFrom, ISSUERS_SQL, createLimiter } = await import("../src/media-batch.mjs");
const { handleCompanyRoute, START_ALLOWANCE } = await import("../src/company-routes.mjs");
const { createPhotoQueue, mergeRoster, cleanExtras, withoutTakedowns, blockPersonPhoto } = await import("../src/people-photos.mjs");
const store = await import("../src/media-store.mjs");
const { groupRecent, warmMedia, RECENT_SQL } = await import("../src/media-warm.mjs");

const INDEX = {
  0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  1: { cik_str: 37996, ticker: "F", title: "FORD MOTOR CO" },
  2: { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
  3: { cik_str: 1067983, ticker: "BRK-A", title: "BERKSHIRE HATHAWAY INC" },
  4: { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  5: { cik_str: 21344, ticker: "KO", title: "COCA COLA CO" },
  6: { cik_str: 797468, ticker: "OXY", title: "OCCIDENTAL PETROLEUM CORP" }
};
for (let i = 0; i < 30; i++) INDEX[100 + i] = { cik_str: 9000000 + i, ticker: "T" + String(i).padStart(2, "0"), title: "Test Company " + i };
const AAPL = "0000320193", KO = "0000021344", NVDA = "0001045810";
const sha = c => c.repeat(64);
const png = c => "/v1/media/" + sha(c) + ".png", webp = c => "/v1/media/" + sha(c) + ".webp";
const q = search => parseMediaQuery(new URL("http://x/v1/media?" + search));
const settle = () => new Promise(r => setTimeout(r, 5));

/* A memory world: records and stored bytes, resolver stubs that record every call. jobs: issuer
 * CIK (10 digits) -> "queued" | "running" for photo jobs someone else started. */
function world({ records = {}, stored = [], owners = [], issuers = [], jobs = {}, ticket = () => ({ status: "queued", started: true }) } = {}) {
  const rec = new Map(Object.entries(records));
  const media = new Set(stored.map(sha));
  const calls = { logo: [], resolve: [], photos: [], owners: [], issuers: [], jobs: [], records: [] };
  const gates = new Map(); // ticker -> {resolve, reject} for logo resolutions
  let clock = 1_800_000_000_000;
  const deps = {
    state: createMediaState(),
    now: () => clock,
    tickerIndex: async () => INDEX,
    getRecord: async (kind, key) => { calls.records.push(kind + ":" + key); return rec.get(kind + ":" + key) ?? null; },
    hasMedia: async s => media.has(s),
    logoForTicker: (t, options) => { calls.logo.push([t, options]); return new Promise((resolve, reject) => gates.set(t, { resolve, reject })); },
    resolveLogo: (subject, options) => { calls.resolve.push([subject, options]); return new Promise((resolve, reject) => gates.set("cik:" + subject.cik, { resolve, reject })); },
    requestPhotos: async options => { calls.photos.push(options); return ticket(options); },
    photoJob: async cik => { calls.jobs.push(cik); return jobs[cik] ?? null; },
    logoPrep: async () => null,
    loadOwners: async pairs => { calls.owners.push(pairs); return owners; },
    loadIssuers: async ciks => { calls.issuers.push(ciks); return issuers.map(issuer_cik => ({ issuer_cik })); }
  };
  return { deps, calls, rec, media, gates, jobs, tick: ms => { clock += ms; } };
}
const okLogo = (cik, variants) => ({ status: "ok", cik, variants, incomplete: false });
const SQUARE = { url: png("a"), sha: sha("a"), width: 306, height: 370, source: "stockanalysis-dark" };
const WIDE = { url: png("b"), sha: sha("b"), width: 548, height: 163, source: "wikipedia" };

test("media query: limits, validation, de-duplication and BRK.B as BRK-B", () => {
  const parsed = q("tickers=aapl,BRK.B,bad!,AAPL&people=1214156:AAPL,0001214156:aapl,x:AAPL,12:,0:AAPL&ciks=0000320193,abc&wait=99999");
  assert.deepEqual(parsed.tickers, ["AAPL", "BRK-B"]);
  assert.deepEqual(parsed.people, [{ cik: "1214156", ticker: "AAPL", pair: "1214156:AAPL" }], "padded and unpadded CIKs are one person");
  assert.deepEqual(parsed.ciks, ["320193"]);
  assert.equal(parsed.wait, 1500, "wait is capped at 1.5 s");
  assert.deepEqual(parsed.invalid, ["bad!", "x:AAPL", "12:", "0:AAPL", "abc"]);
  assert.equal(q("tickers=F&wait=-5").wait, 0);
  assert.equal(q("tickers=F&wait=soon").wait, 0);
  assert.deepEqual(q("people=1:BRK.B").people[0].ticker, "BRK-B");
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join(",");
  for (const search of ["tickers=" + many(61, i => "T" + i), "people=" + many(101, i => (i + 1) + ":AAPL"), "ciks=" + many(61, i => i + 1), "tickers=bad!", "", "people=AAPL"])
    assert.throws(() => q(search), e => e.status === 400, search);
  assert.equal(q("tickers=" + many(60, i => "T" + i)).tickers.length, 60);
  assert.equal(q("people=" + many(100, i => (i + 1) + ":AAPL")).people.length, 100);
});

test("ticker maps are built once per index and keep the SEC's first entry for a shared CIK", () => {
  const maps = indexMaps(INDEX);
  assert.equal(indexMaps(INDEX), maps, "memoised per index object");
  assert.deepEqual(maps.byTicker.get("AAPL"), { ticker: "AAPL", cik: AAPL, name: "Apple Inc." });
  assert.equal(maps.byCik.get("1067983"), "BRK-B");
  assert.equal(maps.byCik.get("0001067983"), undefined, "keys are CIKs without leading zeros");
});

test("cached logos: square first with the wide one as alt, wide-only marks, none and unknown tickers are null", async () => {
  const w = world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE, wide: WIDE }), ["logo:0000037996"]: okLogo("0000037996", { wide: { ...WIDE, url: png("c"), sha: sha("c") } }),
    ["logo:" + KO]: { status: "none", cik: KO, variants: {} } }, stored: ["a", "b", "c"] });
  const body = await mediaBatch(q("tickers=AAPL,F,KO,ZZZZ"), w.deps);
  assert.deepEqual(body.logos.AAPL, { src: png("a"), w: 306, h: 370, source: "stockanalysis-dark", name: "Apple Inc.", alt: { src: png("b"), w: 548, h: 163 } });
  assert.deepEqual(body.logos.F, { src: png("c"), w: 548, h: 163, source: "wikipedia", name: "FORD MOTOR CO" });
  assert.equal(body.logos.KO, null);
  assert.equal(body.logos.ZZZZ, null, "not in the SEC ticker file");
  assert.deepEqual(body.pending, { logos: [], photos: [] });
  assert.equal(body.retryAfter, 0);
  assert.equal(w.calls.logo.length, 0, "nothing is resolved when the records answer");
});

test("uncached logos are pending, start one resolution per CIK and at most 20 per request", async () => {
  const w = world();
  const tickers = ["BRK-A", "BRK.B", ...Array.from({ length: 25 }, (_, i) => "T" + String(i).padStart(2, "0"))];
  const first = await mediaBatch(q("tickers=" + tickers.join(",")), w.deps);
  assert.equal(first.pending.logos.length, 27);
  assert.equal(Object.keys(first.logos).length, 0);
  assert.equal(first.retryAfter, 3);
  assert.equal(w.deps.state.running.size, 20, "20 new resolutions; BRK-A and BRK-B share one");
  assert.deepEqual(w.deps.state.logos.stats(), { active: 4, queued: 16 }, "four at a time");
  const again = await mediaBatch(q("tickers=" + tickers.join(",")), w.deps);
  assert.equal(again.pending.logos.length, 27);
  assert.equal(w.deps.state.running.size, 26, "a second request joins the running ones and starts the rest");
  await settle();
  assert.equal(new Set(w.calls.logo.map(([t]) => t)).size, w.calls.logo.length, "no ticker resolved twice");
});

test("an incomplete none settles to null; wait lets a fast logo land; a resolver error is retried later, not null", async () => {
  const w = world();
  let body = await mediaBatch(q("tickers=F"), w.deps);
  assert.deepEqual(body.pending.logos, ["F"]);
  w.gates.get("F").resolve({ status: "none", incomplete: true, variants: {} }); // the resolver caches no incomplete none
  await settle();
  body = await mediaBatch(q("tickers=F"), w.deps);
  assert.equal(body.logos.F, null);
  assert.equal(w.calls.logo.length, 1, "not resolved again within 15 minutes");
  w.tick(16 * 60 * 1000);
  body = await mediaBatch(q("tickers=F"), w.deps);
  assert.deepEqual(body.pending.logos, ["F"], "after 15 minutes it is tried again");

  // wait: the resolution finishes while the request holds, and lands in this response.
  const v = world();
  const holding = mediaBatch(q("tickers=AAPL&wait=1500"), v.deps);
  await settle();
  v.rec.set("logo:" + AAPL, okLogo(AAPL, { square: SQUARE }));
  v.media.add(sha("a"));
  v.gates.get("AAPL").resolve(okLogo(AAPL, { square: SQUARE }));
  body = await holding;
  assert.equal(body.logos.AAPL.src, png("a"));
  assert.deepEqual(body.pending.logos, []);

  const e = world();
  await mediaBatch(q("tickers=KO"), e.deps);
  e.gates.get("KO").reject(new Error("SEC unavailable"));
  await settle();
  body = await mediaBatch(q("tickers=KO"), e.deps);
  assert.deepEqual(body.pending.logos, ["KO"], "an error is not 'no logo'");
  assert.equal(e.calls.logo.length, 1, "backs off instead of retrying at once");
  e.tick(61 * 1000);
  await mediaBatch(q("tickers=KO"), e.deps);
  assert.equal(e.calls.logo.length, 2);
});

test("a stored logo whose bytes are gone is refreshed, not served", async () => {
  const w = world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE }) } });
  const body = await mediaBatch(q("tickers=AAPL"), w.deps);
  assert.deepEqual(body.pending.logos, ["AAPL"]);
  assert.deepEqual(w.calls.logo, [["AAPL", { refresh: true }]]);
});

test("a logo prepared by an older pass is resolved again (once), not served", async () => {
  const w = world({ records: { ["logo:" + AAPL]: { ...okLogo(AAPL, { square: SQUARE }), prep: 1 }, ["logo:" + KO]: { ...okLogo(KO, { square: { ...SQUARE, url: png("c"), sha: sha("c") } }), prep: 2 } }, stored: ["a", "c"] });
  w.deps.logoPrep = async () => 2;
  const body = await mediaBatch(q("tickers=AAPL,KO"), w.deps);
  assert.deepEqual(body.pending.logos, ["AAPL"]);
  assert.equal(body.logos.KO.src, png("c"));
  assert.deepEqual(w.calls.logo, [["AAPL", { refresh: true }]]);
  // The resolution returns a record without the stamp: it is served, not refreshed again.
  w.gates.get("AAPL").resolve(okLogo(AAPL, { square: SQUARE }));
  await settle();
  assert.equal((await mediaBatch(q("tickers=AAPL"), w.deps)).logos.AAPL.src, png("a"));
  assert.equal(w.calls.logo.length, 1);
  // A resolver without a preparation version: every ok record is served as before.
  const old = world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE }) }, stored: ["a"] });
  assert.equal((await mediaBatch(q("tickers=AAPL"), old.deps)).logos.AAPL.src, png("a"));
});

test("issuer CIKs without a ticker resolve by CIK only when the SEC import has filings for them", async () => {
  const w = world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE }) }, stored: ["a"], issuers: ["0001234567"] });
  const body = await mediaBatch(q("ciks=320193,0001234567,4100000000"), w.deps);
  assert.equal(body.logos["cik:320193"].src, png("a"));
  assert.equal(body.logos["cik:320193"].ticker, "AAPL");
  assert.deepEqual(body.pending.logos, ["cik:1234567"]);
  assert.equal(body.logos["cik:4100000000"], null, "a number no filing names is no company: null");
  assert.deepEqual(w.calls.resolve, [[{ cik: "0001234567" }, {}]], "and starts no resolution (no SEC request)");
  assert.deepEqual(w.calls.issuers, [["1234567", "4100000000"]], "one lookup, unlisted CIKs only");
  // The import is unreachable: asked again later, nothing resolved meanwhile.
  const down = world();
  down.deps.loadIssuers = async () => { throw new Error("connection refused"); };
  const later = await mediaBatch(q("ciks=1234567"), down.deps);
  assert.deepEqual(later.pending.logos, ["cik:1234567"]);
  assert.equal(down.calls.resolve.length, 0);
  // The website preview has no database: only listed CIKs resolve.
  const preview = world();
  preview.deps.loadIssuers = null;
  assert.equal((await mediaBatch(q("ciks=1234567"), preview.deps)).logos["cik:1234567"], null);
  assert.equal(preview.calls.resolve.length, 0);
  // The issuer lookup asks for both spellings in one query.
  const seen = [];
  await loadIssuersFrom(async (sql, params) => { seen.push([sql, params]); return { rows: [] }; }, ["1234567", "x"]);
  assert.deepEqual(seen, [[ISSUERS_SQL, [["1234567", "0001234567"]]]]);
});

test("a verified person photo is returned with credit and source wherever that CIK files", async () => {
  const photo = { src: webp("d"), source: "sec-proxy", sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/x.htm", credit: "SEC proxy statement (DEF 14A, filed 2026-01-08)", personName: "COOK TIMOTHY D" };
  const w = world({ records: { "person-photo:1214156": photo, ["company-photos:" + NVDA]: { complete: true, roster: [], names: { "cik:1214156": "Tim Cook" } } }, stored: ["d"] });
  const body = await mediaBatch(q("people=0001214156:NVDA"), w.deps);
  assert.deepEqual(body.photos["1214156"], { src: webp("d"), w: 256, h: 256, source: "sec-proxy", credit: photo.credit, sourceUrl: photo.sourceUrl, name: "Tim Cook" });
  assert.ok("NVDA" in body.logos || body.pending.logos.includes("NVDA"), "the issuer logo is always part of the answer");
  assert.equal(w.calls.owners.length + w.calls.photos.length, 0, "no lookup or job for an answered person");
  // A takedown record keeps it off the page.
  w.rec.set("person-photo-override:1214156", { none: true });
  assert.equal((await mediaBatch(q("people=1214156:NVDA"), w.deps)).photos["1214156"], null);
});

test("finished company: on the roster -> null; off it -> the job gets the name from the database; unconfirmed -> null and no job", async () => {
  const company = { complete: true, roster: ["cik:111"], photos: {}, names: {} };
  const w = world({ records: { ["company-photos:" + AAPL]: company }, owners: [{ owner_cik: "0000000222", ticker: "AAPL", owner_name: "ADAMS KATHERINE L" }] });
  const body = await mediaBatch(q("people=111:AAPL,222:AAPL,333:AAPL"), w.deps);
  assert.equal(body.photos["111"], null, "the job looked and found no photo");
  assert.equal(body.photos["333"], null, "an owner the import does not confirm is never looked for");
  assert.deepEqual(body.pending.photos, ["222:AAPL"]);
  assert.deepEqual(w.calls.owners, [[{ cik: "222", ticker: "AAPL" }, { cik: "333", ticker: "AAPL" }]], "one lookup, owners off the roster only");
  assert.equal(w.calls.photos.length, 1);
  assert.deepEqual(w.calls.photos[0], { ticker: "AAPL", cik: AAPL, extra: [{ cik: "222", name: "ADAMS KATHERINE L" }], keys: [], priority: "user", requester: "anonymous", rerun: true, create: true });
  // Nothing the client could send carries a name: the query has none, and the job saw only the database's.
  assert.ok(!JSON.stringify(w.calls.photos).includes("333"));

  // The re-run for that person already ran in the last 6 hours: null, not pending forever.
  const t = world({ records: { ["company-photos:" + AAPL]: company }, owners: [{ owner_cik: "222", ticker: "AAPL", owner_name: "ADAMS KATHERINE L" }], ticket: () => ({ status: "throttled", started: false }) });
  assert.equal((await mediaBatch(q("people=222:AAPL"), t.deps)).photos["222"], null);

  // The database is down: pending, and no job is started on an unconfirmed name.
  const down = world({ records: { ["company-photos:" + AAPL]: company } });
  down.deps.loadOwners = async () => { throw new Error("connection refused"); };
  const answer = await mediaBatch(q("people=222:AAPL"), down.deps);
  assert.deepEqual(answer.pending.photos, ["222:AAPL"]);
  assert.equal(down.calls.photos.length, 0);
});

test("unfinished companies: one queued job per company for confirmed owners, pending, and a cap on new jobs per request", async () => {
  const owners = [{ owner_cik: "1214156", ticker: "AAPL", owner_name: "COOK TIMOTHY D" }, { owner_cik: "7", ticker: "KO", owner_name: "QUINCEY JAMES" }];
  const w = world({ records: { ["company-photos:" + KO]: { complete: false, photos: {} } }, owners });
  const body = await mediaBatch(q("people=1214156:AAPL,5:AAPL,7:KO"), w.deps);
  assert.deepEqual(body.pending.photos, ["1214156:AAPL", "5:AAPL", "7:KO"], "5 is unconfirmed, but waits for the AAPL job a confirmed owner started");
  assert.deepEqual(body.queued, ["1214156:AAPL", "5:AAPL", "7:KO"], "jobs still waiting for their turn are listed, so a client keeps waiting");
  assert.equal(body.retryAfter, 15, "queued jobs: ask again in 15 s");
  assert.deepEqual(w.calls.photos.map(c => [c.ticker, c.rerun, c.extra.map(e => e.name)]), [["AAPL", false, ["COOK TIMOTHY D"]], ["KO", false, ["QUINCEY JAMES"]]]);
  const running = world({ owners, ticket: () => ({ status: "running", started: false }) });
  assert.deepEqual((await mediaBatch(q("people=1214156:AAPL"), running.deps)).queued, [], "a running job is not 'queued'");
  const people = Array.from({ length: 14 }, (_, i) => ({ owner_cik: String(i + 1), ticker: "T" + String(i).padStart(2, "0"), owner_name: "PERSON NUMBER " + i }));
  const many = world({ owners: people, ticket: o => ({ status: o.create ? "queued" : "none", started: o.create }) });
  await mediaBatch(q("people=" + people.map(p => p.owner_cik + ":" + p.ticker).join(",")), many.deps);
  assert.equal(many.calls.photos.filter(c => c.create).length, 10, "at most 10 new company jobs per request");
  assert.equal(many.calls.photos.length, 14, "the rest may only join jobs already running");
});

test("a made-up owner starts no job at an unfinished company either; it only waits for a job already under way", async () => {
  // KO: an unfinished record and no job; NVDA: no record; AAPL: someone else's job is running.
  const w = world({ records: { ["company-photos:" + KO]: { complete: false, photos: {} } }, jobs: { [AAPL]: "running", [NVDA]: null } });
  const body = await mediaBatch(q("people=900000001:KO,900000002:NVDA,900000003:AAPL"), w.deps);
  assert.equal(body.photos["900000001"], null);
  assert.equal(body.photos["900000002"], null);
  assert.deepEqual(body.pending.photos, ["900000003:AAPL"]);
  assert.deepEqual(body.queued, []);
  assert.equal(w.calls.photos.length, 0, "no company job is started or extended");
  assert.equal(w.calls.owners.length, 1, "one owner lookup for the whole request");
  // The engine's database is down: pending, with nothing started on an unconfirmed pair.
  const down = world();
  down.deps.loadOwners = async () => { throw new Error("connection refused"); };
  assert.deepEqual((await mediaBatch(q("people=900000002:NVDA"), down.deps)).pending.photos, ["900000002:NVDA"]);
  assert.equal(down.calls.photos.length + down.calls.jobs.length, 0);
  // The website preview has no database: there a company's own roster job may still start.
  const preview = world();
  preview.deps.loadOwners = null;
  const shown = await mediaBatch(q("people=900000002:NVDA"), preview.deps);
  assert.deepEqual(shown.pending.photos, ["900000002:NVDA"]);
  assert.deepEqual(preview.calls.photos.map(c => [c.ticker, c.extra]), [["NVDA", []]]);
  assert.equal(preview.calls.owners.length, 0);
});

test("entity owners get an owners entry: a listed CIK with its own ticker and logo, a fund by its filed name", async () => {
  const w = world({ records: { ["logo:0001067983"]: okLogo("0001067983", { square: SQUARE }), ["company-photos:0000797468"]: { complete: true, roster: [], entities: [] } }, stored: ["a"],
    owners: [{ owner_cik: "0001412093", ticker: "OXY", owner_name: "SILVER LAKE PARTNERS LP" }] });
  const body = await mediaBatch(q("people=1067983:OXY,1412093:OXY"), w.deps);
  assert.deepEqual(body.owners, { 1067983: { entity: true, ticker: "BRK-B" }, 1412093: { entity: true, ticker: null } });
  assert.equal(body.photos["1067983"], null);
  assert.equal(body.photos["1412093"], null);
  assert.equal(body.logos["BRK-B"].src, png("a"), "the owner's own logo comes with it");
  assert.equal(w.calls.photos.length, 0, "no face is looked for");
  // The roster already knows a filer is an entity: no database needed (website preview).
  const preview = world({ records: { ["company-photos:" + AAPL]: { complete: true, roster: [], entities: ["cik:42"] } } });
  assert.deepEqual((await mediaBatch(q("people=42:AAPL"), preview.deps)).owners, { 42: { entity: true, ticker: null } });
});

test("a photo whose bytes are gone is not served: the company is looked at again", async () => {
  const photo = { src: webp("e"), source: "wikimedia", credit: "Tessa Bury · CC BY 4.0", personName: "Tim Cook" };
  const w = world({ records: { "person-photo:1214156": photo, ["company-photos:" + AAPL]: { complete: true, roster: ["cik:1214156"], photos: { "cik:1214156": photo } } } });
  const body = await mediaBatch(q("people=1214156:AAPL"), w.deps);
  assert.deepEqual(body.pending.photos, ["1214156:AAPL"]);
  assert.deepEqual(w.calls.photos[0].keys, ["cik:1214156"]);
  assert.equal(w.calls.photos[0].rerun, true);
  w.media.add(sha("e"));
  const settled = await mediaBatch(q("people=1214156:AAPL"), w.deps);
  assert.equal(settled.photos["1214156"].name, "Tim Cook");
  assert.equal(settled.photos["1214156"].credit, "Tessa Bury · CC BY 4.0");
});

test("GET /v1/media: settled answers are cached privately, pending ones not at all; 400 and 429", async () => {
  const call = async (path, deps, ip = "10.0.0.1") => {
    const res = { status: 0, headers: {}, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b; } };
    try {
      await handleCompanyRoute({ method: "GET", headers: {}, socket: { remoteAddress: ip } }, res, new URL(path, "http://x"), { mediaDeps: deps });
      return { status: res.status, headers: res.headers, body: JSON.parse(res.body) };
    } catch (e) { return { status: e.status, error: e.message }; }
  };
  const done = world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE }) }, stored: ["a"] });
  let r = await call("/v1/media?tickers=AAPL", done.deps);
  assert.equal(r.status, 200);
  assert.equal(r.headers["Cache-Control"], "private, max-age=300");
  assert.equal(r.headers["Content-Type"], "application/json; charset=utf-8");
  r = await call("/v1/media?tickers=AAPL,F", world({ records: { ["logo:" + AAPL]: okLogo(AAPL, { square: SQUARE }) }, stored: ["a"] }).deps);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.body.pending.logos, ["F"]);
  assert.equal((await call("/v1/media?tickers=bad!", done.deps)).status, 400);
  assert.equal((await call("/v1/media", done.deps)).status, 400);
  for (let i = 0; i < 120; i++) assert.equal((await call("/v1/media?tickers=AAPL", done.deps, "203.0.113.7")).status, 200);
  r = await call("/v1/media?tickers=AAPL", done.deps, "203.0.113.7");
  assert.deepEqual(r, { status: 429, error: "Too many media requests. Try again shortly." });
});

test("owner lookups ask for both CIK and ticker spellings, and only exact pairs count", async () => {
  assert.deepEqual(ownersParams([{ cik: "1214156", ticker: "BRK-B" }, { cik: "0000000001", ticker: "AAPL" }, { cik: "x", ticker: "AAPL" }]),
    [["1214156", "0001214156", "1", "0000000001"], ["BRK-B", "BRK.B", "AAPL"]]);
  const seen = [];
  const rows = await loadOwnersFrom(async (sql, params) => { seen.push([sql, params]); return { rows: [{ owner_cik: "0001214156", ticker: "BRK.B", owner_name: "COOK TIMOTHY D" }] }; }, [{ cik: "1214156", ticker: "BRK-B" }]);
  assert.equal(seen[0][0], OWNERS_SQL);
  assert.equal(rows.length, 1);
  assert.deepEqual(await loadOwnersFrom(async () => { throw new Error("must not query"); }, []), []);
  // A row for a pair nobody asked about (same owner, another issuer) is ignored.
  const w = world({ records: { ["company-photos:" + AAPL]: { complete: true, roster: [] } }, owners: [{ owner_cik: "222", ticker: "MSFT", owner_name: "SOMEONE ELSE" }, { owner_cik: "0000000222", ticker: "AAPL", owner_name: "ADAMS KATHERINE L" }] });
  await mediaBatch(q("people=222:AAPL"), w.deps);
  assert.deepEqual(w.calls.photos[0].extra, [{ cik: "222", name: "ADAMS KATHERINE L" }]);
});

test("the logo limiter shares its slots between requesters and caps each one's waiting jobs", async () => {
  const limiter = createLimiter(1, { maxPerRequester: 2 });
  const order = [];
  let release;
  limiter.run(() => new Promise(r => { release = r; }), "user", "ip:a");
  const runs = ["a1", "a2", "a3"].map(n => limiter.run(async () => order.push(n), "user", "ip:a"));
  assert.deepEqual(runs.map(r => r.accepted), [true, true, false]);
  await assert.rejects(runs[2].promise, e => e.busy === true);
  limiter.run(async () => order.push("b1"), "user", "ip:b");
  await settle();
  release();
  await settle();
  assert.deepEqual(order, ["b1", "a1", "a2"], "the requester served least recently goes first");
});

test("the priority limiter runs page work before warm-up work and can promote a waiting job", async () => {
  const limiter = createLimiter(1);
  const order = [];
  let release;
  limiter.run(() => new Promise(r => { release = r; }), "user");
  limiter.run(async () => order.push("warm-1"), "warm");
  const promoted = limiter.run(async () => order.push("warm-2"), "warm");
  limiter.run(async () => order.push("user"), "user");
  limiter.promote(promoted.job);
  await settle();
  release();
  await settle();
  assert.deepEqual(order, ["user", "warm-2", "warm-1"]);
});

/* ---------------- people-photos: the job queue and the roster ---------------- */

const gated = () => {
  const started = [], gates = new Map();
  const execute = entry => { started.push({ cik: entry.cik, priority: entry.priority, extras: [...entry.extras.keys()], rerun: entry.rerun }); return new Promise(r => gates.set(entry.cik, r)); };
  return { started, gates, execute };
};

test("photo jobs: two run at once, a third waits its turn, and pages go before the warm-up", async () => {
  const g = gated();
  const queue = createPhotoQueue({ concurrency: 2, execute: g.execute });
  assert.deepEqual(queue.request({ ticker: "A", cik: "1", priority: "warm" }), { status: "running", started: true });
  queue.request({ ticker: "B", cik: "2", priority: "warm" });
  queue.request({ ticker: "C", cik: "3", priority: "warm" });
  queue.request({ ticker: "D", cik: "4", priority: "user" });
  await settle();
  assert.deepEqual(g.started.map(s => s.cik), ["0000000001", "0000000002"]);
  assert.equal(queue.entry("3").status, "queued");
  assert.deepEqual(queue.stats(), { running: 2, queued: 2, warmQueued: 1 });
  g.gates.get("0000000001")({ roster: [] });
  await settle();
  assert.equal(g.started[2].cik, "0000000004", "the page's company goes before the warm-up");
  assert.deepEqual(queue.request({ ticker: "C", cik: "3", priority: "user" }), { status: "queued", started: false }, "asking again joins the waiting job");
  g.gates.get("0000000002")({ roster: [] });
  await settle();
  assert.equal(g.started[3].cik, "0000000003");
  assert.equal(g.started[3].priority, "user", "promoted when a page asked for it");
  assert.equal(queue.request({ ticker: "A", cik: "1" }).status, "settling", "a job that just finished is read, not restarted");
});

test("photo jobs: one requester cannot fill the queue, and requesters are served in turn", async () => {
  const g = gated();
  const queue = createPhotoQueue({ concurrency: 1, reserved: 0, execute: g.execute, maxPerRequester: 3 });
  const asks = [1, 2, 3, 4, 5].map(i => queue.request({ ticker: "A" + i, cik: String(i), requester: "ip:flood" }));
  assert.deepEqual(asks.map(a => a.status), ["running", "queued", "queued", "queued", "busy"], "three waiting jobs each at most");
  assert.deepEqual(queue.request({ ticker: "B", cik: "20", requester: "user:7" }), { status: "queued", started: true }, "someone else still gets in");
  await settle();
  g.gates.get("0000000001")({ roster: [] });
  await settle();
  assert.equal(g.started[1].cik, "0000000020", "and goes before the flood's backlog");
  queue.request({ ticker: "C", cik: "21", requester: "user:7" });
  g.gates.get("0000000020")({ roster: [] });
  await settle();
  g.gates.get("0000000002")({ roster: [] });
  await settle();
  assert.deepEqual(g.started.map(s => s.cik.replace(/^0+/, "")), ["1", "20", "2", "21"], "turns alternate between requesters");
  assert.equal(queue.peek("3"), "queued");
  assert.equal(queue.peek("21"), "running");
  assert.equal(queue.peek("99"), null);
  // The warm-up has its own cap and is never "busy" for a member.
  const warm = createPhotoQueue({ concurrency: 1, execute: g.execute, maxWarm: 1 });
  warm.request({ ticker: "W", cik: "30", priority: "warm" });
  warm.request({ ticker: "W", cik: "31", priority: "warm" });
  assert.equal(warm.request({ ticker: "W", cik: "32", priority: "warm" }).status, "skipped");
});

test("photo jobs: the company report someone has open starts at once, in a slot only it may use", async () => {
  const g = gated();
  const queue = createPhotoQueue({ concurrency: 2, execute: g.execute });
  for (const cik of ["1", "2", "3"]) queue.request({ ticker: "D" + cik, cik, requester: "user:1" });
  assert.deepEqual(queue.request({ ticker: "P", cik: "4", priority: "page", requester: "user:2" }), { status: "running", started: true }, "behind a dashboard's batch, it still starts");
  assert.deepEqual(queue.request({ ticker: "Q", cik: "5", priority: "page", requester: "user:3" }), { status: "queued", started: true }, "one reserved slot");
  queue.request({ ticker: "U", cik: "6", requester: "user:4" });
  // Opening the report of a company whose batch job is waiting raises it to a page job.
  assert.deepEqual(queue.request({ ticker: "D3", cik: "3", priority: "page", requester: "user:5" }), { status: "queued", started: false });
  await settle();
  assert.deepEqual(g.started.map(s => s.cik.replace(/^0+/, "")), ["1", "2", "4"]);
  g.gates.get("0000000001")({ roster: [] });
  await settle();
  g.gates.get("0000000002")({ roster: [] });
  await settle();
  assert.deepEqual(g.started.map(s => [s.cik.replace(/^0+/, ""), s.priority]), [["1", "user"], ["2", "user"], ["4", "page"], ["5", "page"], ["3", "page"]], "page jobs before the batch's");
  assert.deepEqual(queue.stats(), { running: 3, queued: 1, warmQueued: 0 });
  g.gates.get("0000000004")({ roster: [] });
  await settle();
  assert.deepEqual(queue.stats(), { running: 2, queued: 1, warmQueued: 0 }, "a batch job never takes the reserved slot...");
  g.gates.get("0000000005")({ roster: [] });
  await settle();
  assert.equal(g.started.at(-1).cik, "0000000006", "...and runs as soon as fewer than two jobs run");
});

test("photo jobs: extras merge into a waiting job, ride a quiet re-run after a running one, and re-runs are limited", async () => {
  const g = gated();
  let t = 0;
  const queue = createPhotoQueue({ concurrency: 1, execute: g.execute, now: () => t, settleMs: 0 });
  const cook = { cik: "1214156", name: "COOK TIMOTHY D" }, adams = { cik: "222", name: "ADAMS KATHERINE L" };
  queue.request({ ticker: "X", cik: "9" });
  queue.request({ ticker: "AAPL", cik: "320193", extra: [cook] });
  queue.request({ ticker: "AAPL", cik: "320193", extra: [adams, { cik: "5", name: "SILVER LAKE PARTNERS LP" }] });
  await settle();
  g.gates.get("0000000009")({ roster: [] });
  await settle();
  assert.deepEqual(g.started[1].extras, ["cik:1214156", "cik:222"], "merged into the waiting job; entities never ride");
  // Asked for while the job runs: picked up by a quiet re-run unless the finished roster has them.
  assert.equal(queue.request({ ticker: "AAPL", cik: "320193", extra: [{ cik: "777", name: "NEW PERSON A" }, cook] }).status, "running");
  g.gates.get("0000320193")({ roster: ["cik:1214156", "cik:222"] });
  await settle();
  assert.deepEqual(g.started[2], { cik: "0000320193", priority: "user", extras: ["cik:777"], rerun: true });
  g.gates.get("0000320193")({ roster: ["cik:1214156", "cik:222", "cik:777"] });
  await settle();
  // A re-run for the same person within 6 hours is refused; after that it may run again.
  assert.equal(queue.request({ ticker: "AAPL", cik: "320193", extra: [{ cik: "777", name: "NEW PERSON A" }], rerun: true }).status, "throttled");
  t += 6 * 3600 * 1000;
  assert.deepEqual(queue.request({ ticker: "AAPL", cik: "320193", extra: [{ cik: "777", name: "NEW PERSON A" }], rerun: true }), { status: "running", started: true });
  assert.equal(queue.request({ ticker: "Z", cik: "8", create: false }).status, "none", "join-only requests start nothing");
});

test("roster: the SEC's filers, then verified extras (newest first, capped); funds are listed as entities", () => {
  const insiders = [{ name: "COOK TIMOTHY D", cik: "0001214156" }, { name: "BERKSHIRE HATHAWAY INC", cik: "0001067983" }, { name: "COOK TIMOTHY D", cik: "0001214156" }, { name: "SMITH JANE", cik: null }];
  const merged = mergeRoster(insiders, [{ cik: "9", name: "OLDER EXTRA" }], [{ cik: "8", name: "NEWER EXTRA" }, { cik: "1214156", name: "COOK TIMOTHY D" }]);
  assert.deepEqual(merged.roster, ["cik:1214156", "name:SMITH JANE", "cik:8", "cik:9"]);
  assert.deepEqual(merged.entities, ["cik:1067983"]);
  assert.deepEqual(merged.extras, [{ cik: "8", name: "NEWER EXTRA" }, { cik: "1214156", name: "COOK TIMOTHY D" }, { cik: "9", name: "OLDER EXTRA" }]);
  const lots = Array.from({ length: 50 }, (_, i) => ({ cik: String(i + 1), name: "PERSON NUMBER " + i }));
  assert.equal(mergeRoster([], [], lots).extras.length, 40);
  assert.deepEqual(cleanExtras([{ cik: "0", name: "ZERO" }, { cik: "12", name: "X" }, { cik: "abc", name: "NAME HERE" }, { cik: "13", name: "ACME CAPITAL LLC" }]), []);
});

test("warm-up: recent filings become low-priority batches within the endpoint's limits", async () => {
  assert.match(RECENT_SQL, /retrieved_at>=now\(\)-make_interval/);
  const grouped = groupRecent([{ ticker: "AAPL", owner_cik: "0001214156" }, { ticker: "aapl", owner_cik: "1214156" }, { ticker: "BRK.B", owner_cik: null }, { ticker: null, owner_cik: "1" }]);
  assert.deepEqual(grouped, [{ ticker: "AAPL", owners: ["1214156"] }, { ticker: "BRK-B", owners: [] }]);
  const batches = [];
  const deps = { mediaBatch: async (query, d, options) => { batches.push({ query, options }); return { pending: { logos: query.tickers, photos: [] } }; } };
  const entries = Array.from({ length: 70 }, (_, i) => ({ ticker: "T" + i, owners: i < 30 ? ["1" + i, "2" + i, "3" + i, "4" + i] : [] }));
  const summary = await warmMedia(entries, deps);
  assert.deepEqual(batches.map(b => [b.query.tickers.length, b.query.people.length]), [[25, 100], [45, 20]]);
  assert.ok(batches.every(b => b.options.priority === "warm"));
  assert.deepEqual(summary, { tickers: 70, people: 120, batches: 2, pendingLogos: 70, pendingPhotos: 0 });
  // Through the real batch: pending work starts at warm priority.
  const w = world();
  await warmMedia(["F"], w.deps);
  assert.equal(w.deps.state.running.size, 1);
});

/* ---------------- the routes: allowances, takedowns, the company report ---------------- */

const route = async (path, { ip = "10.0.0.1", headers = {}, ...options } = {}) => {
  const res = { status: 0, headers: {}, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b ?? ""; } };
  try {
    await handleCompanyRoute({ method: "GET", headers, socket: { remoteAddress: ip } }, res, new URL(path, "http://x"), options);
    const text = Buffer.isBuffer(res.body) ? null : String(res.body);
    return { status: res.status, headers: res.headers, body: text && /^[{[]/.test(text) ? JSON.parse(text) : res.body };
  } catch (e) { return { status: e.status, error: e.message }; }
};

test("GET /v1/media: each requester may start a bounded amount of new work per 10 minutes; joining work is free", async () => {
  assert.deepEqual({ ...START_ALLOWANCE }, { logos: 60, photos: 10, pages: 20 });
  const big = {};
  for (let i = 0; i < 100; i++) big[i] = { cik_str: 7000000 + i, ticker: "U" + String(i).padStart(2, "0"), title: "Unit " + i };
  const people = Array.from({ length: 24 }, (_, i) => ({ owner_cik: String(500 + i), ticker: "U" + String(i).padStart(2, "0"), owner_name: "PERSON NUMBER " + i }));
  const w = world({ owners: people, ticket: o => ({ status: o.create ? "queued" : "none", started: o.create }) });
  w.deps.tickerIndex = async () => big;
  const tickers = (from, n) => "tickers=" + Array.from({ length: n }, (_, i) => "U" + String(from + i).padStart(2, "0")).join(",");
  const pairs = (from, n) => "people=" + people.slice(from, from + n).map(p => p.owner_cik + ":" + p.ticker).join(",");
  const flood = { ip: "198.51.100.20", mediaDeps: w.deps };
  // Photos: 10 new company jobs in the window, then only joins.
  await route("/v1/media?" + pairs(0, 12), flood);
  assert.equal(w.calls.photos.filter(c => c.create).length, 10);
  await route("/v1/media?" + pairs(12, 6), flood);
  assert.equal(w.calls.photos.filter(c => c.create).length, 10, "the requester's photo allowance is used up");
  assert.ok(w.calls.photos.every(c => c.requester === "ip:198.51.100.20"), "jobs carry who asked, for the queue's turns");
  // Logos: 60 new resolutions in the window (18 issuers above, then 20 per request).
  for (const from of [18, 38, 58, 78]) await route("/v1/media?" + tickers(from, 20), flood);
  assert.equal(w.deps.state.running.size, 60, "the requester's logo allowance is used up");
  assert.deepEqual(w.deps.state.logos.stats(), { active: 4, queued: 56 });
  const after = await route("/v1/media?" + tickers(0, 20), flood);
  assert.equal(after.status, 200);
  assert.equal(after.body.pending.logos.length, 20, "already resolving: joined, not refused");
  assert.equal(w.deps.state.running.size, 60);
  // Someone else is not affected, and a member is counted as the member, whatever the address.
  await route("/v1/media?" + pairs(18, 2), { ip: "203.0.113.50", mediaDeps: w.deps });
  assert.equal(w.calls.photos.filter(c => c.create).length, 12);
  await route("/v1/media?" + pairs(20, 1), { ip: "198.51.100.20", requester: "user:42", mediaDeps: w.deps });
  assert.equal(w.calls.photos.at(-1).requester, "user:42");
  assert.equal(w.calls.photos.at(-1).create, true);
});

test("GET /v1/company/photos: runs as the page's job, within the requester's allowance, and a takedown removes the photo at once", async () => {
  await store.putRecord("person-photo-override", "1214156", { none: true }, 3600e3);
  const photo = (c, source = "company-site") => ({ src: webp(c), source, sourceUrl: "https://www.apple.com/leadership/", credit: "Company website (apple.com)" });
  const record = { cik: AAPL, ticker: "AAPL", complete: true, roster: ["cik:1214156", "cik:222"],
    photos: { "cik:1214156": photo("1"), "cik:222": photo("2") }, names: { "cik:1214156": "Tim Cook", "cik:222": "Kate Adams" },
    leaders: [{ key: "wd:Q1", name: "Tim Cook", insider: true, insiderKey: "cik:1214156", ...photo("1") }, { key: "wd:Q2", name: "Tim Cook", insider: true, ...photo("1") },
      { key: "wd:Q3", name: "Arthur Levinson", insider: false, ...photo("3", "wikimedia") }],
    coverage: { people: 2, withPhoto: 2 }, sources: {} };
  const seen = [];
  const photoDeps = { companyPhotos: async (ticker, options) => { seen.push([ticker, { ...options, usage: undefined }]); if (options.create) options.usage.photos++; return record; } };
  const r = await route("/v1/company/photos?ticker=AAPL", { ip: "192.0.2.77", photoDeps });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.photos), ["cik:222"], "the taken-down person's photo is gone, the others stay");
  assert.deepEqual(r.body.names, { "cik:222": "Kate Adams" });
  assert.deepEqual(r.body.leaders.map(l => l.src), [null, null, webp("3")], "also from the leadership list, by key or (older records) by name");
  assert.equal(r.body.coverage.withPhoto, 1);
  assert.equal(record.photos["cik:1214156"].src, webp("1"), "the stored record itself is not changed by a read");
  assert.deepEqual(seen[0], ["AAPL", { wait: 0, priority: "page", requester: "ip:192.0.2.77", create: true, usage: undefined }]);
  // 20 new report jobs per requester in the window; after that it only joins jobs that exist.
  for (let i = 0; i < 19; i++) await route("/v1/company/photos?ticker=AAPL", { ip: "192.0.2.77", photoDeps });
  await route("/v1/company/photos?ticker=AAPL", { ip: "192.0.2.77", photoDeps });
  assert.deepEqual(seen.map(([, o]) => o.create), [...Array(20).fill(true), false]);
  // Nothing to filter: the record passes through as it is.
  const plain = { photos: { "cik:9": photo("4") }, names: {} };
  assert.equal(await withoutTakedowns(plain, { lookup: async () => new Map() }), plain);
});

test("blockPersonPhoto: the takedown stops the image address and rewrites the finished company records", async () => {
  const saved = await store.putMedia({ bytes: Buffer.from("takedown test portrait"), type: "webp", width: 256, height: 256 });
  const other = await store.putMedia({ bytes: Buffer.from("someone else's portrait"), type: "webp", width: 256, height: 256 });
  await store.putRecord("person-photo", "555", { src: saved.url, source: "sec-proxy", credit: "SEC proxy statement" }, 3600e3);
  await store.putRecord("company-photos", "0000000777", { cik: "0000000777", complete: true, photos: { "cik:555": { src: saved.url }, "cik:6": { src: other.url } }, names: { "cik:555": "Pat Doe" }, leaders: [] }, 3600e3);
  assert.equal((await route(saved.url)).status, 200);
  assert.deepEqual(await blockPersonPhoto("0000000555", { reason: "the person asked" }), { cik: "555", images: 1, companies: 1 });
  assert.equal((await store.getRecord("person-photo-override", "555")).none, true);
  const rewritten = await store.getRecord("company-photos", "0000000777");
  assert.deepEqual(Object.keys(rewritten.photos), ["cik:6"]);
  assert.deepEqual(rewritten.names, {});
  assert.equal((await route(saved.url, { ip: "10.9.9.9" })).status, 404, "the image is no longer served");
  assert.equal((await route(saved.url, { ip: "10.9.9.9", headers: { "if-none-match": '"' + saved.sha + '"' } })).status, 404, "not even to a cache that asks to revalidate");
  assert.equal(await store.hasMedia(saved.sha), false);
  assert.equal((await route(other.url)).status, 200, "nobody else is touched");
  // The batch answers null for them from now on.
  const w = world({ records: { "person-photo:555": { src: saved.url, source: "sec-proxy" }, "person-photo-override:555": { none: true } }, stored: [] });
  assert.equal((await mediaBatch(q("people=555:AAPL"), w.deps)).photos["555"], null, "and a taken-down photo is never looked for again as 'lost'");
  assert.equal(w.calls.photos.length, 0);
  await assert.rejects(blockPersonPhoto("abc"), /CIK/);
});
