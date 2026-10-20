import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

/* The platform page's demo report is a saved real report, not invented data: its figures must agree with each other,
 * it must say it is a delayed snapshot, and the no-script first paint must be exactly what the page script draws. */
const html = readFileSync(new URL("../web/platform.html", import.meta.url), "utf8");
const sandbox = { module: { exports: {} } };
runInNewContext(readFileSync(new URL("../web/assets/js/v16-demo-chart.js", import.meta.url), "utf8"), sandbox);
const chart = sandbox.module.exports;
const data = JSON.parse(html.match(/<script type="application\/json" id="mk-demo-data">([\s\S]*?)<\/script>/)[1]);

test("the demo snapshot is internally consistent and every range ends on the quoted close", () => {
  assert.deepEqual(Object.keys(data.ranges), ["1D", "1W", "1M", "3M", "1Y", "5Y"]);
  assert.equal(data.ticker, "RDDT");
  assert.match(data.source, /delayed/i);
  for (const [range, s] of Object.entries(data.ranges)) {
    assert.ok(s.points.length > 20, range + " has a real series");
    assert.ok(s.points.every(([t, v], i) => Number.isFinite(v) && v > 0 && (i === 0 || t > s.points[i - 1][0])), range + " points are ordered and positive");
    assert.equal(s.points.at(-1)[1], 156.14, range + " ends on the quoted close");
    assert.ok(Math.abs(s.points.at(-1)[1] - s.change - s.points[0][1]) < 0.02 || range === "1D", range + " change matches its first and last points");
  }
  const day = data.ranges["1D"];
  assert.equal(+(156.14 - day.previousClose).toFixed(2), day.change, "the day change is the close minus the previous close");
  assert.match(html, /\$156\.14<span class="mk-demo__day is-down">&#9660; &minus;3\.22 \(&minus;2\.02%\)/);
  // Market cap and P/E follow from the price, the implied share count and TTM net income stated beside them.
  assert.match(html, /<dt>Market cap<\/dt><dd>\$31\.6B<\/dd>/);
  assert.equal((156.14 * 202580233 / 1e9).toFixed(1), "31.6");
  assert.equal((156.14 / (871095000 / 202580233)).toFixed(1), "36.3");
});

test("the demo says what it is, and its first paint is the script's own 1Y render", () => {
  assert.match(html, /A snapshot, not live, and not a recommendation\./);
  const svg = chart.render("1Y", data.ranges["1Y"], 720, 240);
  assert.ok(html.includes("<!-- demo-svg -->" + svg + "<!-- /demo-svg -->"), "run node scripts/build-demo-chart.mjs");
  assert.match(svg, /mk-demo__svg--down/, "1Y fell, so the line is drawn in the down colour");
  assert.equal(chart.changeText("5Y", data.ranges["5Y"]), "▲ +110.14 (+239.44%) since listing");
  assert.deepEqual([...chart.ticks(120, 270, 4)], [150, 200, 250]);
});

test("the demo's logo and people are the real ones, each with their SEC account and photo credit", () => {
  assert.match(html, /<img src="assets\/img\/logos\/rddt\.png"[^>]*alt="Reddit logo"/);
  for (const [name, cik] of [["Steve Huffman", "0001827011"], ["Jennifer Wong", "0001663651"]]) {
    assert.match(html, new RegExp('alt="' + name + '"'), name + " has a photo");
    assert.match(html, new RegExp("own-disp\\?action=getowner&amp;CIK=" + cik), name + " links to their SEC filer record");
  }
  assert.match(html, /Steve Huffman by Cody Glenn\/Web Summit via Sportsfile, CC BY 2\.0/);
  assert.doesNotMatch(html, /Farrell/, "no person whose only portrait is an illustration");
});
