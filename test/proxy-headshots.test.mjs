import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  tokenize, decodeEntities, fold, buildPeople, findNames, altName, personLikeLine, pairPortraits,
  selectFiles, checkImage, checkPortrait, latestProxy, latestProxyFromAtom, proxyHeadshots
} from "../src/proxy-headshots.mjs";

/* A continuous-tone test picture (smooth gradients plus noise, like a photo) and a flat icon. */
async function photo(w = 160, h = 160, seed = 1) {
  const px = Buffer.alloc(w * h * 3);
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, n = rnd() * 60;
    px[i] = Math.min(255, (x * 255) / w * .7 + n); px[i + 1] = Math.min(255, (y * 255) / h * .7 + n); px[i + 2] = Math.min(255, ((x + y) * 128) / (w + h) + n + seed * 7);
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
async function icon(w = 160, h = 160) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/><circle cx="${w / 2}" cy="${h / 2}" r="${w / 3}" fill="none" stroke="#123" stroke-width="12"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

test("HTML becomes ordered text and image tokens with rendered sizes", () => {
  const toks = tokenize(`<div>Board&nbsp;of Directors</div><p><img src="a_g1.jpg" alt="Graphic" style="height:72pt;width:60pt"/></p><td>Art&#160;Levinson&rsquo;s</td><img src='b.gif' height="50" width="40"><script>var x="<img src=c.jpg>"</script>`);
  const imgs = toks.filter(t => t.t === "img");
  assert.equal(imgs.length, 2);
  assert.deepEqual([imgs[0].src, imgs[0].alt, imgs[0].h, imgs[0].w], ["a_g1.jpg", "Graphic", 96, 80]);
  assert.deepEqual([imgs[1].src, imgs[1].h, imgs[1].w], ["b.gif", 50, 40]);
  assert.match(toks.filter(t => t.t === "text").map(t => t.s).join(""), /Art Levinson’s/);
  assert.equal(decodeEntities("&amp;&#x2019;&eacute;&bogus;"), "&’é&bogus;");
  assert.equal(fold("Ana BOTÍN, Hund-Mejean O’Brien"), "ana botin, hundmejean obrien");
});

test("known names are found with nicknames, accents and middle initials, never on a conflict", () => {
  const people = buildPeople([
    { name: "LEVINSON ARTHUR D", cik: "1" }, { name: "BOTIN ANA", cik: "2" }, { name: "HUND-MEJEAN MARIE", cik: "3" },
    { name: "RUSSELL DAVID ERIC", cik: "4" }, { name: "ACME CAPITAL PARTNERS LLC", cik: "5" }
  ]);
  assert.equal(people.length, 4, "entities are not people");
  const hits = findNames("Art Levinson\nChair | Ana Botín, Age 65 | Marie Hund-Mejean | David O. Russell", people);
  assert.deepEqual(hits.map(h => h.caption), ["art levinson", "ana botin", "marie hundmejean"]);
  assert.equal(findNames("Mr. Levinson has served", people).length, 0, "a surname alone is not a name");
  assert.equal(findNames("Arthur\nLevinson", people).length, 0, "given name must be on the same line");
});

test("alt text and file names: full names, photo keywords, longest surname, ambiguity", () => {
  const people = buildPeople([{ name: "SULLIVAN ANDREW F", cik: "1" }, { name: "BURKE STEPHEN B", cik: "2" }, { name: "NOVAK JAN", cik: "3" }, { name: "NOVAKOVIC PHEBE", cik: "4" }]);
  assert.equal(altName("ph_andrewfsullivan-bw.jpg", "x.jpg", people).person.personName, "SULLIVAN ANDREW F");
  const burke = altName("05 JP Morgan_photo_director nominee_Burke.jpg", "jpm_g10.jpg", people);
  assert.equal(burke.person.personName, "BURKE STEPHEN B");
  assert.equal(burke.full, false);
  assert.equal(altName("Phebe-Novakovic.jpg", "", people).person.personName, "NOVAKOVIC PHEBE");
  assert.equal(altName("Graphic", "ko_a045.jpg", people), null);
  assert.equal(altName("photo_Sullivan_and_Burke.jpg", "", people), null, "two people in one alt");
  assert.equal(altName("Sullivan-Stephen.jpg", "", people), null, "given name of someone else");
});

test("person-like captions are recognised; headings are not", () => {
  assert.equal(personLikeLine("\n Mary T. Barra, Age 64\nChair"), true);
  assert.equal(personLikeLine("Board Committees"), false);
  assert.equal(personLikeLine("2026 Proxy Statement"), false);
});

const files = names => new Set(names.map(n => n.toLowerCase()));
const img = (src, h = 120, w = 120, alt = "") => `<img src="${src}" alt="${alt}" style="height:${h}px;width:${w}px">`;

test("pairing rules: run order, name after, alt, icons and ambiguous father/son", () => {
  const people = buildPeople([
    { name: "COOK TIMOTHY D", cik: "1" }, { name: "JUNG ANDREA", cik: "2" }, { name: "SUGAR RONALD D", cik: "3" },
    { name: "Allen Herbert A III", cik: "4" }, { name: "ALLEN HERBERT A", cik: "5" }
  ]);
  const html = `<p>Nominees</p><div>${img("p1.jpg")}${img("p2.jpg")}${img("p3.jpg")}</div><p>Tim Cook</p><p>Andrea Jung</p><p>Ron Sugar</p>
    <p>Other text</p><div>${img("check.gif", 14, 14)}</div><p>Tim Cook</p>
    <div>${img("p4.jpg")}</div><p>Herb Allen</p><p>long bio text</p>`;
  const { placements } = pairPortraits(tokenize(html), people, files(["p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg", "check.gif"]));
  const got = Object.fromEntries(placements.map(p => [p.file, p.personId == null ? null : people[p.personId].personName + "/" + p.rule]));
  assert.deepEqual(got, { "p1.jpg": "COOK TIMOTHY D/run", "p2.jpg": "JUNG ANDREA/run", "p3.jpg": "SUGAR RONALD D/run", "p4.jpg": null });
});

test("a run with fewer names than photos pairs nothing", () => {
  const people = buildPeople([{ name: "COOK TIMOTHY D", cik: "1" }, { name: "JUNG ANDREA", cik: "2" }]);
  const html = `<div>${img("p1.jpg")}${img("p2.jpg")}${img("p3.jpg")}</div><p>Tim Cook</p><p>Wanda Austin</p><p>Andrea Jung</p>`;
  const { placements } = pairPortraits(tokenize(html), people, files(["p1.jpg", "p2.jpg", "p3.jpg"]));
  assert.ok(placements.every(p => p.personId == null));
});

test("name-before needs a name-before layout and no other caption after the image", () => {
  const people = buildPeople([{ name: "MINICUCCI BENITO", cik: "1" }, { name: "TILDEN BRADLEY D", cik: "2" }, { name: "SMITH JANE", cik: "3" }]);
  const filler = "x".repeat(300);
  const layout = `<h3>Ben Minicucci</h3><div>${img("a.jpg")}</div><p>${filler}</p><h3>Bradley D. Tilden</h3><div>${img("b.jpg")}</div><p>${filler}</p>`;
  let r = pairPortraits(tokenize(layout), people, files(["a.jpg", "b.jpg"]));
  assert.deepEqual(r.placements.map(p => [p.file, p.personId, p.rule, p.confidence]), [["a.jpg", 0, "before", "medium"], ["b.jpg", 1, "before", "medium"]]);
  // Only one image laid out that way: not enough evidence for the risky rule.
  r = pairPortraits(tokenize(`<h3>Jane Smith</h3><div>${img("c.jpg")}</div><p>${filler}</p>`), people, files(["c.jpg"]));
  assert.equal(r.placements[0].personId, null);
  // A different person's caption right after the image wins over the name before it.
  r = pairPortraits(tokenize(layout + `<h3>Jane Smith</h3><div>${img("d.jpg")}</div><p>Robert Unknown</p><p>${filler}</p>`), people, files(["a.jpg", "b.jpg", "d.jpg"]));
  assert.equal(r.placements.find(p => p.file === "d.jpg").personId, null);
});

test("a file used for several people keeps only a majority owner", () => {
  const byPerson = selectFiles([
    { file: "icon.gif", personId: 1, rule: "after" }, { file: "icon.gif", personId: 2, rule: "after" },
    { file: "a.jpg", personId: 1, rule: "run" }, { file: "a2.jpg", personId: 1, rule: "alt" },
    { file: "b.jpg", personId: 2, rule: "after" }, { file: "b.jpg", personId: 2, rule: "after" }, { file: "b.jpg", personId: 3, rule: "after" }
  ], new Map([["a.jpg", 9000], ["a2.jpg", 100]]));
  assert.deepEqual(byPerson.get(1).map(c => c.file), ["a2.jpg", "a.jpg"], "alt beats run at equal votes");
  assert.deepEqual(byPerson.get(2).map(c => c.file), ["b.jpg"]);
  assert.equal(byPerson.get(3), undefined);
});

test("downloaded files must look like a portrait", async () => {
  assert.equal((await checkPortrait(await photo())).ok, true);
  const flat = await checkPortrait(await icon());
  assert.equal(flat.ok, false);
  assert.match(flat.reason, /flat/);
  assert.equal(checkImage(await photo(40, 40)).reason, "small");
  assert.equal(checkImage(await photo(300, 120)).reason, "aspect");
  assert.equal(checkImage(Buffer.from("<html></html>")).reason, "type");
});

test("newest DEF 14A is used; older than 15 months is skipped", () => {
  const subs = { filings: { recent: { form: ["4", "DEF 14A", "DEFA14A", "DEF 14A"], accessionNumber: ["a", "0000000001-26-000001", "c", "0000000001-25-000001"], filingDate: ["2026-05-01", "2026-04-01", "2026-04-02", "2025-04-01"], primaryDocument: ["x", "p.htm", "y", "q.htm"] } } };
  const now = Date.parse("2026-10-14");
  assert.deepEqual(latestProxy(subs, now), { accession: "0000000001-26-000001", filedAt: "2026-04-01", primaryDocument: "p.htm", stale: false });
  assert.equal(latestProxy(subs, Date.parse("2027-09-01")).stale, true);
  assert.equal(latestProxy({ filings: { recent: { form: ["10-K"], accessionNumber: ["z"], filingDate: ["2026-01-01"] } } }), null);
});

test("proxyHeadshots end to end with injected SEC fetchers, cache and extra people", async () => {
  const acc = "0000123456-26-000077", base = "https://www.sec.gov/Archives/edgar/data/123456/000012345626000077/";
  const images = { "g1.jpg": await photo(160, 160, 1), "g2.jpg": await photo(150, 160, 2), "g3.jpg": await icon(), "g4.jpg": await photo(160, 150, 3) };
  const html = `<html><body><p>Our directors</p>
    <div>${img("g1.jpg")}${img("g2.jpg")}</div><p>Tim Cook</p><p>Chief Executive Officer</p><p>Andrea Jung</p>
    <p>${"bio ".repeat(80)}</p><div>${img("g3.jpg")}</div><p>Ronald D. Sugar</p>
    <p>${"bio ".repeat(80)}</p><div>${img("g4.jpg", 120, 120, "Photo of Satya Nadella")}</div><p>Chairman</p></body></html>`;
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push(url);
    if (url.startsWith("https://data.sec.gov/submissions/")) return { filings: { recent: { form: ["DEF 14A"], accessionNumber: [acc], filingDate: ["2026-03-01"], primaryDocument: ["proxy.htm"] } } };
    if (url === base + "index.json") return { directory: { item: [{ name: "proxy.htm", size: "9000" }, ...Object.keys(images).map(n => ({ name: n, size: String(images[n].length) }))] } };
    throw new Error("unexpected " + url);
  };
  const downloads = [];
  const fetchBytes = async url => {
    if (url === base + "proxy.htm") { calls.push(url); return Buffer.from(html, "utf8"); }
    downloads.push(url); const b = images[url.slice(base.length)]; if (!b) throw new Error("404"); return b;
  };
  const input = { cik: "0000123456", insiders: [{ name: "COOK TIMOTHY D", cik: "0000000011", role: "CEO" }, { name: "JUNG ANDREA", cik: "0000000012" }, { name: "SUGAR RONALD D", cik: "0000000013" }], extraPeople: [{ name: "Satya Nadella", key: "wd:Q123" }, { name: "Timothy D. Cook", key: "wd:Q265852" }] };
  const now = Date.parse("2026-10-14");
  const res = await proxyHeadshots(input, { fetcher, fetchBytes, now });
  assert.equal(res.status, "ok");
  assert.equal(res.accession, acc);
  assert.equal(res.documentUrl, base + "proxy.htm");
  const by = Object.fromEntries(res.matches.map(m => [m.key, m]));
  assert.deepEqual(Object.keys(by).sort(), ["cik:11", "cik:12", "wd:Q123", "wd:Q265852"]);
  assert.equal(by["cik:11"].imageUrl, base + "g1.jpg");
  assert.equal(by["cik:11"].ownerCik, "0000000011");
  assert.equal(by["wd:Q265852"].imageUrl, base + "g1.jpg", "an extra name that is an insider shares the insider's match");
  assert.equal(by["cik:12"].imageUrl, base + "g2.jpg");
  assert.equal(by["wd:Q123"].ownerCik, null);
  assert.equal(by["wd:Q123"].rule, "alt");
  assert.equal(by["cik:11"].rule, "run");
  assert.ok(Buffer.isBuffer(by["cik:11"].bytes) && by["cik:11"].type === "jpeg" && by["cik:11"].width === 160);
  assert.match(by["cik:11"].photoUrl, /^\/v1\/media\/[a-f0-9]{64}\.webp$/);
  assert.ok(!res.matches.some(m => m.personName === "SUGAR RONALD D"), "the icon fails the portrait check");
  assert.ok(!downloads.some(u => u.endsWith("index.json")) && downloads.every(u => /g[1-4]\.jpg$/.test(u)));

  // Second call: served from the per-accession record without touching SEC again.
  const before = calls.length, dl = downloads.length;
  const again = await proxyHeadshots(input, { fetcher, fetchBytes, now });
  assert.equal(again.matches.length, res.matches.length);
  assert.equal(calls.length, before + 1, "only the submissions lookup");
  assert.equal(downloads.length, dl);
  assert.ok(Buffer.isBuffer(again.matches[0].bytes));

  // A person never seen before reruns pairing, reusing downloaded files.
  const more = await proxyHeadshots({ ...input, insiders: [...input.insiders, { name: "AUSTIN WANDA M", cik: "14" }] }, { fetcher, fetchBytes, now });
  assert.equal(more.matches.length, res.matches.length);
  assert.equal(downloads.length, dl, "validated files are not downloaded again");
});

