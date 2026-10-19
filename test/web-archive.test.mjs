import test from "node:test";
import assert from "node:assert/strict";
import { timestampDate, pickSnapshot, rewriteImages, archivedPage, isArchiveUrl, rawSnapshotUrl, archivedImageUrl } from "../src/web-archive.mjs";

const NOW = Date.UTC(2026, 9, 19);
const snap = (url, timestamp, extra = {}) => ({ archived_snapshots: { closest: { available: true, status: "200", timestamp, url: "http://web.archive.org/web/" + timestamp + "/" + url, ...extra } } });

test("timestamps and archive URLs", () => {
  assert.equal(timestampDate("20260412093011").toISOString(), "2026-04-12T09:30:11.000Z");
  assert.equal(timestampDate("20260412").toISOString(), "2026-04-12T00:00:00.000Z");
  assert.equal(timestampDate("nope"), null);
  assert.equal(rawSnapshotUrl("20260412", "https://x.com/a"), "https://web.archive.org/web/20260412id_/https://x.com/a");
  assert.equal(archivedImageUrl("20260412", "https://x.com/a.jpg"), "https://web.archive.org/web/20260412im_/https://x.com/a.jpg");
  assert.equal(isArchiveUrl("https://web.archive.org/web/1im_/https://x.com/a.jpg"), true);
  assert.equal(isArchiveUrl("https://x.com/a.jpg"), false);
});

test("pickSnapshot: a recent 200 copy of exactly this page", () => {
  const url = "https://www.walled.com/leadership";
  assert.deepEqual(pickSnapshot(snap(url, "20260901120000"), url, NOW), { timestamp: "20260901120000", date: "2026-09-01" });
  assert.ok(pickSnapshot(snap("walled.com/leadership/", "20260901120000"), url, NOW), "scheme, www and trailing slash do not matter");
  assert.equal(pickSnapshot(snap(url, "20240101000000"), url, NOW), null, "older than 18 months");
  assert.equal(pickSnapshot(snap(url, "20270101000000"), url, NOW), null, "in the future");
  assert.equal(pickSnapshot(snap("https://www.walled.com/", "20260901120000"), url, NOW), null, "another page");
  assert.equal(pickSnapshot(snap(url, "20260901120000", { status: "302" }), url, NOW), null);
  assert.equal(pickSnapshot(snap(url, "20260901120000", { available: false }), url, NOW), null);
  assert.equal(pickSnapshot({ archived_snapshots: {} }, url, NOW), null);
});

test("rewriteImages: every picture points at its archived copy, nothing at the live site", () => {
  const html = `<img src="/p/a.jpg"><img data-src="b.jpg" src="data:image/gif;base64,R0"><img srcset="/p/c.jpg 1x, /p/c@2x.jpg 2x">
    <meta property="og:image" content="https://cdn.walled.com/og.jpg"><div style="background-image:url('/p/d.jpg')"></div>`;
  const out = rewriteImages(html, "https://www.walled.com/team/", "20260901");
  const A = "https://web.archive.org/web/20260901im_/";
  assert.ok(out.includes(`src="${A}https://www.walled.com/p/a.jpg"`));
  assert.ok(out.includes(`data-src="${A}https://www.walled.com/team/b.jpg"`));
  assert.ok(out.includes(`src="data:image/gif;base64,R0"`), "inline images stay");
  assert.ok(out.includes(`srcset="${A}https://www.walled.com/p/c.jpg 1x, ${A}https://www.walled.com/p/c@2x.jpg 2x"`));
  assert.ok(out.includes(`content="${A}https://cdn.walled.com/og.jpg"`));
  assert.ok(out.includes(`url('${A}https://www.walled.com/p/d.jpg')`));
});

test("archivedPage: availability lookup, raw snapshot, rewritten pictures; null without a usable copy", async () => {
  const url = "https://www.walled.com/leadership";
  const asked = [];
  const deps = {
    now: NOW,
    archiveJson: async u => { asked.push(u); return snap(url, "20260901120000"); },
    archiveText: async u => { asked.push(u); return `<img src="/p/tim.jpg">`; }
  };
  const r = await archivedPage(url, deps);
  assert.equal(r.status, "ok");
  assert.equal(r.url, url, "the page keeps its own address");
  assert.equal(r.html, `<img src="https://web.archive.org/web/20260901120000im_/https://www.walled.com/p/tim.jpg">`);
  assert.deepEqual(r.archived, { timestamp: "20260901120000", date: "2026-09-01", snapshot: "https://web.archive.org/web/20260901120000/" + url });
  assert.ok(asked[0].startsWith("https://archive.org/wayback/available?url=" + encodeURIComponent(url) + "&timestamp=20261019"));
  assert.equal(asked[1], "https://web.archive.org/web/20260901120000id_/" + url);

  assert.equal(await archivedPage(url, { ...deps, archiveJson: async () => snap(url, "20230101000000") }), null);
  assert.equal(await archivedPage(url, { ...deps, archiveJson: async () => { throw new Error("429"); } }), null);
  assert.equal(await archivedPage(url, { ...deps, archiveText: async () => { throw new Error("403"); } }), null);
  assert.equal(await archivedPage(url, { ...deps, archiveText: async () => null }), null);
});
