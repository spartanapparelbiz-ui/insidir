import test from "node:test";
import assert from "node:assert/strict";
import { cleanName, nameLike, matchesPerson, roleCorroborated, extractCards, cssBackgrounds, matchCards, leadershipPhotos, checkImage } from "../src/leader-pages.mjs";
import { parseHtml } from "../src/public-fetch.mjs";

function png(width, height, seed = 0) {
  const b = Buffer.alloc(48);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b.writeUInt32BE(seed, 40);
  return b;
}
function memoryStore() {
  const m = new Map();
  return { m, getRecord: async (k, key) => m.get(k + ":" + key) ?? null, putRecord: async (k, key, v) => { m.set(k + ":" + key, v); } };
}

test("names are cleaned and titles are not names", () => {
  assert.equal(cleanName("Headshot of Tony Rodriquez"), "Tony Rodriquez");
  assert.equal(cleanName("Jay Short, Ph.D."), "Jay Short");
  assert.equal(cleanName("Eric Sievers, M.D. | Chief Medical Officer"), "Eric Sievers");
  assert.equal(cleanName("Dr. Lisa Su"), "Lisa Su");
  assert.equal(nameLike("Jen-Hsun “Jensen” Huang"), "Jen-Hsun “Jensen” Huang");
  assert.equal(nameLike("Ana de la Cruz"), "Ana de la Cruz");
  assert.equal(nameLike("W. Patrick Mattson"), "W. Patrick Mattson");
  assert.equal(nameLike("Chief Executive Officer"), null);
  assert.equal(nameLike("Board of Directors"), null);
  assert.equal(nameLike("Read More"), null);
  assert.equal(nameLike("Jensen founded NVIDIA in 1993 and has served since"), null);
});

test("person matching: nicknames, quoted names, leading initials, conflicts", () => {
  assert.equal(matchesPerson("HUANG JEN HSUN", "Jen-Hsun “Jensen” Huang"), true);
  assert.equal(matchesPerson("HUANG JEN HSUN", "Jensen Huang"), true);
  assert.equal(matchesPerson("Mattson W Patrick", "W. Patrick Mattson"), true);
  assert.equal(matchesPerson("Rodriquez Antonio", "Tony Rodriquez"), true);
  assert.equal(matchesPerson("RUSSELL DAVID ERIC", "David O. Russell"), false, "middle initials conflict");
  assert.equal(matchesPerson("Lam Yat Tung", "Job Lam"), false, "different given name needs the surname-only rule");
  assert.equal(matchesPerson("SMITH JOHN", "Jane Smith"), false);
});

test("SEC roles are corroborated by card titles", () => {
  assert.equal(roleCorroborated("Chief Operating Officer · Director", "COO and Founder | View bio"), true);
  assert.equal(roleCorroborated("Chief Technology Officer · Director", "CTO and Founder"), true);
  assert.equal(roleCorroborated("Director", "Member of the Board"), true);
  assert.equal(roleCorroborated("Director", "Managing Director, Sales"), false);
  assert.equal(roleCorroborated("Chief Financial Officer", "SVP, Marketing"), false);
  assert.equal(roleCorroborated("10% Owner", "Chief Executive Officer"), false);
  assert.equal(roleCorroborated("Officer", "Chief Executive Officer"), false, "a bare 'Officer' role says nothing");
});

const GRID = `<html><head><title>Leadership</title><style>
  .image-abc { background-image: url(/img/overview/Tim_Cook.jpg.large.jpg); width: 230px }
  @media (min-resolution: 1.5dppx) { .image-abc { background-image: url(/img/overview/Tim_Cook.jpg.large_2x.jpg); } }
</style></head><body>
<ul class="grid">
  <li><a href="/leadership/tim-cook/"><figure class="profile-image image-abc"><figcaption><h3>Tim Cook</h3><h4>Executive Chair</h4></figcaption></figure></a></li>
  <li><div class="card"><img data-src="/img/jane.jpg" src="data:image/gif;base64,R0lGOD" srcset="/img/jane-200.jpg 200w, /img/jane-800.jpg 800w" alt=""><h3>Jane Q. Doe, Ph.D.</h3><p>Chief Financial Officer</p></div></li>
  <li><div class="card"><img src="/img/job-lam.png"><h3>Job Lam</h3><p>COO and Founder</p></div></li>
  <li><div class="pair"><img src="/img/a.jpg"><img src="/img/b.jpg"><h3>Alex Pair</h3></div></li>
  <li><div class="card"><img src="/img/logo-partner.png"><h3>Logo Person</h3></div></li>
  <li><div class="card"><img src="/img/placeholder-person.jpg"><h3>No Photo</h3></div></li>
  <li><div class="card"><img src="/img/generic.jpg"><h3>Sam Ample</h3><p>Director</p></div></li>
  <li><div class="card"><img src="/img/generic.jpg"><h3>Pat Ample</h3><p>Director</p></div></li>
</ul>
<script type="application/ld+json">{"@type":"Person","name":"Rita Lee","jobTitle":"Director","image":"https://cdn.example.com/rita.jpg"}</script>
</body></html>`;

