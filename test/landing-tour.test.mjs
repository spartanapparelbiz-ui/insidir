import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic, parseRange } from "../src/web.mjs";

/* The V14 landing page: the product tour (four recorded clips), the link to the free public insider
 * pages, the paid-trial offer, and the byte-range video delivery the clips need on Safari and iOS. */
async function withServer(fn) {
  const server = createServer((req, res) => serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } }));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await fn("http://127.0.0.1:" + server.address().port); } finally { server.close(); }
}
const CLIPS = ["search", "insiders", "people", "follow"];

test("the landing page shows the system: four stages, five capabilities, the product in motion, sources and pricing", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/")).text();
    const stages = [...home.matchAll(/data-stage-go="\d"><b class="sx-stage-label">(Monitor|Process|Interpret|Notify)<\/b>/g)].map(m => m[1]);
    assert.deepEqual(stages, ["Monitor", "Process", "Interpret", "Notify"], "the four stages, in order");
    for (const cap of ["Intelligence", "Monitoring", "Investigations", "Ownership Intelligence", "Alerts"]) assert.match(home, new RegExp("<h3>" + cap + "</h3>"), cap);
    assert.match(home, /data-system/);
    assert.match(home, /Illustrative sequence built from real SEC filings/, "the system figure says what it is");
    for (const src of ["SEC EDGAR", "Form 4", "Form 13F"]) assert.match(home, new RegExp('<th scope="row">' + src + "</th>"), src);
    assert.match(home, /not affiliated with the SEC/i);
    const js = await (await fetch(base + "/assets/js/v32-system.js")).text();
    assert.match(js, /prefers-reduced-motion: reduce/, "nothing moves with reduced motion");
    assert.match(js, /IntersectionObserver/, "moves only while on screen");
    assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon/, "the system figure reads nothing from the network");
    // The product clips are still served (the creator kit links them).
    for (const name of CLIPS) assert.equal((await fetch(base + "/assets/video/insidir-" + name + ".mp4", { method: "HEAD" })).status, 200, name);
  });
});

test("the landing page offers the paid trial and links the free public insider pages", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/")).text();
    assert.match(home, /<span class="lp-deal"><b>3 days<\/b> for \$1<\/span><span class="lp-terms__price">Then <b>\$39<\/b>\/month<\/span><span>Cancel online<\/span>/, "the offer sits under the first button with the monthly price and online cancellation beside it");
    assert.match(home, /After the 3-day trial, \$39 is charged every month/);
    assert.match(home, /Start 3 days for \$1/);
    assert.match(home, /<p class="lp-plan__amount">\$39<span>\/ month<\/span><\/p>\s*<p class="lp-plan__trial"><span>Offer<\/span><b>\$1<\/b> for your first 3 days<\/p>/);
    assert.doesNotMatch(home, /no free trial/i);
    assert.match(home, /href="\/insider-trading"/);
    assert.match(home, /Financial intelligence\.<br><em>Connected\.<\/em>/);
    assert.match(home, /Financial intelligence\.<br><em>Without the complexity\.<\/em>/);
    assert.match(home, /Understand companies, uncover relationships, and track what changes\. Automatically\./);
    const pricing = await (await fetch(base + "/pricing.html")).text();
    assert.match(pricing, /3 days for \$1/);
    assert.doesNotMatch(pricing, /no free trial/i);
    const terms = await (await fetch(base + "/terms.html")).text();
    assert.match(terms, /3-day trial for \$1/);
    assert.match(terms, /If you cancel before the trial ends, you are not charged again/);
  });
});

test("video is served by byte range", async () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=0-5000", 1000), { start: 0, end: 999 });
  assert.equal(parseRange("bytes=1000-", 1000), false);
  assert.equal(parseRange("bytes=5-1", 1000), false);
  assert.equal(parseRange(undefined, 1000), null);
  assert.equal(parseRange("bytes=0-1,5-9", 1000), null, "multiple ranges get the whole file");
  await withServer(async base => {
    const url = base + "/assets/video/insidir-search.mp4";
    const part = await fetch(url, { headers: { Range: "bytes=0-99" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("accept-ranges"), "bytes");
    assert.match(part.headers.get("content-range"), /^bytes 0-99\/\d+$/);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    const whole = await fetch(url);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get("accept-ranges"), "bytes");
    assert.equal((await whole.arrayBuffer()).byteLength, Number(whole.headers.get("content-length")));
    const bad = await fetch(url, { headers: { Range: "bytes=99999999-" } });
    assert.equal(bad.status, 416);
  });
});

test("the product-in-motion section is a static, labelled example: four steps, no data fetched, nothing plays under reduced motion", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/")).text();
    const tabs = [...home.matchAll(/class="ax-flow__step" role="tab" id="ax-tab-(\d)"[^>]*aria-controls="ax-step-\1"/g)];
    assert.equal(tabs.length, 4, "four steps");
    for (const verb of ["Filed", "Indexed", "Matched", "Evidence"]) assert.match(home, new RegExp('<span class="ax-flow__verb">' + verb + "</span>"));
    for (let i = 1; i <= 4; i++) assert.match(home, new RegExp('id="ax-step-' + i + '" role="tabpanel" aria-labelledby="ax-tab-' + i + '"'));
    assert.match(home, /A real filing; not live data/, "the example says it is not live");
    assert.match(home, /data and notifications can be delayed/);
    assert.match(home, /0001061272-26-000004/, "the example names the real SEC filing it is built from");
    const js = await (await fetch(base + "/assets/js/v31-flow.js")).text();
    assert.match(js, /prefers-reduced-motion: reduce/);
    assert.match(js, /IntersectionObserver/);
    assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon/, "the workflow reads nothing from the network");
    // The headline experiment: two named arms, assigned before paint and reported by funnel.js.
    assert.match(home, /insidir:exp:headline/);
    assert.match(home, /data-exp-headline/);
    assert.doesNotMatch(home, /insidir:exp:hero"/);
    assert.match(home, /"organized"&&v!=="disclosure"/, "the two headline arms");
  });
});
