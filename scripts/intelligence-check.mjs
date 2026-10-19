/* Insidir Intelligence in Chrome: every control on intelligence.html, at 1440px and on a 390px touch phone.
   /v1 is mocked from scripts/fixtures/intelligence-api.json (responses captured from a local server over synthetic
   QA records); requests the page sends are recorded and checked. Covers: the instrument (the ten circles of the
   favicon at their own coordinates, counts as received, dot and row selection by pointer, touch and keyboard, the
   records panel and its links, connector lines on desktop only), the introduction (shown once, skippable, absent
   under reduced motion), the tape (rows, timeline ticks, row detail with the SEC source, filters, new vs historical),
   the morning-report briefing (lead, secondary stories, desks, window and order toggles, delivery frequency saved and
   restored when saving fails, explain only when AI is configured, the setup state with quick-add), Capital Structure
   (a person's evidence and its lines), Investigate (a streamed report with its five sections, citations that resolve,
   expandable records, follow-up context, refusal of an empty question, a stream error), Mirror (treemap, budget chips,
   an invalid budget, the unavailable state), error states with retry, no content wider than the screen, and no
   uncaught errors. Usage: CHROME_BIN=... node scripts/intelligence-check.mjs */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));
const FAVICON = [...readFileSync(new URL("../web/assets/icons/favicon.svg", import.meta.url), "utf8").matchAll(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"\/>/g)].map(m => m.slice(1).map(Number));
const server = createServer((req, res) => serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } }));
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { failures++; console.log("FAIL " + name + "\n     " + String(e.message).split("\n").slice(0, 6).join("\n     ")); } };
const stream = (lines, answer) => lines.map(l => JSON.stringify(l)).join("\n") + "\n" + (answer ? JSON.stringify({ stage: "answer", answer }) + "\n" : "");

async function open({ width, mobile = false, scenario = {}, reduced = false, intro = false }) {
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reduced ? "reduce" : "no-preference" });
  if (!intro) await ctx.addInitScript(() => { try { sessionStorage.setItem("ix-intro", "1"); } catch { /* */ } });
  const sent = [];
  await ctx.route("**/v1/**", async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, m = req.method();
    const body = m === "POST" ? JSON.parse(req.postData() || "{}") : null;
    sent.push({ p, m, body, q: url.search, accept: req.headers().accept });
    const reply = (status, json) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    if (scenario[p]) { const s = scenario[p](body, url); return s[2] === "ndjson" ? route.fulfill({ status: s[0], contentType: "application/x-ndjson", body: s[1] }) : reply(s[0], s[1]); }
    if (p === "/v1/me") return reply(200, { user: { id: 1, email: "member@example.com" }, access: { active: true, plan: "pro", status: "active" } });
    if (p === "/v1/me/intelligence/instrument") return reply(200, F.instrument);
    if (p === "/v1/intelligence/tape") return reply(200, F.tape);
    if (p === "/v1/intelligence/structure") return reply(200, F.structure);
    if (p === "/v1/me/intelligence/briefing") return reply(200, F.briefing);
    if (p === "/v1/ai/status") return reply(200, F.aiStatus);
    if (p === "/v1/me/intelligence/preferences" && m === "POST") return reply(200, { frequency: body.frequency, updatedAt: new Date().toISOString(), pushConfigured: false });
    if (p === "/v1/me/intelligence/investigate") return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: stream(F.stream, { ...F.answer, question: body.question, plan: { ...F.answer.plan, usedContext: !!body.context } }) });
    if (p === "/v1/me/intelligence/synthesize") return reply(200, { status: "ready", text: "Three insiders reported sales [1].\n\nNo purchases were reported [2].", tier: "fast", cached: true });
    if (p === "/v1/intelligence/mirror/managers") return reply(200, F.managers);
    if (p.startsWith("/v1/intelligence/mirror/managers/")) return reply(200, F.manager);
    if (p === "/v1/intelligence/mirror/simulate") { const b = Number(url.searchParams.get("budget")); return reply(200, { ...F.simulate, budget: b, allocated: b }); }
    if (p === "/v1/ai/explain") return reply(200, { explanation: "The filing reports a sale.", cached: true });
    if (p === "/v1/me/watchlist" && m === "POST") return reply(200, { saved: true, ticker: body.ticker });
    return reply(200, { items: [] });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/intelligence.html", { waitUntil: "load" });
  await page.waitForTimeout(700);
  return { ctx, page, sent, errors };
}
/* Horizontal overflow, including content that main.ix's overflow clip would hide: any element reaching past the
   viewport that is not inside a deliberate horizontal scroller. */
