import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic, parseRange } from "../src/web.mjs";

/* The recorded product clips (the creator kit links them) and the byte-range video delivery they need on Safari and
 * iOS. The landing page itself is tested in test/landing.test.mjs. */
async function withServer(fn) {
  const server = createServer((req, res) => serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end(); } }));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await fn("http://127.0.0.1:" + server.address().port); } finally { server.close(); }
}
const CLIPS = ["search", "insiders", "people", "follow"];

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