test("cards: CSS-class backgrounds, lazy img and largest srcset, JSON-LD; never across two images", () => {
  const css = cssBackgrounds(parseHtml(GRID), "https://www.example.com/leadership");
  assert.deepEqual(css.get("image-abc"), ["https://www.example.com/img/overview/Tim_Cook.jpg.large.jpg", "https://www.example.com/img/overview/Tim_Cook.jpg.large_2x.jpg"]);
  const cards = extractCards(GRID, "https://www.example.com/leadership");
  const by = n => cards.find(c => c.name === n);
  assert.ok(by("Tim Cook").images[0].endsWith("Tim_Cook.jpg.large.jpg"));
  assert.match(by("Tim Cook").title, /Executive Chair/);
  assert.equal(by("Jane Q. Doe").images[0], "https://www.example.com/img/jane-800.jpg");
  assert.ok(by("Jane Q. Doe").images.includes("https://www.example.com/img/jane.jpg"));
  assert.match(by("Jane Q. Doe").title, /Chief Financial Officer/);
  assert.equal(by("Alex Pair"), undefined, "a container with two images cannot name either");
  assert.equal(by("Logo Person"), undefined);
  assert.equal(by("No Photo"), undefined);
  assert.equal(by("Rita Lee").how, "jsonld");
});

test("matching: full names, unique-surname rule with corroborating title, placeholders and ambiguity", () => {
  const cards = extractCards(GRID, "https://www.example.com/leadership");
  const people = [
    { name: "COOK TIMOTHY D", cik: "1", role: "Director" },
    { name: "Doe Jane Q", cik: "2", role: "Chief Financial Officer" },
    { name: "Lam Yat Tung", cik: "3", role: "Chief Operating Officer · Director" },
    { name: "Ample Samuel", cik: "4", role: "Director" },
    { name: "Doe Jane R", cik: "5", role: "Director" },
    { name: "LEE RITA", cik: "6", role: "Director" }
  ];
  const m = Object.fromEntries(matchCards(people, cards).map(x => [x.person.name, x]));
  assert.equal(m["COOK TIMOTHY D"].rule, "full");
  assert.equal(m["Doe Jane Q"].cards[0].name, "Jane Q. Doe");
  assert.equal(m["Doe Jane R"], undefined, "middle initial R conflicts with Q");
  assert.equal(m["Lam Yat Tung"].rule, "surname-only");
  assert.equal(m["Lam Yat Tung"].confidence, "medium");
  assert.equal(m["Ample Samuel"], undefined, "one image shown for two names is a placeholder");
  assert.equal(m["LEE RITA"].cards[0].how, "jsonld");

  // Surname-only is refused when the title does not agree, when the surname repeats, or for another insider with that surname.
  assert.equal(matchCards([{ name: "Lam Yat Tung", role: "Chief Financial Officer" }], cards).length, 0);
  const twoLams = cards.concat([{ name: "Kim Lam", names: ["Kim Lam"], title: "COO", images: ["https://www.example.com/img/kim.jpg"], how: "card", pageUrl: "x" }]);
  assert.equal(matchCards([{ name: "Lam Yat Tung", role: "Chief Operating Officer" }], twoLams).length, 0);
  assert.equal(matchCards([{ name: "Lam Yat Tung", role: "Chief Operating Officer" }, { name: "Lam Peter", role: "Director" }], cards).length, 0);
  // A card that fits two insiders decides for neither.
  const twins = matchCards([{ name: "SMITH JOHN A", role: "Director" }, { name: "SMITH JOHN", role: "Director" }],
    [{ name: "John Smith", names: ["John Smith"], title: "Director", images: ["https://x/j.jpg"], how: "card", pageUrl: "x" }]);
  assert.equal(twins.length, 0);
  // Entities never get a person photo.
  assert.equal(matchCards([{ name: "Cook Capital Partners LLC", role: "10% Owner" }], cards).length, 0);
});

test("image check: raster portrait only, short side >= 120, aspect 0.6-1.7", async () => {
  const files = { "https://a/ok.png": { bytes: png(300, 400), type: "png" }, "https://a/small.png": { bytes: png(100, 100), type: "png" },
    "https://a/wide.png": { bytes: png(1200, 630), type: "png" }, "https://a/s.svg": { bytes: Buffer.from("<svg/>"), type: "svg" } };
  const fetchImage = async url => { if (!files[url]) throw new Error("404"); return { ...files[url], url }; };
  assert.equal((await checkImage("https://a/ok.png", "p", { fetchImage })).ok, true);
  assert.equal((await checkImage("https://a/small.png", "p", { fetchImage })).reason, "too small");
  assert.equal((await checkImage("https://a/wide.png", "p", { fetchImage })).reason, "aspect");
  assert.equal((await checkImage("https://a/s.svg", "p", { fetchImage })).reason, "not raster");
  assert.equal((await checkImage("https://a/missing.png", "p", { fetchImage: async () => { throw new Error("Image responded 404"); } })).ok, false);
});

