/* Writes the no-script first paint of the platform page's demo report: the 1Y chart, rendered by the same code the
   page runs (web/assets/js/v16-demo-chart.js) from the snapshot embedded in the page (#mk-demo-data), between the
   <!-- demo-svg --> markers; and the same 1Y snapshot as the landing page's price chart (with the points its hover
   readout reads) between the <!-- landing-chart --> markers. Run after changing the snapshot:  node scripts/build-demo-chart.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// The page script is a classic script; run it with a CommonJS-style `module` so it hands back its API.
const sandbox = { module: { exports: {} } };
runInNewContext(readFileSync(new URL("../web/assets/js/v16-demo-chart.js", import.meta.url), "utf8"), sandbox);
const chart = sandbox.module.exports;
const page = new URL("../web/platform.html", import.meta.url);
const html = readFileSync(page, "utf8");
const json = html.match(/<script type="application\/json" id="mk-demo-data">([\s\S]*?)<\/script>/);
if (!json) throw new Error("platform.html has no #mk-demo-data snapshot");
const data = JSON.parse(json[1]);
const svg = chart.render("1Y", data.ranges["1Y"], 720, 240);
const out = html.replace(/<!-- demo-svg -->[\s\S]*?<!-- \/demo-svg -->/, () => "<!-- demo-svg -->" + svg + "<!-- /demo-svg -->");
if (out === html && !html.includes(svg)) throw new Error("no <!-- demo-svg --> markers in platform.html");
writeFileSync(page, out);
console.log("demo chart first paint written:", svg.length, "bytes");

// The landing page's price chart: the same 1Y snapshot, drawn as a full instrument (axis, grid, the price a year
// ago, the year's high and low, the last price on the axis), plus the points the page's hover readout reads
// (web/assets/js/v35-charts.js). Plain SVG at a fixed viewBox; colours come from the page's stylesheet.
const W = 720, H = 380, L = 8, R = 62, T = 30, B = 30, PW = W - L - R, PH = H - T - B;
const pts = data.ranges["1Y"].points, t0 = pts[0][0], t1 = pts.at(-1)[0];
let hi = pts[0], lo = pts[0];
for (const q of pts) { if (q[1] > hi[1]) hi = q; if (q[1] < lo[1]) lo = q; }
const step = 50, y0 = Math.floor(lo[1] / 25) * 25, y1 = Math.ceil(hi[1] / 25) * 25;
const X = t => L + (t - t0) / (t1 - t0) * PW, Y = v => T + (1 - (v - y0) / (y1 - y0)) * PH, f = n => n.toFixed(1);
const usd = v => "$" + v.toFixed(2), MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = t => { const d = new Date(t); return MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
const line = pts.map((q, i) => (i ? "L" : "M") + f(X(q[0])) + " " + f(Y(q[1]))).join("");
const area = line + "L" + f(X(t1)) + " " + f(T + PH) + "L" + f(X(t0)) + " " + f(T + PH) + "Z";
const grid = [];
// A tick label the last-price tag would cover is left out (the gridline stays).
for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) grid.push(`<line class="px-g" x1="${L}" x2="${L + PW}" y1="${f(Y(v))}" y2="${f(Y(v))}"/>` + (Math.abs(Y(v) - Y(pts.at(-1)[1])) < 16 ? "" : `<text class="px-yl" x="${L + PW + 10}" y="${f(Y(v))}" dy=".35em">$${v}</text>`));
const months = [];
for (let d = new Date(Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth() + 1, 1)); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 2)) {
  const x = X(d.getTime()), m = d.getUTCMonth();
  months.push(`<line class="px-tick" x1="${f(x)}" x2="${f(x)}" y1="${T + PH}" y2="${T + PH + 5}"/><text class="px-xl" x="${f(x)}" y="${H - 8}" text-anchor="middle">${MON[m]}${m === 0 ? " '" + String(d.getUTCFullYear()).slice(2) : ""}</text>`);
}
const first = pts[0][1], last = pts.at(-1)[1], dir = last >= first ? "up" : "down";
const note = (q, above, text) => { const x = X(q[0]), y = Y(q[1]), ty = above ? y - 12 : y + 20, anchor = x < L + 120 ? "start" : x > L + PW - 120 ? "end" : "middle";
  return `<circle class="px-mark" cx="${f(x)}" cy="${f(y)}" r="3.5"/><text class="px-note" x="${f(x)}" y="${f(ty)}" text-anchor="${anchor}">${text}</text>`; };
const priceSvg = `<svg class="px-price__svg px-price__svg--${dir}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`
  + `<defs><linearGradient id="px-price-fill" x1="0" y1="0" x2="0" y2="1"><stop class="px-stop-a" offset="0"/><stop class="px-stop-b" offset="1"/></linearGradient></defs>`
  + grid.join("") + `<line class="px-axis" x1="${L}" x2="${L + PW}" y1="${T + PH}" y2="${T + PH}"/>` + months.join("")
  + `<line class="px-ref" x1="${L}" x2="${L + PW}" y1="${f(Y(first))}" y2="${f(Y(first))}"/><text class="px-ref-l" x="${L + PW - 6}" y="${f(Y(first) - 8)}" text-anchor="end">1Y ago ${usd(first)}</text>`
  + `<path class="px-area" d="${area}" fill="url(#px-price-fill)"/><path class="px-line" d="${line}"/>`
  + note(hi, true, "High " + usd(hi[1]) + " · " + day(hi[0])) + note(lo, false, "Low " + usd(lo[1]) + " · " + day(lo[0]))
  + `<line class="px-last-rule" x1="${f(X(t1))}" x2="${L + PW + 4}" y1="${f(Y(last))}" y2="${f(Y(last))}"/>`
  + `<circle class="px-end-ring" cx="${f(X(t1))}" cy="${f(Y(last))}" r="7"/><circle class="px-end" cx="${f(X(t1))}" cy="${f(Y(last))}" r="3.5"/>`
  + `<rect class="px-last-tag" x="${L + PW + 4}" y="${f(Y(last) - 10)}" width="${R - 6}" height="20" rx="2"/><text class="px-last-t" x="${L + PW + 4 + (R - 6) / 2}" y="${f(Y(last))}" dy=".35em" text-anchor="middle">${last.toFixed(2)}</text>`
  + `<g class="px-cross" hidden><line class="px-cross-x" x1="0" x2="0" y1="${T}" y2="${T + PH}"/><line class="px-cross-y" x1="${L}" x2="${L + PW}" y1="0" y2="0"/><circle class="px-cross-dot" r="4.5"/></g>`
  + `</svg>`;
const frame = { w: W, h: H, l: L, r: R, t: T, b: B, t0, t1, y0, y1, points: pts.map(q => [Math.round((q[0] - t0) / 1000), q[1]]) };
const block = priceSvg + `<script type="application/json" class="px-price__data">${JSON.stringify(frame)}</script>`;
const landing = new URL("../web/index.html", import.meta.url);
const home = readFileSync(landing, "utf8");
const homeOut = home.replace(/<!-- landing-chart -->[\s\S]*?<!-- \/landing-chart -->/, () => "<!-- landing-chart -->" + block + "<!-- /landing-chart -->");
if (homeOut === home && !home.includes(block)) throw new Error("no <!-- landing-chart --> markers in index.html");
writeFileSync(landing, homeOut);
console.log("landing chart written:", block.length, "bytes; high", hi[1], day(hi[0]), "low", lo[1], day(lo[0]));
