import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, readdir } from "node:fs/promises";

// The site holds still: nothing moves under the pointer, on a click or with a scroll, and hover states change
// colour only. The dotted wordmark is the one thing that answers the pointer, gently. Public pages keep a quiet
// fade-up reveal; product pages hold nothing back. These tests pin that.
const web = new URL("../web/", import.meta.url);
const engine = await readFile(new URL("assets/js/v13-halftone.js", web), "utf8");
const motion = await readFile(new URL("assets/js/v13-motion.js", web), "utf8");
const theme = await readFile(new URL("assets/css/v13-halftone.css", web), "utf8");
const cssDir = new URL("assets/css/", web);

function sandbox(bodyClasses = []) {
  const media = () => ({ matches: false, addEventListener() {} });
  const listeners = [];
  const window = { matchMedia: media, addEventListener(type) { listeners.push("window:" + type); }, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, scrollTo() {}, devicePixelRatio: 1, scrollX: 0, scrollY: 0, innerWidth: 1440, innerHeight: 900 };
  const document = { readyState: "complete", querySelectorAll: () => [], addEventListener(type) { listeners.push("document:" + type); },
    body: { classList: { contains: c => bodyClasses.includes(c) } }, documentElement: { scrollHeight: 2000 } };
  const context = { window, document, performance: { now: () => 0 }, console, getComputedStyle: () => ({ position: "static", display: "block" }), setTimeout, clearTimeout, listeners };
  vm.createContext(context);
  return context;
}
const plain = v => JSON.parse(JSON.stringify(v));

test("the wordmark's physics are gentle: a dot moves about 12px at most and nothing trails a scroll", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  const H = ctx.window.InsidirHalftone;
  assert.deepEqual(plain(H.PHYSICS), { push: 1, spring: 0.08, damping: 0.8, ringSpeed: 0.9, ringBand: 22, ringForce: 1.1, ringLife: 650, drag: 0.015, scroll: 0 });
  assert.ok(Object.isFrozen(H.PHYSICS));
  assert.ok(H.PHYSICS.push / H.PHYSICS.spring <= 15, "a steady push holds a dot at most ~12px from home");
  assert.equal(H.PHYSICS.scroll, 0, "nothing lags behind a scroll");
  // A dot one pixel from home with no pointer: v = (0 + (0 - 1)·0.08)·0.8 = −0.064.
  const [x, , vx] = plain(H.step(1, 0, 0, 0, 0, 0, -1e5, -1e5, 80));
  assert.ok(Math.abs(vx + 0.064) < 1e-12 && Math.abs(x - 0.936) < 1e-12);
  assert.doesNotMatch(engine.replace(/const PHYSICS = Object\.freeze\(\{[^}]*\}\);/, ""), /\b(0\.08|0\.015|650)\b/, "no physics number is repeated outside PHYSICS");
});

test("only a word answers the pointer; plain dot fields are still print texture", () => {
  assert.match(engine, /interactive: d\.interactive \? d\.interactive !== "false" : \(d\.mode \|\| \(field \? "field" : "word"\)\) === "word"/);
  const index = engine.indexOf("function readOptions");
  assert.ok(index > 0);
});

