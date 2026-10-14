import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, readdir } from "node:fs/promises";

// The whole site moves like the landing wordmark: one set of physics in the halftone engine, reused by the
// site motion layer (v13-motion.js) and baked into the CSS spring easing (--hf-spring). These tests pin that.
const web = new URL("../web/", import.meta.url);
const engine = await readFile(new URL("assets/js/v13-halftone.js", web), "utf8");
const motion = await readFile(new URL("assets/js/v13-motion.js", web), "utf8");
const theme = await readFile(new URL("assets/css/v13-halftone.css", web), "utf8");

function sandbox() {
  const media = () => ({ matches: false, addEventListener() {} });
  const window = { matchMedia: media, addEventListener() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, scrollTo() {}, devicePixelRatio: 1, scrollX: 0, scrollY: 0, innerWidth: 1440, innerHeight: 900 };
  const document = { readyState: "complete", querySelectorAll: () => [], addEventListener() {}, body: {} };
  const context = { window, document, performance: { now: () => 0 }, console, getComputedStyle: () => ({ position: "static", display: "block" }), setTimeout, clearTimeout };
  vm.createContext(context);
  return context;
}
const plain = v => JSON.parse(JSON.stringify(v));

test("one set of physics: the engine exports it frozen and its spring step uses it", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  const H = ctx.window.InsidirHalftone;
  assert.deepEqual(plain(H.PHYSICS), { push: 2.6, spring: 0.05, damping: 0.84, ringSpeed: 0.9, ringBand: 26, ringForce: 3.2, ringLife: 900, drag: 0.05, scroll: 0.03 });
  assert.ok(Object.isFrozen(H.PHYSICS));
  // A dot one pixel from home with no pointer: v = (0 + (0 - 1)·0.05)·0.84 = −0.042.
  const [x, , vx] = plain(H.step(1, 0, 0, 0, 0, 0, -1e5, -1e5, 80));
  assert.ok(Math.abs(vx + 0.042) < 1e-12 && Math.abs(x - 0.958) < 1e-12);
  assert.doesNotMatch(engine.replace(/const PHYSICS = Object\.freeze\(\{[^}]*\}\);/, ""), /\b(2\.6|0\.84|3\.2)\b/, "no physics number is repeated outside PHYSICS");
  // The pointer drags what it passes: a dot beside a pointer moving right is pushed away and carried right.
  const [, , dvx] = plain(H.step(0, 10, 0, 0, 0, 10, 0, 0, 80, 20, 0));
  const [, , svx] = plain(H.step(0, 10, 0, 0, 0, 10, 0, 0, 80, 0, 0));
  assert.ok(dvx > svx + 0.5, "drag carries the dot along: " + dvx + " vs " + svx);
  // The scroll weave runs from 0.1 to 1 across a field, so a scroll ripples it.
  const ws = []; for (let x = 0; x < 600; x += 7) ws.push(H.weave(x, 40));
  assert.ok(Math.min(...ws) >= 0.1 - 1e-9 && Math.max(...ws) <= 1 + 1e-9 && Math.max(...ws) - Math.min(...ws) > 0.8);
});

test("the site motion layer reuses the engine's physics instead of its own copy", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  vm.runInContext(motion, ctx);
  assert.equal(ctx.window.InsidirMotion.PHYSICS, ctx.window.InsidirHalftone.PHYSICS, "same object");
  assert.ok(ctx.window.InsidirMotion.ATOM_SCALE > 0 && ctx.window.InsidirMotion.ATOM_SCALE * 2.6 / 0.05 <= 10, "an atom is pushed at most ~9px");
  assert.equal(typeof ctx.window.InsidirMotion.revealAll, "function", "tools can show every pending block");
  assert.match(motion, /scrollHeight/, "a block the page cannot scroll to is never held back");
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /closest\(CONTROL\)/, "a click on a control does not start a ring");
});

test("the CSS spring easing is the dots' spring, sampled frame by frame", () => {
  const ctx = sandbox();
  vm.runInContext(engine, ctx);
  const { spring, damping } = ctx.window.InsidirHalftone.PHYSICS;
  const xs = [0];
  let x = 0, v = 0;
  for (let n = 0; n < 400; n++) {
    v = (v + (1 - x) * spring) * damping; x += v; xs.push(x);
    if (n > 10 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.002) break;
  }
  const frames = xs.length - 1;
  const curve = /--hf-spring:linear\(([^)]*)\)!important/.exec(theme);
  assert.ok(curve, "--hf-spring is defined as a linear() curve");
  const pts = curve[1].split(",").map(Number);
  assert.equal(pts.length, 41);
  pts.forEach((p, i) => {
    const t = (i / 40) * frames, a = Math.floor(t), b = Math.min(frames, a + 1), want = i === 40 ? 1 : xs[a] + (xs[b] - xs[a]) * (t - a);
    assert.ok(Math.abs(p - want) < 0.0015, `point ${i}: ${p} vs ${want.toFixed(4)}`);
  });
  const dur = /--hf-spring-dur:([\d.]+)s!important/.exec(theme);
  assert.ok(dur && Math.abs(Number(dur[1]) * 1000 - frames * 1000 / 60) < 20, "duration is the spring's settling time");
  assert.match(theme, /body\.v13 \[data-hf-atom\]\{translate:var\(--hf-dx,0px\) var\(--hf-dy,0px\)!important;scale:var\(--hf-s,1\)!important\}/);
  assert.match(theme, /@media \(prefers-reduced-motion:reduce\)\{body\.v13 \[data-hf-atom\]\{translate:none!important;scale:none!important\}\}/);
  // Pending reveals are never hidden under reduced motion or in print.
  assert.match(theme, /@media \(prefers-reduced-motion:reduce\)\{body\.v13 :is\(\.hf-pending,\.hf-revealing\)\{opacity:1!important;translate:none!important/);
  assert.match(theme, /@media print\{body\.v13 :is\(\.hf-pending,\.hf-revealing\)\{opacity:1!important/);
});

test("every page carries the motion: the engine, then the motion layer", async () => {
  const pages = (await readdir(web)).filter(f => f.endsWith(".html"));
  assert.ok(pages.length >= 25);
  for (const f of pages) {
    const html = await readFile(new URL(f, web), "utf8");
    const e = html.search(/v13-halftone\.js/), m = html.search(/v13-motion\.js/);
    assert.ok(e > 0 && m > e, f + " loads v13-halftone.js and then v13-motion.js");
  }
  assert.match(engine, /footer\.v13-footer--plain/, "every plain footer gets the dot strip");
});
