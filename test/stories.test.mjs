import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { STORIES, CREATOR_CONCEPTS, PRODUCT_CLIPS, SUPPORTING_QUOTES, PUBLIC_STORY_PATHS, REF_CODE_PATTERN, storyPath, storiesForTicker, storiesForPerson, readSeconds } from "../src/stories.mjs";
import { renderAll, ORIGIN } from "../scripts/build-stories.mjs";
import { REF_CODE } from "../src/creator-program.mjs";
import { serveStatic } from "../src/web.mjs";
import { handlePublicPage, sitemapFile, clearPublicPageCache } from "../src/public-pages.mjs";
import { guaranteeFindings, directiveFindings } from "../src/compliance-guard.mjs";
import { classifyPage } from "../src/paywall.mjs";

/* Research stories and the creator kit (src/stories.mjs, scripts/build-stories.mjs). Figures are checked against
 * their verbatim filing quotes here; scripts/verify-stories.mjs checks the quotes against sec.gov itself. */
const WEB = new URL("../web/", import.meta.url);
const digits = s => (String(s).match(/\d[\d,]*(\.\d+)?/g) || []).map(n => n.replace(/,/g, ""));
const pageText = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
async function withServer(fn) {
  const server = createServer((req, res) => serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } }));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await fn("http://127.0.0.1:" + server.address().port); } finally { server.close(); }
}

test("every figure is quoted from its filing or is labelled arithmetic that recomputes", () => {
  for (const s of STORIES) {
    assert.ok(s.figures.length >= 3, s.slug);
    for (const f of s.figures) {
      assert.ok(Boolean(f.quote) !== Boolean(f.calc), `${s.slug} ${f.label}: a quote or a calc, not both`);
      if (f.calc) { assert.equal(f.value, f.calc(), `${s.slug} ${f.label}`); assert.match(f.note, /Insidir arithmetic/, f.label); continue; }
      const quoted = digits(f.quote);
      for (const n of digits(f.value)) assert.ok(quoted.includes(n), `${s.slug} ${f.label}: ${n} is not in "${f.quote}"`);
    }
    assert.ok((SUPPORTING_QUOTES[s.slug] || []).length >= 3, s.slug + " has supporting quotes for its text");
    assert.equal(s.sources.filter(x => x.primary).length, 1, s.slug + " has one primary document");
    for (const x of s.sources) assert.match(x.url, /^https:\/\/www\.sec\.gov\//, x.url);
    assert.match(s.filed, /^2026-\d\d-\d\d$/);
  }
  // Arithmetic the stories state in prose.
  const epd = STORIES[0];
  assert.match(epd.sections[1].paras[1], /3,208,017 units/);
  assert.match(epd.sections[1].paras[1], /about 0\.08%/);
  const brk = STORIES[2];
  const ops = brk.table.rows.slice(0, 6).reduce((a, r) => a + r[1], 0), net = brk.table.rows.reduce((a, r) => a + r[1], 0);
  assert.equal(ops, 44486); assert.equal(net, brk.table.total[1], "the filed lines add up to the filed total");
  assert.equal(brk.table.rows.reduce((a, r) => a + r[2], 0), brk.table.total[2]);
});

test("the committed pages are exactly what the generator renders", () => {
  for (const [name, html] of Object.entries(renderAll())) assert.equal(readFileSync(new URL(name, WEB), "utf8"), html, name + " is stale: run node scripts/build-stories.mjs");
});

test("story pages: canonical, social cards, article data, sources, share controls and referral handling", async () => {
  await withServer(async base => {
    for (const s of STORIES) {
      const path = storyPath(s);
      for (const p of [path, path.replace(/\.html$/, "")]) assert.equal((await fetch(base + p)).status, 200, p);
      const html = await (await fetch(base + path)).text();
      assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}${path}">`));
      for (const tag of ["og:title", "og:description", "og:url", "og:image", "og:type"]) assert.match(html, new RegExp(`property="${tag}" content="[^"]+"`), tag);
      assert.match(html, /property="og:type" content="article"/);
      assert.match(html, /name="twitter:card" content="summary_large_image"/);
      assert.ok(existsSync(new URL(`assets/img/stories/${s.slug}.png`, WEB)), "share image for " + s.slug);
      assert.doesNotMatch(html, /name="robots"/, "public stories are indexable");
      const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
      assert.equal(ld["@type"], "Article"); assert.equal(ld.url, ORIGIN + path); assert.equal(ld.isBasedOn, s.sources.find(x => x.primary).url);
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
      assert.ok(html.includes(`href="${s.sources.find(x => x.primary).url.replace(/&/g, "&amp;")}"`), "links the original filing");
      for (const attr of ["data-share-copy", "data-share-native", "data-share-description", "data-share-status"]) assert.match(html, new RegExp(attr), attr);
      assert.match(html, /data-share-native[^>]*hidden/, "the share sheet button stays hidden until the device has one");
      assert.match(html, /assets\/js\/referral\.js/, "a creator's ?ref= on a story is remembered for sign-up");
      assert.match(html, /assets\/js\/public-share\.js/);
      assert.match(html, /href="\/signup\.html"/, "the existing sign-up link is used as is");
      assert.match(html, /Historical filing/);
      assert.match(html, /not investment advice/i);
      for (const f of s.figures) assert.ok(html.includes(f.value.replace(/&/g, "&amp;")), f.value);
      for (const v of ["v13-halftone.js", "v13-motion.js", "v14-public.css", "v19-stories.css"]) assert.ok(html.includes(v), v);
    }
    const hub = await (await fetch(base + "/stories.html")).text();
    for (const s of STORIES) assert.ok(hub.includes(`href="${storyPath(s)}"`), "hub links " + s.slug);
    assert.match(hub, /<link rel="canonical" href="https:\/\/insidir\.com\/stories\.html">/);
    assert.equal((await fetch(base + "/stories")).status, 200, "/stories serves the hub");
    for (const p of ["partner-insider.html", "partner-mining.html", "partner-value.html"]) {
      const html = await (await fetch(base + "/" + p)).text();
      assert.match(html, /<meta name="robots" content="noindex,nofollow">/, p + " stays private");
      assert.match(html, /Prepared as a partnership example for/, p + " keeps its partnership wording");
      assert.match(html, /href="\/stories\/[a-z0-9-]+\.html"/, p + " points to the public edition");
    }
    for (const s of STORIES) assert.doesNotMatch(await (await fetch(base + storyPath(s))).text(), /Prepared as a partnership|Future Investing|Mining Stock Education|Sikand/, "public stories carry no creator-specific language");
  });
});

