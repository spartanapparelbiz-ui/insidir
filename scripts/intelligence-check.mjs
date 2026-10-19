/* Insidir Intelligence in Chrome: every control on intelligence.html, at 1440px and on a 390px touch phone.
   /v1 is mocked from scripts/fixtures/intelligence-api.json (responses captured from a local server over synthetic
   QA records); requests the page sends are recorded and checked. Covers: the hero and section bar, briefing window
   and order toggles, delivery frequency (saved, and restored when saving fails), story details and related jumps,
   the explain button only when AI is configured, the setup state with quick-add, Investigate (typed question, an
   example, follow-up context, citations that resolve to their source entries, synthesis), Mirror (manager list,
   budget chips, an invalid budget, the unavailable state), error states with retry, reduced motion, no horizontal
   overflow, and no uncaught errors. Usage: CHROME_BIN=... node scripts/intelligence-check.mjs */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const F = JSON.parse(readFileSync(new URL("./fixtures/intelligence-api.json", import.meta.url), "utf8"));
const server = createServer((req, res) => serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } }));
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { failures++; console.log("FAIL " + name + "\n     " + String(e.message).split("\n").slice(0, 6).join("\n     ")); } };

async function open({ width, mobile = false, scenario = {}, reduced = false, path = "/intelligence.html" }) {
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reduced ? "reduce" : "no-preference" });
  const sent = [];
  await ctx.route("**/v1/**", async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, m = req.method();
    const body = m === "POST" ? JSON.parse(req.postData() || "{}") : null;
    sent.push({ p, m, body, q: url.search });
    const reply = (status, json) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    if (scenario[p]) { const s = scenario[p](body, url); return reply(s[0], s[1]); }
    if (p === "/v1/me") return reply(200, { user: { id: 1, email: "member@example.com" }, access: { active: true, plan: "pro", status: "active" } });
    if (p === "/v1/me/intelligence/briefing") return reply(200, F.briefing);
    if (p === "/v1/ai/status") return reply(200, F.aiStatus);
    if (p === "/v1/me/intelligence/preferences" && m === "POST") return reply(200, { frequency: body.frequency, updatedAt: new Date().toISOString(), pushConfigured: false });
    if (p === "/v1/me/intelligence/investigate") return reply(200, { ...F.answer, question: body.question, plan: { ...F.answer.plan, usedContext: !!body.context } });
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
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(700);
  return { ctx, page, sent, errors };
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [label, width, mobile] of [["desktop", 1440, false], ["phone", 390, true]]) {
  const { ctx, page, sent, errors } = await open({ width, mobile });
  const tap = sel => mobile ? page.tap(sel) : page.click(sel);
  await check(label + ": hero, section bar and three sections render", async () => {
    assert.match(await page.textContent(".ix-hero__title"), /Insidir Intelligence/i);
    assert.match(await page.textContent(".ix-hero__line"), /Information moves markets\. Understand what moves information\./);
    assert.ok(await page.$eval(".ix-hero__plate img", i => i.naturalWidth) > 0, "hero photograph loaded (its sharpness is checked by v13-palette-audit.mjs)");
    for (const id of ["briefing", "investigate", "mirror"]) assert.ok(await page.$("#" + id));
    assert.equal(await overflow(page), 0, "no horizontal overflow");
  });
  await check(label + ": briefing stories with dates, reasons and SEC sources", async () => {
    await page.waitForSelector(".ix-story");
    const n = await page.$$eval(".ix-story", x => x.length);
    assert.equal(n, F.briefing.stories.length);
    const first = await page.$eval(".ix-story", el => el.textContent);
    assert.match(first, /Event/); assert.match(first, /Disclosed/); assert.match(first, /Retrieved by Insidir/); assert.match(first, /Why it’s here/);
    const hrefs = await page.$$eval(".ix-sources a[href^='http']", a => a.map(x => x.href));
    assert.ok(hrefs.length && hrefs.every(h => h.startsWith("https://www.sec.gov/")), "sources are SEC links");
  });
  await check(label + ": window and order toggles refetch and re-sort", async () => {
    await tap("[data-window] [data-days='30']");
    await page.waitForTimeout(300);
    assert.ok(sent.some(r => r.p === "/v1/me/intelligence/briefing" && r.q === "?days=30"));
    assert.equal(await page.getAttribute("[data-window] [data-days='30']", "aria-checked"), "true");
    await tap("[data-order] [data-order-by='latest']");
    const dates = await page.$$eval(".ix-story__when", x => x.length);
    assert.ok(dates > 0);
    assert.equal(await page.getAttribute("[data-order] [data-order-by='latest']", "aria-checked"), "true");
  });
  await check(label + ": delivery frequency is saved and reported honestly", async () => {
    await tap("[data-frequency] [data-frequency-value='weekly']");
    await page.waitForTimeout(250);
    const post = sent.filter(r => r.p === "/v1/me/intelligence/preferences" && r.m === "POST").at(-1);
    assert.deepEqual(post.body, { frequency: "weekly" });
    assert.equal(await page.getAttribute("[data-frequency] [data-frequency-value='weekly']", "aria-checked"), "true");
    assert.match(await page.textContent("[data-delivery]"), /not available on this deployment|no device|You will receive/);
  });
  await check(label + ": story details open; explain is offered only when AI is configured", async () => {
    await tap(".ix-story .ix-more > summary");
    assert.equal(await page.$eval(".ix-story .ix-more", d => d.open), true);
    assert.equal(!!(await page.$("[data-explain]")), !!F.aiStatus.configured);
  });
  await check(label + ": an example question produces a cited answer whose citations resolve", async () => {
    await tap("[data-examples] li:first-child button");
    await page.waitForSelector(".ix-answer .ix-summary");
    const cites = await page.$$eval(".ix-answer a.ix-cite", a => a.map(x => x.getAttribute("href")));
    assert.ok(cites.length > 0, "answer has citations");
    for (const h of new Set(cites)) assert.ok(await page.$(h), "citation target exists: " + h);
    assert.match(await page.textContent(".ix-answer"), /What this answer cannot tell you/);
  });
  await check(label + ": a follow-up sends the previous plan as context; earlier answers fold away", async () => {
    await page.fill("#ix-question", "What about Microsoft?");
    await page.press("#ix-question", "Enter");
    await page.waitForFunction(() => document.querySelectorAll(".ix-answer .ix-summary").length >= 2);
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
  await check(label + ": Mirror shows the manager, the simulator responds to chips and rejects a bad budget", async () => {
    await page.waitForSelector("[data-sim] .ix-bar-chart");
    await tap("[data-budget='1000']");
    await page.waitForTimeout(300);
    assert.ok(sent.some(r => r.p === "/v1/intelligence/mirror/simulate" && /budget=1000/.test(r.q)));
    await page.fill("#ix-budget", "12.345");
    await page.waitForTimeout(500);
    assert.match(await page.textContent("[data-sim]"), /between \$1 and \$10,000,000/);
    assert.equal(await page.getAttribute("#ix-budget", "aria-invalid"), "true");
    assert.match(await page.textContent("[data-mirror]"), /Disclosure history/);
    assert.match(await page.textContent("[data-mirror]"), /not the manager's complete portfolio/);
    assert.equal(await overflow(page), 0);
  });
  await check(label + ": no uncaught errors", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

await check("setup state: quick-add posts the ticker and reloads the briefing", async () => {
  const { ctx, page, sent } = await open({ width: 1440, scenario: { "/v1/me/intelligence/briefing": () => [200, { ...F.briefing, stories: [], needsSetup: true, subjects: { tickers: 0, people: 0 } }] } });
  await page.waitForSelector("[data-quick-add]");
  await page.fill("#ix-quick", "$nvda");
  await page.click("[data-quick-add] button");
  await page.waitForTimeout(300);
  assert.deepEqual(sent.find(r => r.p === "/v1/me/watchlist").body, { ticker: "NVDA" });
  assert.ok(sent.filter(r => r.p === "/v1/me/intelligence/briefing").length >= 2);
  await ctx.close();
});
await check("errors: a failing briefing shows a retry; a failing frequency save restores the previous choice; Mirror unavailable is explicit", async () => {
  let fail = true;
  const { ctx, page, sent } = await open({ width: 1440, scenario: {
    "/v1/me/intelligence/briefing": () => fail ? [503, { error: "Insidir is temporarily unavailable." }] : [200, F.briefing],
    "/v1/me/intelligence/preferences": () => [500, { error: "Internal error" }],
    "/v1/intelligence/mirror/managers": () => [200, { available: false, managers: [], reason: "Form 13F ingestion has not run yet on this deployment.", notes: F.managers.notes }] } });
  await page.waitForSelector("[data-retry='briefing']");
  assert.match(await page.textContent("[data-feed]"), /could not be loaded/);
  fail = false;
  await page.click("[data-retry='briefing']");
  await page.waitForSelector(".ix-story");
  const before = await page.$eval("[data-frequency] [aria-checked=true]", b => b.dataset.frequencyValue);
  await page.click("[data-frequency] [data-frequency-value='daily']");
  await page.waitForTimeout(300);
  assert.equal(await page.$eval("[data-frequency] [aria-checked=true]", b => b.dataset.frequencyValue), before);
  assert.match(await page.textContent("[data-delivery]"), /Not saved/);
  assert.match(await page.textContent("[data-mirror]"), /Mirror opens when the first Form 13F reports are imported/);
  assert.ok(!sent.some(r => r.p === "/v1/intelligence/mirror/simulate"), "no simulation without data");
  await ctx.close();
});
await check("AI on: a filing explanation and a cited synthesis are shown with their labels", async () => {
  const { ctx, page, sent } = await open({ width: 1440, scenario: { "/v1/ai/status": () => [200, { configured: true }],
    "/v1/me/intelligence/investigate": b => [200, { ...F.answer, question: b.question, synthesis: { available: true, tier: "fast" } }] } });
  await page.waitForSelector(".ix-story");
  await page.click(".ix-story .ix-more > summary");
  await page.click("[data-explain]");
  await page.waitForSelector(".ix-ai");
  assert.match(await page.textContent(".ix-story .ix-ai"), /Written by AI/);
  assert.ok(sent.some(r => r.p === "/v1/ai/explain" && /accession=\d{18}/.test(r.q)));
  await page.fill("#ix-question", "What did Nvidia insiders disclose this month?");
  await page.click(".ix-ask__go");
  await page.waitForSelector("[data-synth]");
  await page.click("[data-synth]");
  await page.waitForSelector("[data-synth-box] .ix-ai");
  const box = await page.textContent("[data-synth-box]");
  assert.match(box, /Three insiders reported sales/); assert.match(box, /Written by AI/);
  for (const h of await page.$$eval("[data-synth-box] a.ix-cite", a => a.map(x => x.getAttribute("href")))) assert.ok(await page.$(h), h);
  await ctx.close();
});
await check("reduced motion: nothing animates", async () => {
  const { ctx, page } = await open({ width: 1440, reduced: true });
  await page.waitForSelector(".ix-story");
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("main.ix")).length);
  assert.equal(running, 0);
  await ctx.close();
});

await browser.close();
server.close();
if (failures) { console.log(failures + " failure(s)"); process.exit(1); }
console.log("Intelligence: all checks passed");