test("leadershipPhotos: crawls home + linked leadership page, returns verified URLs, caches the working page", async () => {
  const home = `<html><title>Example Corp</title><body><nav><a href="/our-company/leadership-team">Leadership</a><a href="/careers">Careers</a></nav></body></html>`;
  const lead = `<html><body>
    <div class="person"><img src="/p/tim.jpg"><h3>Tim Cook</h3><p>Executive Chair</p></div>
    <div class="person"><img src="/p/jane.jpg"><h3>Jane Q. Doe</h3><p>CFO</p></div>
    <div class="person"><img src="/p/tiny.jpg"><h3>Ann Small</h3><p>Director</p></div>
    <div class="person"><img src="/p/same.jpg"><h3>Bo Same</h3><p>Director</p></div>
    <div class="person"><img src="/p/same-copy.jpg"><h3>Cy Same</h3><p>Director</p></div></body></html>`;
  const requested = [];
  const pages = {
    "https://www.example.com/": { status: "ok", url: "https://www.example.com/", html: home },
    "https://www.example.com/our-company/leadership-team": { status: "ok", url: "https://www.example.com/our-company/leadership-team", html: lead }
  };
  const images = { "/p/tim.jpg": png(400, 400, 1), "/p/jane.jpg": png(300, 380, 2), "/p/tiny.jpg": png(80, 80, 3), "/p/same.jpg": png(300, 300, 9), "/p/same-copy.jpg": png(300, 300, 9) };
  const store = memoryStore();
  const deps = {
    store,
    companyDomain: async () => ({ domain: "example.com", host: "www.example.com", homepage: "https://www.example.com/", confidence: "high" }),
    page: async url => { requested.push(url); return pages[url] || { status: "http", code: 404, url }; },
    fetchImage: async url => { const b = images[new URL(url).pathname]; if (!b) throw new Error("404"); return { bytes: b, type: "png", url }; }
  };
  const insiders = [
    { name: "COOK TIMOTHY D", cik: "0000000011", role: "Director" }, { name: "Doe Jane Q", cik: "12", role: "Chief Financial Officer" },
    { name: "Small Ann", cik: "13", role: "Director" }, { name: "Same Bo", cik: "14", role: "Director" }, { name: "Same Cy", cik: "15", role: "Director" },
    { name: "Absent Al", cik: "16", role: "Director" }
  ];
  const r = await leadershipPhotos({ cik: "320193", name: "Example Corp", insiders }, deps);
  assert.equal(r.status, "ok");
  assert.equal(r.domain, "example.com");
  const byName = Object.fromEntries(r.matches.map(m => [m.personName, m]));
  assert.equal(byName["COOK TIMOTHY D"].imageUrl, "https://www.example.com/p/tim.jpg");
  assert.equal(byName["COOK TIMOTHY D"].ownerCik, "11");
  assert.equal(byName["COOK TIMOTHY D"].key, "cik:11");
  assert.equal(byName["COOK TIMOTHY D"].pageUrl, "https://www.example.com/our-company/leadership-team");
  assert.equal(byName["Doe Jane Q"].cardName, "Jane Q. Doe");
  assert.equal(byName["Small Ann"], undefined, "too small to use");
  assert.equal([byName["Same Bo"], byName["Same Cy"]].filter(Boolean).length, 1, "identical bytes go to one person only");
  assert.ok(requested.indexOf("https://www.example.com/our-company/leadership-team") < requested.indexOf("https://www.example.com/leadership"), "linked page before guessed paths");
  assert.ok(!requested.some(u => u.includes("/careers")));
  assert.deepEqual((await store.getRecord("leader-pages", "0000320193")).pages, ["https://www.example.com/our-company/leadership-team"]);
});

test("leadershipPhotos: no verified domain, low-confidence domain, and bot-walled site", async () => {
  const insiders = [{ name: "COOK TIMOTHY D", cik: "1", role: "Director" }];
  assert.equal((await leadershipPhotos({ cik: "1", insiders }, { companyDomain: async () => null, store: memoryStore() })).status, "no-domain");
  assert.equal((await leadershipPhotos({ cik: "1", insiders }, { companyDomain: async () => ({ domain: "x.com", confidence: "low" }), store: memoryStore() })).status, "no-domain");
  let calls = 0;
  const r = await leadershipPhotos({ cik: "1", insiders }, {
    store: memoryStore(), companyDomain: async () => ({ domain: "walled.com", host: "www.walled.com", confidence: "high" }),
    page: async url => { calls++; return new URL(url).hostname === "www.walled.com" ? { status: "blocked", code: 403, url } : { status: "unreachable", url }; }
  });
  assert.equal(r.status, "blocked");
  assert.equal(r.matches.length, 0);
  assert.ok(calls <= 4, "a blocked or missing host is not retried path by path");
});