test("the creator kit: six concepts of 15–30 seconds, sources, real footage, link builder and disclosures", async () => {
  assert.equal(CREATOR_CONCEPTS.length, 6);
  for (const c of CREATOR_CONCEPTS) {
    const sec = readSeconds(c.script);
    assert.ok(sec >= 15 && sec <= 30, `${c.id} reads in ${sec}s`);
    assert.ok(c.script.startsWith(c.hook), c.id + " opens on its hook");
    assert.ok(c.hook.split(/\s+/).length <= 16, c.id + " hook fits the first seconds");
    assert.ok(c.record.length >= 2, c.id);
    assert.ok(c.story === null || STORIES.some(s => s.slug === c.story), c.id);
  }
  for (const clip of PRODUCT_CLIPS) for (const e of ["mp4", "webm", "jpg"]) assert.ok(existsSync(new URL(`assets/video/${clip.id}.${e}`, WEB)), clip.id + "." + e);
  await withServer(async base => {
    const html = await (await fetch(base + "/creator-kit.html")).text();
    assert.equal((html.match(/class="st-concept"/g) || []).length, 6);
    assert.equal((html.match(/data-copy-target="script-/g) || []).length, 6, "every script has a copy button");
    for (const c of CREATOR_CONCEPTS) assert.ok(html.includes(`id="script-${c.id}"`), c.id);
    assert.match(html, /data-link-builder/);
    for (const m of html.matchAll(/<option value="([^"]+)"/g)) {
      assert.ok(["/", "/insider-trading", "/signup.html", ...PUBLIC_STORY_PATHS].includes(m[1]), "builder offers a public page: " + m[1]);
      if (m[1] !== "/insider-trading") assert.equal((await fetch(base + m[1])).status, 200, m[1]);
    }
    assert.match(html, /data-lb-copy disabled/, "nothing to copy until a code has the approved shape");
    assert.match(html, /#ad Paid partnership with Insidir/);
    assert.match(html, /AI-generated/);
    assert.match(html, /Endorsement Guides/);
    assert.match(html, /No made-up testimonials/);
    for (const clip of PRODUCT_CLIPS) assert.ok(html.includes(`/assets/video/${clip.id}.mp4`), clip.id);
    const creators = await (await fetch(base + "/creators.html")).text();
    assert.match(creators, /\$10/); assert.match(creators, /30 days/); assert.match(creators, /href="\/creator-kit\.html"/);
    assert.match(creators, /Commissions are reviewed after a 30-day eligibility period and paid manually after confirmation\./, "program terms are unchanged");
  });
});

test("share and referral code rules match the creator program exactly", () => {
  assert.equal(REF_CODE_PATTERN.source, REF_CODE.source);
  const js = readFileSync(new URL("assets/js/public-share.js", WEB), "utf8");
  assert.ok(js.includes("const CODE = /" + REF_CODE.source + "/;"), "public-share.js validates codes with the program's pattern");
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/, "sharing never re-attaches a stored code to someone else's link");
  assert.doesNotMatch(js, /utm_|fetch\(|sendBeacon|XMLHttpRequest/, "sharing sends nothing anywhere");
  const referral = readFileSync(new URL("assets/js/referral.js", WEB), "utf8");
  assert.ok(referral.includes(REF_CODE.source), "referral.js is unchanged in what it accepts");
});

test("public story pages pass the compliance gate and are public, indexable and in the sitemap", async () => {
  const files = [...readdirSync(new URL("stories/", WEB)).map(f => "stories/" + f), "stories.html", "creator-kit.html", "creators.html"];
  for (const file of files) {
    const text = pageText(readFileSync(new URL(file, WEB), "utf8"));
    assert.deepEqual(guaranteeFindings(text), [], file);
    assert.deepEqual(directiveFindings(text), [], file);
    assert.doesNotMatch(text, /(?<!not )breaking|\bjust in\b|this week's/i, file + " does not present a historical filing as news");
  }
  for (const p of PUBLIC_STORY_PATHS) assert.equal(classifyPage(p), "public", p);
  const xml = await sitemapFile("pages", 1, { query: async () => ({ rows: [] }), origin: "https://insidir.com" });
  for (const p of PUBLIC_STORY_PATHS) assert.ok(xml.includes(`<loc>https://insidir.com${p}</loc>`), p);
  for (const p of ["/", "/platform.html", "/insider-trading", "/signup.html", "/subscription-policy.html"]) assert.ok(xml.includes(`<loc>https://insidir.com${p}</loc>`), "kept " + p);
  assert.doesNotMatch(xml, /partner-/, "private partner briefs stay out of the sitemap");
});

test("the insider-trading pages link the stories, and a covered company or person links its story", async () => {
  assert.deepEqual(storiesForTicker("brk.b").map(s => s.slug), ["berkshire-hathaway-2025-annual-report"]);
  assert.deepEqual(storiesForTicker("EPD").map(s => s.slug), ["enterprise-products-insider-purchase"]);
  assert.deepEqual(storiesForTicker("AAPL"), []);
  assert.deepEqual(storiesForPerson("0001183251").map(s => s.slug), ["enterprise-products-insider-purchase"]);
  clearPublicPageCache();
  const res = { headers: {}, setHeader() {}, writeHead(s, h) { this.status = s; Object.assign(this.headers, h); }, end(b) { this.body = String(b || ""); } };
  const line = { id: 1, accession: "000118325126000006", issuer_cik: "0001061219", ticker: "EPD", owner_cik: "0001183251", owner_name: "TEAGUE AJ",
    transaction_date: new Date("2026-03-20T00:00:00Z"), transaction_code: "P", category: "reported_purchase", derivative: false, shares: "2665", price_per_share: "37.5494",
    estimated_value: "100069.15", source_url: "https://www.sec.gov/Archives/edgar/data/1183251/000118325126000006/form4.xml", issuer_name: "ENTERPRISE PRODUCTS PARTNERS L.P.",
    published_at: new Date("2026-03-23T20:42:31Z"), is_amendment: false };
  const query = async sql => /FROM sec_transactions t JOIN sec_filings f/.test(sql) && /t\.ticker=\$1/.test(sql) && /LIMIT \$2/.test(sql) ? { rows: [line] } : { rows: [] };
  await handlePublicPage({ method: "GET", headers: {} }, res, new URL("http://localhost/insider-trading/EPD"), { query, env: {}, requester: "stories-test" });
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('href="/stories/enterprise-products-insider-purchase.html"'), "the EPD page links its story");
  assert.match(res.body, /href="\/stories\.html">Stories<\/a>/, "the public pages' navigation reaches the stories");
  const hub = { ...res, body: "" };
  clearPublicPageCache();
  await handlePublicPage({ method: "GET", headers: {} }, hub, new URL("http://localhost/insider-trading"), { query: async () => ({ rows: [] }), env: {}, requester: "stories-test-2" });
  for (const s of STORIES) assert.ok(hub.body.includes(`href="${storyPath(s)}"`), "the hub lists " + s.slug);
  const home = readFileSync(new URL("index.html", WEB), "utf8");
  assert.match(home, /<a class="lp-public" href="\/stories\.html">/, "the landing page links the stories");
});
