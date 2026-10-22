/* Writes the no-script first paint of the platform page's demo report: the 1Y chart, rendered by the same code the
   page runs (web/assets/js/v16-demo-chart.js) from the snapshot embedded in the page (#mk-demo-data), between the
   <!-- demo-svg --> markers; and the same 1Y chart, smaller, into the landing page's "Real records, charted" section
   between the <!-- landing-chart --> markers. Run after changing the snapshot:  node scripts/build-demo-chart.mjs */
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

// The landing page's copy: one id per page, so the gradient is renamed for it.
const landing = new URL("../web/index.html", import.meta.url);
const home = readFileSync(landing, "utf8");
const small = chart.render("1Y", data.ranges["1Y"], 560, 200).replaceAll("mk-demo-fill", "px-spark-fill");
const homeOut = home.replace(/<!-- landing-chart -->[\s\S]*?<!-- \/landing-chart -->/, () => "<!-- landing-chart -->" + small + "<!-- /landing-chart -->");
if (homeOut === home && !home.includes(small)) throw new Error("no <!-- landing-chart --> markers in index.html");
writeFileSync(landing, homeOut);
console.log("landing chart written:", small.length, "bytes");
