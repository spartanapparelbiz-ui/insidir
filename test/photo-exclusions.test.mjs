import test from "node:test";
import assert from "node:assert/strict";
import { excludedPhoto, illustratedProxy, ILLUSTRATED_PROXIES } from "../src/photo-exclusions.mjs";
import { withoutTakedowns } from "../src/people-photos.mjs";
import { proxyHeadshots } from "../src/proxy-headshots.mjs";

/* Reddit's 2026 proxy prints illustrated avatars of its directors; one ("SarahFarrell.gif") passed every
 * automated portrait check and was shown as Sarah E. Farrell's headshot. Audited sources like it are never
 * used, and photos stored from them before the audit stop being served. */
const REDDIT_PROXY = "https://www.sec.gov/Archives/edgar/data/1713445/000171344526000060/rddt-20260423.htm";
const cartoon = { src: "/v1/media/" + "7c".repeat(32) + ".webp", source: "sec-proxy", sourceUrl: REDDIT_PROXY, personName: "FARRELL SARAH E", caption: "SarahFarrell.gif" };

test("photos from an audited illustrated proxy are recognised; everything else is untouched", () => {
  assert.ok(illustratedProxy("0001713445") && illustratedProxy("1713445"));
  assert.match(excludedPhoto(cartoon), /illustrated avatars/);
  assert.equal(excludedPhoto({ ...cartoon, sourceUrl: "https://www.sec.gov/Archives/edgar/data/723125/000072312526000012/mu-def14a.htm" }), null, "another company's proxy");
  assert.equal(excludedPhoto({ ...cartoon, source: "company-site", sourceUrl: "https://www.redditinc.com/leadership" }), null, "the company's own site is not a proxy");
  assert.equal(excludedPhoto({ ...cartoon, sourceUrl: "https://evil.example/Archives/edgar/data/1713445/x.htm" }), null, "only sec.gov documents name an issuer");
  assert.equal(excludedPhoto(null), null);
  for (const [cik, reason] of Object.entries(ILLUSTRATED_PROXIES)) { assert.match(cik, /^[1-9]\d{0,9}$/); assert.ok(reason.length > 20); }
});

test("a stored company record stops serving the illustrated portrait, its caption name and its coverage count", async () => {
  const state = {
    cik: "0001713445", complete: true,
    photos: { "cik:1808740": cartoon, "cik:1827011": { src: "/v1/media/" + "ab".repeat(32) + ".jpeg", source: "wikimedia", sourceUrl: "https://commons.wikimedia.org/wiki/File:Steve_Huffman.jpg" } },
    names: { "cik:1808740": "Sarah E Farrell", "cik:1827011": "Steve Huffman" },
    leaders: [{ name: "Sarah Farrell", insiderKey: "cik:1808740", ...cartoon }],
    coverage: { people: 2, withPhoto: 2 }
  };
  const out = await withoutTakedowns(state, { lookup: async () => new Map() });
  assert.deepEqual(Object.keys(out.photos), ["cik:1827011"]);
  assert.equal(out.names["cik:1808740"], undefined);
  assert.equal(out.leaders[0].src, null);
  assert.equal(out.coverage.withPhoto, 1);
  assert.equal(state.photos["cik:1808740"], cartoon, "the stored record itself is not mutated");
});

test("the proxy reader never opens an illustrated proxy", async () => {
  const fetched = [];
  const submissions = { filings: { recent: { form: ["DEF 14A"], filingDate: ["2026-04-23"], accessionNumber: ["0001713445-26-000060"], primaryDocument: ["rddt-20260423.htm"] } } };
  const r = await proxyHeadshots({ cik: "1713445", insiders: [{ ownerCik: "1808740", ownerName: "FARRELL SARAH E" }], submissions },
    { fetcher: async url => { fetched.push(url); throw new Error("must not fetch"); }, fetchBytes: async () => { throw new Error("must not fetch"); }, now: Date.parse("2026-10-18T00:00:00Z"), useCache: false });
  assert.equal(r.status, "none");
  assert.match(r.reason, /illustrated/);
  assert.deepEqual(r.matches, []);
  assert.deepEqual(fetched, []);
});

test("GIF proxy originals can be stored: the media table accepts every format media.mjs sends", async () => {
  const { readFile } = await import("node:fs/promises");
  const { MIME } = await import("../src/media.mjs");
  const sql = await readFile(new URL("../sql/012_entity_media_gif.sql", import.meta.url), "utf8");
  for (const mime of Object.values(MIME)) assert.ok(sql.includes("'" + mime + "'"), mime);
  assert.match(await readFile(new URL("../src/db.mjs", import.meta.url), "utf8"), /012_entity_media_gif\.sql/, "migrate() runs it");
});
