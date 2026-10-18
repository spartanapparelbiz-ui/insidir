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

test("the landing page tours the product in four clips, each shipped as MP4, WebM and a poster", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/")).text();
    assert.match(home, /data-tour/);
    assert.match(home, /v14-home\.css/);
    assert.match(home, /v14-tour\.js/);
    const steps = [...home.matchAll(/class="lp-tour__step" role="tab"[^>]*data-video="([^"]+)"[^>]*data-poster="([^"]+)"/g)];
    assert.equal(steps.length, 4, "four steps");
    assert.equal((home.match(/aria-selected="true"/g) || []).length, 1, "one step selected");
    for (const [i, name] of CLIPS.entries()) {
      assert.equal(steps[i][1], "assets/video/insidir-" + name);
      for (const ext of [".mp4", ".webm", ".jpg"]) {
        const r = await fetch(base + "/assets/video/insidir-" + name + ext, { method: "HEAD" });
        assert.equal(r.status, 200, name + ext);
        assert.match(r.headers.get("content-type"), ext === ".jpg" ? /image\/jpeg/ : ext === ".mp4" ? /video\/mp4/ : /video\/webm/);
        if (ext !== ".jpg") assert.ok(Number(r.headers.get("content-length")) < 1_500_000, name + ext + " stays small");
      }
    }
    // Without the script the first clip still plays: a plain <video controls> with both formats.
    assert.match(home, /<video class="lp-tour__video"[^>]*muted playsinline[^>]*controls[^>]*><source src="assets\/video\/insidir-search\.mp4" type="video\/mp4"><source src="assets\/video\/insidir-search\.webm" type="video\/webm"><\/video>/);
    const js = await (await fetch(base + "/assets/js/v14-tour.js")).text();
    assert.match(js, /prefers-reduced-motion: reduce/, "nothing plays by itself with reduced motion");
    assert.match(js, /IntersectionObserver/, "plays only while on screen");
    assert.doesNotMatch(js, /fetch\(/, "the tour fetches no data");
  });
});

test("the landing page offers the paid trial and links the free public insider pages", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/")).text();
    assert.match(home, /<span class="lp-terms__price"><b>\$39<\/b> a month<\/span><span><b>\$1<\/b> for your first 3 days<\/span>/, "the monthly price leads, the trial follows");
    assert.match(home, /After the 3-day trial, \$39 is charged every month/);
    assert.match(home, /Start your 3-day trial/);
    assert.match(home, /<p class="lp-plan__amount">\$39<span>\/ month<\/span><\/p>\s*<p class="lp-plan__trial"><b>\$1<\/b> for your first 3 days<\/p>/);
    assert.doesNotMatch(home, /no free trial/i);
    assert.match(home, /href="\/insider-trading"/);
    assert.match(home, /Know what moves/);
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