const overflow = page => page.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > W) bad.push("document " + document.documentElement.scrollWidth);
  const inScroller = el => { for (let e = el.parentElement; e && !e.matches("main.ix"); e = e.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(e).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll("main.ix *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && !inScroller(el)) bad.push((el.getAttribute("class") || el.tagName) + " → " + Math.round(r.right)); }
  return bad.slice(0, 8);
});
const cat = id => F.instrument.mark.find(c => c.id === id);

for (const [label, width, mobile] of [["desktop", 1440, false], ["phone", 390, true]]) {
  const { ctx, page, sent, errors } = await open({ width, mobile });
  const tap = sel => mobile ? page.tap(sel) : page.click(sel);
  await check(label + ": hero copy, and the instrument is the favicon's ten circles at their own coordinates", async () => {
    assert.equal((await page.textContent(".ix-hero__title")).trim(), "See what others overlook.");
    assert.match(await page.textContent(".ix-hero .ix-kicker"), /Insidir \/ Intelligence/i);
    assert.match(await page.textContent(".ix-hero__lede"), /follows the public record, connects the information/);
    await page.waitForSelector("[data-mark] .im-dot[role=button]");
    const drawn = await page.$$eval("[data-mark] .im-core", cs => cs.map(c => ["cx", "cy", "r"].map(a => Number(c.getAttribute(a)))));
    assert.deepEqual(drawn, FAVICON);
    assert.equal(await page.getAttribute("[data-mark] svg", "viewBox"), "343 107 338 740");
    for (const id of ["companies", "filings", "insiders", "purchases", "sales", "changes", "watchlist", "people", "holdings"])
      assert.equal(await page.textContent('[data-count="' + id + '"]'), cat(id).count.toLocaleString("en-US"), id + " count as received");
    await page.waitForFunction(n => document.querySelector('[data-count="findings"]').textContent === String(n), F.briefing.stories.length);
    assert.match(await page.textContent("[data-instrument-note]"), /not live market data/);
    assert.deepEqual(await overflow(page), []);
  });
  await check(label + ": selecting a dot opens its records with working links", async () => {
    await tap('[data-mark] [data-dot="sales"] .im-core');
    assert.equal(await page.getAttribute('[data-mark] [data-dot="sales"]', "aria-pressed"), "true");
    assert.equal(await page.getAttribute('[data-cat="sales"]', "aria-pressed"), "true");
    await page.waitForSelector("[data-panel] .ix-panel__list");
    const links = await page.$$eval("[data-panel] .ix-panel__list a", a => a.map(x => ({ href: x.href, text: x.textContent })));
    assert.equal(links.length, cat("sales").records.length);
    assert.ok(links.every(l => l.href.startsWith("https://www.sec.gov/")), "sale records link to their SEC filings");
    assert.match(links[0].text, new RegExp(cat("sales").records[0].title.split(" · ")[0]));
    assert.ok(await page.isVisible("[data-panel]"), "panel visible after the tap");
    await tap('[data-cat="watchlist"]');
    const w = await page.$$eval("[data-panel] .ix-panel__list a", a => a.map(x => x.getAttribute("href")));
    assert.ok(w.length && w.every(h => /^company\.html\?ticker=/.test(h)), "watchlist records open company reports");
  });
  await check(label + ": connector lines run from each dot to its row on desktop only", async () => {
    const n = await page.$$eval("[data-links] path.iv-link", p => p.length);
    if (mobile) assert.equal(n, 0); else {
      assert.equal(n, 10);
      assert.equal(await page.$eval('[data-links] path[data-link="watchlist"]', p => p.classList.contains("is-active")), true);
    }
  });
  if (!mobile) await check(label + ": the dots are keyboard buttons", async () => {
    await page.focus('[data-mark] [data-dot="filings"]');
    await page.keyboard.press("Enter");
    assert.equal(await page.getAttribute('[data-mark] [data-dot="filings"]', "aria-pressed"), "true");
    assert.match(await page.textContent("[data-caption]"), /SEC filings/);
  });
  await check(label + ": the tape lists disclosures, opens a row, and filters", async () => {
    await page.waitForSelector(".ix-tape__item");
    assert.equal(await page.$$eval(".ix-tape__item", x => x.length), F.tape.events.length);
    assert.equal(await page.$$eval(".ix-tape .iv-tick", x => x.length), F.tape.events.length, "one tick per listed disclosure");
    assert.match(await page.textContent(".ix-tape__summary"), /none new since your last visit/);
    assert.equal(await page.$$eval(".ix-tape__state", s => s.every(x => x.textContent === "Historical")), true);
    await tap(".ix-tape__item:first-child .ix-tape__row");
    assert.equal(await page.getAttribute(".ix-tape__item:first-child .ix-tape__row", "aria-expanded"), "true");
    assert.equal(await page.getAttribute(".ix-tape__detail a.ix-src", "href"), F.tape.events[0].source);
    await tap("[data-tape-form] [data-value='8-K']");
    await page.waitForTimeout(200);
    assert.ok(sent.some(r => r.p === "/v1/intelligence/tape" && /form=8-K/.test(r.q)));
    await page.fill("#tape-ticker", "$nvda");
    await page.waitForTimeout(600);
    assert.ok(sent.some(r => r.p === "/v1/intelligence/tape" && /ticker=NVDA/.test(r.q)));
    const before = sent.length;
    await page.fill("#tape-person", "x'; drop");
    await page.waitForTimeout(600);
    assert.equal(await page.getAttribute("#tape-person", "aria-invalid"), "");
    assert.ok(!sent.slice(before).some(r => r.p === "/v1/intelligence/tape"), "an invalid name is not sent");
    await tap("[data-tape-clear]");
    await page.waitForTimeout(200);
    assert.equal(sent.filter(r => r.p === "/v1/intelligence/tape").at(-1).q, "?days=7&form=all");
  });
  await check(label + ": the briefing is a morning report with dated, sourced stories", async () => {
    await page.waitForSelector(".ix-lead");
    assert.match(await page.textContent("[data-edition-date]"), /\d{4}/);
    assert.equal(await page.$$eval(".ix-front .ix-second", x => x.length), Math.min(4, F.briefing.stories.length - 1));
    const lead = await page.textContent(".ix-lead");
    assert.match(lead, /Main development/); assert.match(lead, /Event/); assert.match(lead, /Disclosed/); assert.match(lead, /Retrieved by Insidir/); assert.match(lead, /Why it’s here/);
    const hrefs = await page.$$eval(".ix-report .ix-sources a", a => a.map(x => x.href));
    assert.ok(hrefs.length && hrefs.every(h => h.startsWith("https://www.sec.gov/")), "sources are SEC links");
    assert.ok(await page.$$eval(".ix-desk__co", x => x.length) > 0, "company desk");
    assert.equal(!!(await page.$("[data-explain]")), !!F.aiStatus.configured);
  });
  await check(label + ": window and order toggles refetch and re-sort; frequency is saved", async () => {
    await tap("[data-window] [data-days='30']");
    await page.waitForTimeout(300);
    assert.ok(sent.some(r => r.p === "/v1/me/intelligence/briefing" && r.q === "?days=30"));
    await tap("[data-order] [data-order-by='latest']");
    assert.equal(await page.getAttribute("[data-order] [data-order-by='latest']", "aria-checked"), "true");
    const newest = [...F.briefing.stories].sort((a, b) => String(b.disclosedAt).localeCompare(String(a.disclosedAt)))[0];
    assert.equal(await page.getAttribute(".ix-lead", "data-story"), newest.id);
    await tap("[data-frequency] [data-frequency-value='weekly']");
    await page.waitForTimeout(250);
    assert.deepEqual(sent.filter(r => r.p === "/v1/me/intelligence/preferences" && r.m === "POST").at(-1).body, { frequency: "weekly" });
    assert.match(await page.textContent("[data-delivery]"), /not available on this deployment|no device|You will receive/);
  });
  await check(label + ": capital structure opens a company and a person's evidence", async () => {
    await page.waitForSelector(".ix-cap [data-person]");
    assert.ok(sent.some(r => r.p === "/v1/intelligence/structure"));
    assert.equal(await page.$$eval(".ix-cap [data-person]", x => x.length), F.structure.people.length);
    const person = F.structure.people[0];
    await tap('.ix-cap [data-person="' + person.cik + '"]');
    assert.equal(await page.getAttribute('.ix-cap [data-person="' + person.cik + '"]', "aria-pressed"), "true");
    const ev = await page.textContent("[data-cap-evidence]");
    assert.match(ev, new RegExp(person.name)); assert.match(ev, /Relationship \(as filed\)/);
    assert.match(ev, new RegExp(F.structure.labels.personSecurity.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(await page.$eval(".ix-node--security", n => n.classList.contains("is-related")));
    const lines = await page.$$eval("[data-cap-links] path", p => p.length);
    assert.equal(lines, mobile ? 0 : F.structure.people.length + F.structure.securities.length);
  });
  await check(label + ": an example question streams a five-part report whose citations resolve", async () => {
    await tap("[data-examples] li:nth-child(2) button");
    await page.waitForSelector(".ix-answer .ix-part");
    const req = sent.filter(r => r.p === "/v1/me/intelligence/investigate").at(-1);
    assert.equal(req.q, "?stream=1"); assert.match(req.accept, /ndjson/);
    assert.equal(req.body.question, "Show recent insider transactions at Tesla.");
    assert.deepEqual(await page.$$eval(".ix-answer .ix-part__title", h => h.map(x => x.textContent)), ["§1Finding", "§2Evidence", "§3Timeline", "§4Relationships", "§5Uncertainty"]);
    const cites = await page.$$eval(".ix-answer a.ix-cite", a => a.map(x => x.getAttribute("href")));
    assert.ok(cites.length > 0, "the report has citations");
    for (const h of new Set(cites)) assert.ok(await page.$(h), "citation target exists: " + h);
    assert.equal(await page.$$eval(".ix-answer .ix-rels li", x => x.length), F.answer.relationships.length);
    assert.match(await page.textContent(".ix-answer"), new RegExp(F.answer.verification.references + " citation references checked against " + F.answer.verification.citations + " SEC sources"));
    await tap(".ix-answer .ix-rec > summary");
    assert.equal(await page.$eval(".ix-answer .ix-rec", d => d.open), true);
    assert.deepEqual(await overflow(page), []);
  });
  await check(label + ": a follow-up sends the previous plan as context; earlier reports fold away", async () => {
    await page.fill(".ix-answer [data-followup] input", "What about Microsoft?");
    await tap(".ix-answer [data-followup] button");
    await page.waitForFunction(() => document.querySelectorAll(".ix-answer .ix-part").length >= 10);
    const post = sent.filter(r => r.p === "/v1/me/intelligence/investigate").at(-1);
    assert.equal(post.body.question, "What about Microsoft?");
    assert.ok(post.body.context && Array.isArray(post.body.context.tickers), "context sent");
    assert.equal(await page.$$eval(".ix-prev", d => d.length), 1);
  });
  await check(label + ": an empty question is refused in the page", async () => {
    await page.fill("#ix-question", "   ");
    await tap(".ix-ask__go");
    assert.equal(await page.isVisible("[data-ask-error]"), true);
  });
  await check(label + ": Mirror draws the allocation treemap, responds to chips and rejects a bad budget", async () => {
    await page.waitForSelector("[data-sim] svg.ix-treemap rect");
    const rects = await page.$$eval("[data-sim] svg.ix-treemap rect", r => r.length);
    assert.equal(rects, Math.min(F.simulate.allocations.length, 18) + (F.simulate.allocations.length > 18 ? 1 : 0));
    await tap("[data-budget='1000']");
    await page.waitForTimeout(300);
    assert.ok(sent.some(r => r.p === "/v1/intelligence/mirror/simulate" && /budget=1000/.test(r.q)));
    await page.fill("#ix-budget", "12.345");
    await page.waitForTimeout(500);
    assert.match(await page.textContent("[data-sim]"), /between \$1 and \$10,000,000/);
    assert.equal(await page.getAttribute("#ix-budget", "aria-invalid"), "true");
    const m = await page.textContent("[data-mirror]");
    assert.match(m, /Disclosure history/); assert.match(m, /Reporting delay/); assert.match(m, /Coverage and delays/);
    assert.deepEqual(await overflow(page), []);
  });
  await check(label + ": no uncaught errors", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

await check("introduction: shown once, skippable, and over within its time limit", async () => {
  const { ctx, page } = await open({ width: 1440, intro: true });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ix-intro")), true);
  assert.equal(await page.isVisible("[data-skip-intro]"), true);
  await page.click("[data-skip-intro]");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ix-intro")), false);
  assert.equal(await page.isVisible("[data-skip-intro]"), false);
  await page.reload({ waitUntil: "load" });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ix-intro")), false, "not repeated in the same session");
  await ctx.close();
  const second = await open({ width: 1440, intro: true });
  await second.page.waitForTimeout(2300);
  assert.equal(await second.page.evaluate(() => document.documentElement.classList.contains("ix-intro")), false, "ends by itself");
  await second.ctx.close();
});
await check("tape: records retrieved since the last visit are marked new", async () => {
  const { ctx, page } = await open({ width: 1440, scenario: { "/v1/intelligence/tape": () => [200, { ...F.tape, events: F.tape.events.map((e, i) => ({ ...e, new: i === 0 })) }] } });
  await page.waitForSelector(".ix-tape__item");
  assert.equal(await page.textContent(".ix-tape__item:first-child .ix-tape__state"), "New");
  assert.match(await page.textContent(".ix-tape__summary"), /1 new since your last visit/);
  assert.equal(await page.$$eval(".ix-tape .iv-tick.is-strong", t => t.length), 1);
  await ctx.close();
});
await check("setup state: quick-add posts the ticker and reloads the briefing and the instrument", async () => {
  const { ctx, page, sent } = await open({ width: 1440, scenario: { "/v1/me/intelligence/briefing": () => [200, { ...F.briefing, stories: [], needsSetup: true, subjects: { tickers: 0, people: 0 } }] } });
  await page.waitForSelector("[data-quick-add]");
  await page.fill("#ix-quick", "$nvda");
  await page.click("[data-quick-add] button");
  await page.waitForTimeout(300);
  assert.deepEqual(sent.find(r => r.p === "/v1/me/watchlist").body, { ticker: "NVDA" });
  assert.ok(sent.filter(r => r.p === "/v1/me/intelligence/briefing").length >= 2);
  assert.ok(sent.filter(r => r.p === "/v1/me/intelligence/instrument").length >= 2);
  await ctx.close();
});
await check("errors: retries, a failing frequency save, a stream error, an unknown ticker, Mirror unavailable", async () => {
  let fail = true;
  const { ctx, page, sent } = await open({ width: 1440, scenario: {
    "/v1/me/intelligence/instrument": () => fail ? [503, { error: "Insidir is temporarily unavailable." }] : [200, F.instrument],
    "/v1/me/intelligence/briefing": () => fail ? [503, { error: "Insidir is temporarily unavailable." }] : [200, F.briefing],
    "/v1/me/intelligence/preferences": () => [500, { error: "Internal error" }],
    "/v1/me/intelligence/investigate": () => [200, stream([F.stream[0], F.stream[1], { stage: "error", error: "Research limit reached for this hour.", status: 429 }]), "ndjson"],
    "/v1/intelligence/structure": (b, url) => url.searchParams.get("ticker") === "ZZZZ" ? [404, { error: "No Form 4 filings stored for ZZZZ." }] : [200, F.structure],
    "/v1/intelligence/mirror/managers": () => [200, { available: false, managers: [], reason: "Form 13F ingestion has not run yet on this deployment.", notes: F.managers.notes }] } });
  await page.waitForSelector("[data-retry='briefing']");
  assert.match(await page.textContent("[data-panel]"), /instrument could not be loaded/);
  fail = false;
  await page.click("[data-retry='instrument']");
  await page.waitForSelector("[data-mark] .im-dot[role=button]");
  await page.click("[data-retry='briefing']");
  await page.waitForSelector(".ix-lead");
  const before = await page.$eval("[data-frequency] [aria-checked=true]", b => b.dataset.frequencyValue);
  await page.click("[data-frequency] [data-frequency-value='daily']");
  await page.waitForTimeout(300);
  assert.equal(await page.$eval("[data-frequency] [aria-checked=true]", b => b.dataset.frequencyValue), before);
  assert.match(await page.textContent("[data-delivery]"), /Not saved/);
  await page.fill("#ix-question", "Show recent insider transactions at Nvidia.");
  await page.click(".ix-ask__go");
  await page.waitForSelector(".ix-answer .ix-error");
  assert.match(await page.textContent(".ix-answer .ix-error"), /Research limit reached/);
  await page.fill("#structure-ticker", "zzzz");
  await page.click("[data-structure-form] button[type=submit]");
  await page.waitForSelector("[data-structure] .ix-empty");
  assert.match(await page.textContent("[data-structure]"), /No Form 4 filings stored for ZZZZ/);
  assert.match(await page.textContent("[data-mirror]"), /Mirror opens when the first Form 13F reports are imported/);
  assert.ok(!sent.some(r => r.p === "/v1/intelligence/mirror/simulate"), "no simulation without data");
  await ctx.close();
});
await check("AI on: a filing explanation and a cited synthesis are shown with their labels", async () => {
  const { ctx, page, sent } = await open({ width: 1440, scenario: { "/v1/ai/status": () => [200, { configured: true }],
    "/v1/me/intelligence/investigate": b => [200, stream(F.stream, { ...F.answer, question: b.question, synthesis: { available: true, tier: "fast" } }), "ndjson"] } });
  await page.waitForSelector(".ix-lead");
  await page.click(".ix-lead .ix-more > summary");
  await page.click(".ix-lead [data-explain]");
  await page.waitForSelector(".ix-lead .ix-ai");
  assert.match(await page.textContent(".ix-lead .ix-ai"), /Written by AI/);
  assert.ok(sent.some(r => r.p === "/v1/ai/explain" && /accession=\d{18}/.test(r.q)));
  await page.fill("#ix-question", "Show recent insider transactions at Nvidia.");
  await page.click(".ix-ask__go");
  await page.waitForSelector("[data-synth]");
  await page.click("[data-synth]");
  await page.waitForSelector("[data-synth-box] .ix-ai");
  const box = await page.textContent("[data-synth-box]");
  assert.match(box, /Three insiders reported sales/); assert.match(box, /Written by AI/);
  for (const h of await page.$$eval("[data-synth-box] a.ix-cite", a => a.map(x => x.getAttribute("href")))) assert.ok(await page.$(h), h);
  await ctx.close();
});
await check("reduced motion: no introduction and nothing animates", async () => {
  const { ctx, page } = await open({ width: 1440, reduced: true, intro: true });
  await page.waitForSelector(".ix-lead");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ix-intro")), false);
  await page.click('[data-mark] [data-dot="sales"] .im-core');
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("main.ix")).length);
  assert.equal(running, 0);
  await ctx.close();
});

await browser.close();
server.close();
if (failures) { console.log(failures + " failure(s)"); process.exit(1); }
console.log("Intelligence: all checks passed");
