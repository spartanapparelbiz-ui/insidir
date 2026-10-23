import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, readdir } from "node:fs/promises";

// The page's content holds still: nothing moves under the pointer, on a click or with a scroll, and hover states
// change colour only. The dots are the exception: every halftone dot field answers the pointer, a press and a tap,
// hard, and settles by itself. Public pages keep a quiet fade-up reveal; product pages hold nothing back.
// These tests pin that.
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

test("every dot answers hard: a resting pointer clears a wide hole, a thrown dot settles, nothing trails a scroll", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  const H = ctx.window.InsidirHalftone, P = H.PHYSICS;
  assert.deepEqual(plain(P), { push: 4, spring: 0.045, damping: 0.85, drag: 0.14, press: 2.2, pressReach: 1.35, hold: 0.5, ringSpeed: 1.05, ringBand: 36, ringForce: 4, ringLife: 1300, rings: 6 });
  assert.ok(Object.isFrozen(P));
  // A pointer resting on a dot's home holds it well clear: the hole is tens of pixels wide, not a nudge.
  let d = [0.5, 0, 0, 0];
  for (let k = 0; k < 240; k++) d = plain(H.step(d[0], d[1], d[2], d[3], 0, 0, 0, 0, 170));
  assert.ok(d[0] > 30, "a resting pointer holds a dot " + d[0].toFixed(1) + "px from home (more than 30)");
  // Held down, the same pointer clears much more.
  let e = [0.5, 0, 0, 0];
  for (let k = 0; k < 240; k++) e = plain(H.step(e[0], e[1], e[2], e[3], 0, 0, 0, 0, 170 * P.pressReach, 0, 0, P.press));
  assert.ok(e[0] > d[0] * 1.5, "a press widens the hole: " + e[0].toFixed(1) + "px");
  // Thrown 80px out with no pointer, a dot is home within a second (60 frames).
  let x = 80, y = 0, vx = 0, vy = 0;
  for (let k = 0; k < 60; k++) [x, y, vx, vy] = plain(H.step(x, y, vx, vy, 0, 0, -1e5, -1e5, 170));
  assert.ok(Math.abs(x) < 1 && Math.abs(vx) < 0.5, "settled within a second: " + [x, vx]);
  assert.ok(!("scroll" in P) && !/\.kick\(|kick\(dx/.test(engine), "no scroll physics: a scroll never pushes a dot");
  assert.doesNotMatch(engine.replace(/const PHYSICS = Object\.freeze\(\{[^}]*\}\);/, ""), /\b(0\.045|0\.85|0\.14|2\.2|1\.35|1\.05|1300)\b/, "no physics number is repeated outside PHYSICS");
});

test("every dot field answers the pointer anywhere on the page, a press and a tap; under reduced motion none does", async () => {
  assert.match(engine, /interactive: d\.interactive !== "false"/, "every field is interactive unless it opts out");
  for (const type of ["pointermove", "pointerdown", "pointerup", "pointercancel"]) assert.ok(engine.includes('on(document, "' + type + '"'), "fields follow " + type + " across the page");
  // Reduced motion is followed live: every handler returns at once under it, and turning it on sends every dot home.
  for (const h of ["onMove", "onDown", "onScroll"]) assert.match(engine, new RegExp("const " + h + " = [^\\n]*\\n?\\s*(if \\(still[^)]*\\) return|if \\(!still)"), h + " does nothing under reduced motion");
  assert.match(engine, /motionQ\.addEventListener\("change", onMotionPref\)/, "a change to prefers-reduced-motion is followed without a reload");
  assert.match(engine, /const onMotionPref = \(\) => \{ still = motionQ\.matches;[^}]*rest\(\);/);
  // A field off screen takes no ring and never stays awake.
  assert.match(engine, /if \(!visible\) return;/);
  assert.match(engine, /awake = visible && \(/);
  const pages = (await readdir(web)).filter(f => f.endsWith(".html"));
  for (const f of pages) assert.doesNotMatch(await readFile(new URL(f, web), "utf8"), /data-interactive="false"/, f + " has no still dot field");
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
    // Pages on the v2 design system (web/assets/css/ds.css, <body class="ds">) use its own restrained motion (ds.js:
    // an 8px fade-up, count-up once, no loops) and not the v13 halftone layer.
    if (/<body class="ds\b/.test(html)) { assert.match(html, /assets\/js\/ds\.js/, f + " loads the design-system script"); continue; }
    // The rebuilt app (web/assets/css/ui.css, <body class="ui">) uses ui.js: springs under 400ms, reduced motion respected.
    if (/<body class="ui\b/.test(html)) { assert.match(html, /assets\/js\/ui\.js/, f + " loads the UI runtime"); continue; }
    const e = html.search(/v13-halftone\.js/), m = html.search(/v13-motion\.js/);
    assert.ok(e > 0 && m > e, f + " loads v13-halftone.js and then v13-motion.js");
    assert.doesNotMatch(html, /src="assets\/js\/motion\.js/, f + " does not load the old scroll-animation engine");
  }
  assert.match(engine, /footer\.v13-footer--plain/, "every plain footer gets the dot strip");
});