test("the site motion layer moves nothing: no pointer, click or scroll physics, only the reveal", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  vm.runInContext(motion, ctx);
  const M = ctx.window.InsidirMotion;
  assert.equal(typeof M.revealAll, "function", "tools can show every pending block");
  assert.equal(M.pending, 0);
  for (const gone of ["PHYSICS", "ATOM_SCALE", "RING_SCALE", "SCROLL_SCALE", "RADIUS"]) assert.equal(M[gone], undefined, gone + " is gone");
  assert.ok(!ctx.listeners.some(l => /pointer|mouse|click/.test(l)), "no pointer listener: " + ctx.listeners.join(", "));
  assert.doesNotMatch(motion, /--hf-dx|--hf-dy|--hf-s\b|requestAnimationFrame\(frame\)|\.ring\(|\.kick\(/, "nothing writes offsets, rings or scroll kicks");
  assert.match(motion, /scrollHeight/, "a block the page cannot scroll to is never held back");
  assert.match(motion, /prefers-reduced-motion: reduce/);
});

test("product pages never hold content back", () => {
  const ctx = sandbox(["app-body"]);
  vm.runInContext(motion, ctx);
  assert.equal(ctx.window.InsidirMotion.pending, 0);
  assert.ok(!ctx.listeners.includes("window:scroll"), "a product page does not even listen to the scroll");
  assert.match(motion, /settledAll = productPage/);
  const research = sandbox(["v6-app"]);
  vm.runInContext(motion, research);
  assert.ok(!research.listeners.includes("window:scroll"), "research and portfolio (body.v6-app) are product pages too");
});

test("the movement curve is a short ease-out with no overshoot, and the reveal only fades up a little", () => {
  const curve = /--hf-spring:cubic-bezier\(([^)]*)\);/.exec(theme);
  assert.ok(curve, "--hf-spring is a cubic-bezier");
  const [, y1, , y2] = curve[1].split(",").map(Number);
  assert.ok(y1 >= 0 && y1 <= 1 && y2 >= 0 && y2 <= 1, "no overshoot: " + curve[1]);
  const dur = /--hf-spring-dur:([\d.]+)s!important/.exec(theme);
  assert.ok(dur && Number(dur[1]) <= 0.35, "movement is short: " + (dur && dur[1]));
  assert.doesNotMatch(theme, /\[data-hf-atom\]\{translate/, "no element rides a pointer offset");
  assert.doesNotMatch(theme, /@property --hf-d[xy]/);
  const rise = /\.hf-pending\.hf-pending\{opacity:0!important;translate:0 var\(--hf-rise,(\d+)px\)/.exec(theme);
  assert.ok(rise && Number(rise[1]) <= 16, "a pending block waits only a few pixels low");
  // Pending reveals are never hidden under reduced motion or in print.
  assert.match(theme, /@media \(prefers-reduced-motion:reduce\)\{body\.v13 :is\(\.hf-pending,\.hf-revealing\)\{opacity:1!important;translate:none!important/);
  assert.match(theme, /@media print\{body\.v13 :is\(\.hf-pending,\.hf-revealing\)\{opacity:1!important/);
});

test("no hover state on the site moves or resizes anything, and no keyframe bounces", async () => {
  const files = (await readdir(cssDir)).filter(f => /^v13-.*\.css$|^entity-media\.css$/.test(f));
  assert.ok(files.length >= 10);
  const moving = [], bouncing = [];
  for (const f of files) {
    const css = await readFile(new URL(f, cssDir), "utf8");
    for (const m of css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
      for (const d of m[2].matchAll(/(?:^|;)\s*(transform|translate|scale|rotate)\s*:\s*([^;!]+)/g)) {
        if (d[2].trim() !== "none") moving.push(f + ": " + m[1].trim().slice(-80) + " {" + d[1] + ":" + d[2].trim() + "}");
      }
    }
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\{(.*?)\}\}/gs)) {
      if (/scale|translate|rotate\(\s*-?\d/.test(m[2]) && !/spin/i.test(m[1])) bouncing.push(f + ": @keyframes " + m[1]);
    }
  }
  assert.deepEqual(moving, [], "hover rules that move: \n" + moving.join("\n"));
  assert.deepEqual(bouncing, [], "keyframes that move: \n" + bouncing.join("\n"));
});

test("every page carries the engine, then the motion layer", async () => {
  const pages = (await readdir(web)).filter(f => f.endsWith(".html"));
  assert.ok(pages.length >= 25);
  for (const f of pages) {
    const html = await readFile(new URL(f, web), "utf8");
    const e = html.search(/v13-halftone\.js/), m = html.search(/v13-motion\.js/);
    assert.ok(e > 0 && m > e, f + " loads v13-halftone.js and then v13-motion.js");
    assert.doesNotMatch(html, /src="assets\/js\/motion\.js/, f + " does not load the old scroll-animation engine");
  }
  assert.match(engine, /footer\.v13-footer--plain/, "every plain footer gets the dot strip");
});
