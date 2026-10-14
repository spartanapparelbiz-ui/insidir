import test from "node:test";
import assert from "node:assert/strict";
import {
  registrableDomain, parseRobots, robotsAllows, isChallenge, createPublicFetcher, parseHtml, textStrings, elements, pageMeta, jsonLd, PUBLIC_UA, decodeEntities
} from "../src/public-fetch.mjs";
import {
  blockedDomain, scanDomains, filingText, pickFilings, filingDomains, confirmsName, siteNames, companyDomain, extractLogoCandidates,
  websiteLogoCandidates, domainHasToken, nameTokens
} from "../src/company-domain.mjs";

/* ---------- fakes ---------- */
function memoryStore() {
  const m = new Map();
  return { m, getRecord: async (k, key) => m.get(k + ":" + key) ?? null, putRecord: async (k, key, v) => { m.set(k + ":" + key, v); } };
}
function response(status, body = "", headers = {}) {
  return new Response(status >= 300 && status < 400 ? null : body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}
function png(width, height) {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}

/* ---------- public-fetch ---------- */
test("registrable domain collapses subdomains and keeps country second levels", () => {
  assert.equal(registrableDomain("https://investors.sohu.com/x"), "sohu.com");
  assert.equal(registrableDomain("ir.opusgtx.com"), "opusgtx.com");
  assert.equal(registrableDomain("www.cht.com.tw"), "cht.com.tw");
  assert.equal(registrableDomain("shop.example.co.uk."), "example.co.uk");
});

test("robots.txt: our token's group wins over *, longest rule wins, allow breaks ties", () => {
  const robots = parseRobots(`User-agent: PetalBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\nCrawl-delay: 2`);
  assert.equal(robotsAllows(robots, "https://x.com/leadership"), true, "PetalBot's Disallow: / does not apply to us");
  assert.equal(robotsAllows(robots, "https://x.com/private/a"), false);
  assert.equal(robotsAllows(robots, "https://x.com/private/ok/b"), true);
  assert.equal(robotsAllows(robots, "https://x.com/doc.pdf"), false);
  assert.equal(robotsAllows(robots, "https://x.com/doc.pdf?x=1"), true);
  assert.equal(robots.delay, 2);
  const mine = parseRobots("User-agent: *\nAllow: /\n\nUser-agent: InsidirResearch\nDisallow: /team");
  assert.equal(robotsAllows(mine, "https://x.com/team"), false, "a group naming our agent replaces *");
  assert.equal(robotsAllows(parseRobots(""), "https://x.com/a"), true);
});

test("bot walls are recognised; the word captcha alone is not one", () => {
  assert.equal(isChallenge(403, "<title>Just a moment...</title>"), true);
  assert.equal(isChallenge(403, "nope", { server: "AkamaiGHost" }), true);
  assert.equal(isChallenge(403, "Request blocked.", { server: "CloudFront" }), true);
  assert.equal(isChallenge(200, "<html>please solve the captcha in our contact form</html>"), false);
  assert.equal(isChallenge(200, "<html><script>window._cf_chl_opt={}</script></html>"), true);
  assert.equal(isChallenge(404, "Just a moment..."), false);
});

test("public fetcher: honest UA, robots, pacing, SSRF re-check on redirects, block backoff", async () => {
  const calls = [], checks = [], waits = [];
  let clock = 1_000_000;
  const pages = {
    "https://www.acme.com/robots.txt": () => response(200, "User-agent: *\nDisallow: /secret", { "content-type": "text/plain" }),
    "https://www.acme.com/": () => response(301, "", { location: "/home" }),
    "https://www.acme.com/home": () => response(200, "<title>Acme</title>"),
    "https://www.acme.com/to-http": () => response(302, "", { location: "http://www.acme.com/plain" }),
    "https://wall.acme.com/robots.txt": () => response(404, "nf"),
    "https://wall.acme.com/": () => response(403, "<title>Just a moment...</title>"),
    "https://busy.acme.com/robots.txt": () => response(404, "nf"),
    "https://busy.acme.com/": () => response(429, "slow down", { "retry-after": "120" })
  };
  const store = memoryStore();
  const f = createPublicFetcher({
    store, now: () => clock, wait: async ms => { waits.push(ms); clock += ms; },
    check: async url => { checks.push(url); if (/evil/.test(url)) throw new Error("Private address"); return new URL(url); },
    fetchImpl: async (url, init) => { calls.push({ url, ua: init.headers["User-Agent"] }); return (pages[url] || (() => response(404, "nf")))(); }
  });
  const home = await f.page("https://www.acme.com/");
  assert.equal(home.status, "ok");
  assert.equal(home.url, "https://www.acme.com/home");
  assert.ok(calls.every(c => c.ua === PUBLIC_UA), "never a browser UA");
  assert.ok(checks.includes("https://www.acme.com/home"), "redirect target checked again");
  assert.ok(waits.some(w => w >= 1000), "second request on the host waits at least a second");
  assert.equal((await f.page("https://www.acme.com/secret/x")).status, "robots");
  assert.equal(calls.filter(c => c.url.includes("/secret")).length, 0, "disallowed page never requested");
  assert.equal((await f.page("https://www.acme.com/to-http")).reason, "not-https");
  assert.equal((await f.page("http://www.acme.com/")).status, "error");
  assert.equal((await f.page("https://evil.acme.com/")).status, "unreachable");
  const wall = await f.page("https://wall.acme.com/");
  assert.equal(wall.status, "blocked");
  assert.ok(store.m.get("site-block:wall.acme.com"), "block recorded for 30 days");
  const before = calls.length;
  assert.equal((await f.page("https://wall.acme.com/leadership")).status, "blocked");
  assert.equal(calls.length, before, "blocked host not contacted again");
  assert.equal((await f.page("https://busy.acme.com/")).status, "rate-limited");
});

test("HTML parser: attributes, raw text, implied ends, entities", () => {
  const root = parseHtml(`<!doctype html><html><head><title>A &amp; B</title><script>if (a<b) {"</div>"}</script>
    <meta property="og:site_name" content="Acme&nbsp;Corp"></head><body><ul><li>One<li>Two</ul><p>x<div class=card data-src='/a.jpg'>Jane&#x20;Doe</div>
    <img src=/b.png alt="B"/><svg viewBox="0 0 1 1"><path d="M0"/></svg></body></html>`);
  const meta = pageMeta(root, "https://acme.com/");
  assert.equal(meta.title, "A & B");
  assert.equal(meta["og:site_name"], "Acme Corp");
  const lis = [...elements(root)].filter(e => e.tag === "li");
  assert.equal(lis.length, 2);
  assert.deepEqual(lis.map(l => textStrings(l).join("")), ["One", "Two"]);
  const div = [...elements(root)].find(e => e.tag === "div");
  assert.equal(div.attrs["data-src"], "/a.jpg");
  assert.equal(div.parent.tag, "body", "an open <p> is closed by <div>");
  assert.deepEqual(textStrings(div), ["Jane Doe"]);
  assert.equal([...elements(root)].find(e => e.tag === "img").attrs.src, "/b.png");
  assert.equal(decodeEntities("&rsquo;&#8217;&bogus;"), "’’&bogus;");
  const ld = jsonLd(parseHtml(`<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Acme","logo":{"url":"/l.svg"}}]}</script>`));
  assert.ok(ld.some(o => o["@type"] === "Organization"));
});

/* ---------- filing scan ---------- */
test("blocklist is anchored to the registrable domain", () => {
  assert.equal(blockedDomain("stctransfer.com"), true);
  assert.equal(blockedDomain("globenewswire.com"), true);
  assert.equal(blockedDomain("fdic.gov"), true);
  assert.equal(blockedDomain("x.com"), true);
  assert.equal(blockedDomain("opusgtx.com"), false, "x.com must not match opusgtx.com");
  assert.equal(blockedDomain("apple.com", "Apple Inc."), false);
  assert.equal(blockedDomain("apple.com", "Acme Corp"), true);
  assert.equal(blockedDomain("form10-k.htm"), true);
});

test("domain scoring: website context and name tokens beat stray mentions", () => {
  const text = filingText(`<p>Our transfer agent is Computershare (www.computershare.com). See www.globenewswire.com.</p>
    <ix:header><p>www.hidden-xbrl.com</p></ix:header>
    <p>Available Information. Our Internet address is opusgtx.com. We post reports on our website.</p>
    <p>${"Unrelated filler text about operations. ".repeat(10)}</p><p>Partner site www.partnerco.com and www.partnerco.com.</p>`);
  const ranked = scanDomains(text, "Opus Genetics, Inc.");
  assert.equal(ranked[0].domain, "opusgtx.com");
  assert.ok(ranked[0].score >= 7, "bare domain in website context plus name token");
  assert.ok(!ranked.some(r => r.domain === "computershare.com" || r.domain === "globenewswire.com" || r.domain === "hidden-xbrl.com"));
  const partner = ranked.find(r => r.domain === "partnerco.com");
  assert.ok(partner && partner.score < 5, "mentions without context stay below the acceptance score");
  const sub = scanDomains("Available Information: our website is www.amazon.com. Amazon India www.amazon.in www.amazon.in", "AMAZON COM INC");
  assert.ok(sub.find(r => r.domain === "amazon.com").snippet);
});

test("filing order: annual, amended, quarterly, registration; then 8-K exhibits", async () => {
  const subs = { name: "Acme Corp", filings: { recent: {
    form: ["8-K", "10-Q", "8-K", "10-K", "S-1"], accessionNumber: ["0000000001-26-000001", "0000000001-26-000002", "0000000001-26-000003", "0000000001-26-000004", "0000000001-26-000005"],
    primaryDocument: ["k1.htm", "q.htm", "k2.htm", "ten.htm", "s1.htm"], filingDate: ["2026-09-01", "2026-08-01", "2026-07-01", "2026-03-01", "2025-01-01"] } } };
  assert.deepEqual(pickFilings(subs).picks.map(p => p.form), ["10-K", "10-Q", "S-1"]);
  const urls = [];
  const sec = async (url, o) => {
    urls.push(url);
    if (url.endsWith("index.json")) return { directory: { item: [{ name: "ex99-1.htm" }] } };
    if (url.endsWith("ex99-1.htm")) return "<p>About Acme: visit www.acmecorp.com for more.</p>";
    return "<p>No website here.</p>";
  };
  const r = await filingDomains({ cik: "1", name: "Acme Corp", submissions: subs }, { sec });
  assert.equal(r.candidates[0].domain, "acmecorp.com");
  assert.deepEqual(r.candidates[0].sources, ["8-K EX-99"]);
  assert.ok(urls[0].endsWith("/ten.htm") && urls[1].endsWith("/q.htm") && urls[2].endsWith("/s1.htm"));
});

test("homepage title must name the company: a transfer agent's site does not", () => {
  assert.equal(confirmsName(["Securities Transfer Corporation | Stock Transfer Agent"], "Farmhouse, Inc.", "stctransfer.com").ok, false);
  assert.equal(confirmsName(["The Coca-Cola Company"], "COCA COLA CO", "coca-colacompany.com").ok, true);
  assert.equal(confirmsName(["PG&E Corporation | PG&E"], "PG&E Corp", "pgecorp.com").ok, true);
  assert.equal(confirmsName(["Banking for everyone"], "First Financial Bancorp", "bank.com").ok, false, "generic words alone never confirm");
  assert.equal(confirmsName(["World Leader in AI Computing | NVIDIA"], "NVIDIA CORP", "nvidia.com").ok, true);
  assert.equal(domainHasToken("amd.com", "ADVANCED MICRO DEVICES INC"), true, "initials");
  assert.equal(domainHasToken("cht.com.tw", "CHUNGHWA TELECOM CO LTD", "CHT"), true, "ticker");
  assert.equal(domainHasToken("btct.us", "Chanson International Holding", "CIIT"), false);
  assert.deepEqual(nameTokens("PG&E Corp"), ["pge"]);
  const root = parseHtml(`<title>Home</title><script type="application/ld+json">{"@type":"Organization","name":"Acme Robotics"}</script>`);
  assert.ok(siteNames(root, pageMeta(root, "https://acme.com/")).includes("Acme Robotics"));
});

/* ---------- companyDomain ---------- */
function domainDeps({ docs = {}, wikidata = [], pages = {}, store = memoryStore() } = {}) {
  const secCalls = [];
  return {
    store, secCalls,
    sec: async (url, o) => { secCalls.push(url); if (o?.json && url.includes("submissions")) return docs.submissions; if (url.endsWith("index.json")) return docs.index || { directory: { item: [] } }; return docs[url.split("/").pop()] || ""; },
    external: async () => ({ results: { bindings: wikidata.map(w => ({ w: { value: w } })) } }),
    page: async url => pages[url] || { status: "http", code: 404, url }
  };
}
const subsFor = (forms, docs) => ({ name: "Acme Robotics Inc", filings: { recent: { form: forms, accessionNumber: forms.map((_, i) => "0000000001-26-00000" + i), primaryDocument: docs, filingDate: forms.map(() => "2026-01-01") } } });

test("companyDomain: annual-report domain confirmed by the homepage title, then cached", async () => {
  const deps = domainDeps({
    docs: { submissions: subsFor(["10-K"], ["k.htm"]), "k.htm": "<p>Available Information. Our website is www.acmerobotics.com.</p>" },
    wikidata: ["https://www.acmerobotics.com/"],
    pages: { "https://www.acmerobotics.com/": { status: "ok", url: "https://www.acmerobotics.com/", html: "<title>Acme Robotics | Home</title>" } }
  });
  const r = await companyDomain({ cik: "123", name: "Acme Robotics Inc", ticker: "ACMR" }, deps);
  assert.equal(r.domain, "acmerobotics.com");
  assert.equal(r.confidence, "high");
  assert.equal(r.confirmed, true);
  assert.match(r.method, /filing\+wikidata\+title/);
  const n = deps.secCalls.length;
  const again = await companyDomain({ cik: "123", name: "Acme Robotics Inc" }, deps);
  assert.equal(again.domain, "acmerobotics.com");
  assert.equal(deps.secCalls.length, n, "served from the 30-day record");
});

test("companyDomain: an 8-K-only domain whose site names someone else is rejected", async () => {
  const deps = domainDeps({
    docs: { submissions: subsFor(["8-K"], ["e.htm"]), index: { directory: { item: [{ name: "ex99.htm" }] } }, "ex99.htm": "<p>About Farmhouse: Contact our transfer agent at www.stcagents.com or visit www.stcagents.com.</p>" },
    pages: { "https://www.stcagents.com/": { status: "ok", url: "https://www.stcagents.com/", html: "<title>Securities Transfer Corporation</title>" } }
  });
  assert.equal(await companyDomain({ cik: "77", name: "Farmhouse, Inc." }, deps), null);
  assert.equal((await deps.store.getRecord("domain", "0000000077")).domain, null, "negative result cached");
});

test("companyDomain: bot-walled homepage keeps a domain only with independent agreement", async () => {
  const blockedPage = { "https://www.acmerobotics.com/": { status: "blocked", code: 403, url: "https://www.acmerobotics.com/" } };
  const agreed = domainDeps({ docs: { submissions: subsFor(["10-K"], ["k.htm"]), "k.htm": "Available Information: www.acmerobotics.com" }, wikidata: ["https://acmerobotics.com"], pages: blockedPage });
  const r = await companyDomain({ cik: "5", name: "Acme Robotics Inc" }, agreed);
  assert.equal(r.domain, "acmerobotics.com");
  assert.equal(r.confirmed, false);
  assert.equal(r.confidence, "high");
  const alone = domainDeps({ docs: { submissions: subsFor(["10-K"], ["k.htm"]), "k.htm": "Available Information: www.robo-site.com" }, pages: { "https://www.robo-site.com/": { status: "blocked", code: 403 } } });
  assert.equal(await companyDomain({ cik: "6", name: "Acme Robotics Inc" }, alone), null, "weak single-source domain without a readable page");
});

/* ---------- website logo candidates ---------- */
const HOME = `<html><head><title>Acme Robotics</title>
  <link rel="apple-touch-icon" sizes="57x57" href="/t57.png"><link rel="apple-touch-icon" sizes="180x180" href="/t180.png">
  <link rel="mask-icon" href="/mask.svg" color="#000">
  <script type="application/ld+json">{"@type":"Organization","name":"Acme","logo":"https://cdn.acme.com/img/acme-logo.svg"}</script>
  <script type="application/ld+json">{"@type":"Organization","logo":"https://media.base44.com/default.png"}</script></head>
  <body><header><div class="lang"><a href="/fr/"><img src="/flags/fr.png" class="flag-icon" alt="Français"></a></div>
  <a href="/" class="site-logo"><img src="/img/acme-logo-dark.png" alt="Acme Robotics" height="48"></a>
  <nav><a href="/customers"><img src="/img/customer-logo-audi.png" class="logo"></a></nav></header>
  <main>...</main><footer><a href="/"><img src="/img/acme-logo-white.png" class="footer-logo"></a></footer></body></html>`;

test("logo extraction: JSON-LD, first header home-link logo, light variant, mask-icon, large touch icon", () => {
  const c = extractLogoCandidates(parseHtml(HOME), "https://www.acmerobotics.com/", { name: "Acme Robotics Inc", domain: "acmerobotics.com" });
  assert.deepEqual(c.map(x => x.kind), ["jsonld", "header", "light-variant", "mask-icon", "apple-touch-icon"]);
  assert.equal(c[0].url, "https://cdn.acme.com/img/acme-logo.svg");
  assert.equal(c[1].url, "https://www.acmerobotics.com/img/acme-logo-dark.png", "flag and customer logos are skipped");
  assert.equal(c[2].url, "https://www.acmerobotics.com/img/acme-logo-white.png");
  assert.equal(c[4].url, "https://www.acmerobotics.com/t180.png");
  assert.ok(!c.some(x => /base44/.test(x.url)), "site-builder default rejected");
});

test("websiteLogoCandidates: loads bytes, drops tiny marks, prefers the light variant of a dark logo", async () => {
  const images = {
    "https://cdn.acme.com/img/acme-logo.svg": { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), type: "svg" },
    "https://www.acmerobotics.com/img/acme-logo-dark.png": { bytes: png(300, 60), type: "png" },
    "https://www.acmerobotics.com/img/acme-logo-white.png": { bytes: png(300, 60), type: "png" },
    "https://www.acmerobotics.com/mask.svg": { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), type: "svg" },
    "https://www.acmerobotics.com/t180.png": { bytes: png(120, 120), type: "png" }
  };
  const list = await websiteLogoCandidates({ cik: "1", name: "Acme Robotics Inc" }, {
    companyDomain: async () => ({ domain: "acmerobotics.com", confidence: "high" }),
    page: async url => ({ status: "ok", url, html: HOME }),
    gate: async () => true, paced: (u, task) => task(),
    fetchImage: async url => { if (!images[url]) throw new Error("404"); return { ...images[url], url }; },
    measure: async () => ({ visible: 0.1 })
  });
  const kinds = list.map(x => x.kind);
  assert.ok(!kinds.includes("apple-touch-icon"), "a touch icon smaller than 180px is dropped after download");
  assert.equal(kinds.indexOf("light-variant") < kinds.indexOf("header"), true, "light variant ranks above the dark header logo");
  assert.ok(list.every(x => Buffer.isBuffer(x.bytes) && x.type && x.url));
  assert.deepEqual(await websiteLogoCandidates({ cik: "1", name: "X" }, { companyDomain: async () => null }), []);
});