const EMPTY_FEED = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>';
const feed = (acc, date) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>DEF 14A  - Other definitive proxy statements</title>
  <link href="https://www.sec.gov/Archives/edgar/data/19617/${acc.replace(/-/g, "")}/${acc}-index.htm" rel="alternate" type="text/html"/><updated>${date}T06:17:40-04:00</updated></entry>
  <entry><title>DEFA14A  - Additional definitive proxy soliciting materials</title><link href="https://www.sec.gov/Archives/edgar/data/19617/000001961726000099/0000019617-26-000099-index.htm"/><updated>2026-05-01T06:00:00-04:00</updated></entry></feed>`;

test("proxyHeadshots reports no-proxy, stale proxies and errors without throwing", async () => {
  const subsOr = subs => async url => url.includes("browse-edgar") ? EMPTY_FEED : subs;
  const none = await proxyHeadshots({ cik: "1", insiders: [] }, { fetcher: subsOr({ filings: { recent: { form: ["10-K"], accessionNumber: ["x"], filingDate: ["2026-01-01"] } } }) });
  assert.equal(none.status, "no-proxy");
  const old = await proxyHeadshots({ cik: "1", insiders: [] }, { fetcher: subsOr({ filings: { recent: { form: ["DEF 14A"], accessionNumber: ["0000000001-24-000001"], filingDate: ["2024-04-01"], primaryDocument: ["p.htm"] } } }), now: Date.parse("2026-10-14") });
  assert.equal(old.status, "no-proxy");
  assert.match(old.reason, /15 months/);
  const err = await proxyHeadshots({ cik: "1", insiders: [] }, { fetcher: async () => { throw new Error("SEC responded 503"); } });
  assert.equal(err.status, "error");
  assert.equal((await proxyHeadshots({ cik: "abc" })).status, "error");
});

test("when the submissions file cannot be read, the EDGAR browse feed finds the proxy", async () => {
  const p = latestProxyFromAtom(feed("0000019617-26-000096", "2026-04-06"), Date.parse("2026-10-14"));
  assert.deepEqual(p, { accession: "0000019617-26-000096", filedAt: "2026-04-06", primaryDocument: "", stale: false });
  assert.equal(latestProxyFromAtom(EMPTY_FEED), null);
  const seen = [];
  const fetcher = async url => {
    seen.push(url);
    if (url.includes("data.sec.gov")) throw new Error("SEC response too large");
    if (url.includes("browse-edgar")) return feed("0000019617-26-000096", "2026-04-06");
    if (url.endsWith("index.json")) return { directory: { item: [{ name: "0000019617-26-000096-index.htm", size: "99999999" }, { name: "jpm-20260402.htm", size: "500" }, { name: "ex99.htm", size: "900" }] } };
    throw new Error("unexpected " + url);
  };
  const fetchBytes = async url => { seen.push(url); return Buffer.from("<p>No pictures here</p>"); };
  const res = await proxyHeadshots({ cik: "19617", insiders: [{ name: "DIMON JAMES", cik: "1" }] }, { fetcher, fetchBytes, now: Date.parse("2026-10-14"), useCache: false });
  assert.equal(res.status, "none");
  assert.equal(res.accession, "0000019617-26-000096");
  assert.ok(seen.includes("https://www.sec.gov/Archives/edgar/data/19617/000001961726000096/index.json"));
});

test("director profile layout: name and role words, then the portrait, then the age line", () => {
  const html = `<p>Letter from our chair</p><img src="x1.jpg" height="80" width="80"><p>Blake D. Moret, Chairman</p>
    <p>BOARD OF DIRECTORS</p><p>Alice L. Jolla INDEPENDENT</p><img src="x31.jpg" height="85" width="70"><p>Age 60 Director since 2023 COMMITTEES: Audit</p>
    <p>Pat Unknown INDEPENDENT</p><img src="x32.jpg" height="85" width="70"><p>Age 55 Director since 2021</p>
    <p>Alice L. Jolla served at Microsoft.</p><img src="x40.jpg" height="85" width="70"><p>Our compensation philosophy</p>`;
  const people = buildPeople([{ name: "Jolla Alice L.", cik: "1" }, { name: "Moret Blake D.", cik: "2" }]);
  const files = new Set(["x1.jpg", "x31.jpg", "x32.jpg", "x40.jpg"]);
  const { placements } = pairPortraits(tokenize(html), people, files);
  const by = Object.fromEntries(placements.map(p => [p.file, p]));
  assert.equal(by["x31.jpg"].rule, "before-profile");
  assert.equal(people[by["x31.jpg"].personId].personName, "Jolla Alice L.");
  assert.equal(by["x32.jpg"].personId, null, "an unknown director's profile is not paired with a known name");
  assert.notEqual(by["x40.jpg"].rule, "before-profile", "a name in running text is not a profile caption");
});
