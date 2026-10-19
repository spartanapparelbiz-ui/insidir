import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// The halftone engine is a browser IIFE; load it in a sandbox with the few globals it touches at
// load time and exercise the pure helpers it exports on window.InsidirHalftone.
const source = await readFile(new URL("../web/assets/js/v13-halftone.js", import.meta.url), "utf8");
function load() {
  const window = { matchMedia: () => ({ matches: true }), addEventListener() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, scrollTo() {}, devicePixelRatio: 1 };
  const document = { readyState: "complete", querySelectorAll: () => [], addEventListener() {} };
  const context = { window, document, performance: { now: () => 0 }, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return window.InsidirHalftone;
}
// Values cross the sandbox boundary with foreign prototypes; compare their plain shape.
const plain = v => JSON.parse(JSON.stringify(v));

test("engine exposes the halftone helpers and the night palette shared with the stylesheet", async () => {
  const h = load();
  assert.deepEqual(plain(h.PRESET), { background: "#0c0c0b", ink: "#e9e4da" });
  const css = await readFile(new URL("../web/assets/css/v13-halftone.css", import.meta.url), "utf8");
  assert.match(css, /--hf-bg:#0c0c0b!important/);
  assert.match(css, /--hf-ink:#e9e4da!important/);
  // Orange is retired: the old token survives only as an alias of ink, and no rule in any V13 stylesheet names it.
  assert.match(css, /--hf-warm:var\(--hf-ink\)!important/);
  assert.match(css, /@layer insidir-v13/);
  for (const fn of ["mount", "auto", "hex", "radius", "step", "fitSize"]) assert.equal(typeof h[fn], "function", fn);
});

test("hex parses short and long colours and rejects anything else", () => {
  const h = load();
  assert.deepEqual(plain(h.hex("#e9762b")), [233, 118, 43]);
  assert.deepEqual(plain(h.hex("e9e4da")), [233, 228, 218]);
  assert.deepEqual(plain(h.hex("#fff")), [255, 255, 255]);
  assert.equal(h.hex("rgb(1,2,3)"), null);
  assert.equal(h.hex(""), null);
  assert.equal(h.hex(undefined), null);
});

test("dot radius is area-true and clamped to the cell", () => {
  const h = load();
  assert.equal(h.radius(0, 6), 0);
  assert.equal(h.radius(1, 6), 6 * 0.56);
  assert.equal(h.radius(2, 6), h.radius(1, 6));
  assert.equal(h.radius(-1, 6), 0);
  assert.ok(Math.abs(h.radius(0.25, 6) - 0.5 * 6 * 0.56) < 1e-9, "quarter coverage gives half the radius");
});

test("a displaced dot springs home and comes to rest when the pointer is away", () => {
  const h = load();
  let x = 40, y = -25, vx = 0, vy = 0;
  for (let i = 0; i < 300; i++) [x, y, vx, vy] = h.step(x, y, vx, vy, 0, 0, -1e5, -1e5, 80);
  assert.ok(Math.hypot(x, y) < 0.01, "settles at home: " + [x, y]);
  assert.ok(Math.abs(vx) + Math.abs(vy) < 0.01, "velocity dies out");
});

test("a pointer inside the radius pushes the dot away from itself, outside it does nothing", () => {
  const h = load();
  const pushed = h.step(10, 0, 0, 0, 10, 0, 0, 0, 80);
  assert.ok(pushed[0] > 10, "moves away from a pointer on its left");
  assert.ok(Math.abs(pushed[1]) < 1e-9, "no sideways drift when the pointer is on the same line");
  const idle = h.step(10, 0, 0, 0, 10, 0, 200, 0, 80);
  assert.deepEqual(plain(idle), [10, 0, 0, 0]);
  const off = h.step(10, 0, 0, 0, 10, 0, 0, 0, 0);
  assert.deepEqual(plain(off), [10, 0, 0, 0], "a zero radius (reduced motion / non-interactive) never pushes");
});

test("dots are always drawn in ink: pushing them never tints them orange", async () => {
  const h = load();
  assert.equal(h.warmth, undefined, "no warmth helper");
  const src = await readFile(new URL("../web/assets/js/v13-halftone.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /warm|e9762b|233,\s*118,\s*43/i, "the engine knows no accent colour");
  // Dots are only ever painted in the ink, over the background: nothing a push does can change a dot's colour.
  // (The word's mask is set in black on a canvas of its own, and the print grain is a pattern printed once into its own layer over a word.)
  const styles = [...src.matchAll(/(\w+)\.fillStyle = ([^;]+);/g)].map(m => m[1] + ": " + m[2].trim());
  assert.deepEqual([...new Set(styles)].sort(), ["ctx: o.colors.background", "ctx: o.colors.ink", "gg: pattern", "g: o.colors.background", "g: o.colors.ink", "m: \"#000\""].sort(), "only ink and background: " + styles.join(", "));
  // Every ink fill follows an ink fillStyle: the resting print (g), a word frame, and the dots away from home.
  for (const m of src.matchAll(/(\w+)\.fill\(\)/g)) {
    const before = src.slice(0, m.index), set = before.lastIndexOf(m[1] + ".fillStyle = ");
    assert.ok(set >= 0 && before.slice(set).startsWith(m[1] + ".fillStyle = o.colors.ink"), m[1] + ".fill() at " + m.index + " is an ink fill");
  }
});

test("a held press pushes harder; a ring pushes only within its band and fades out", () => {
  const h = load();
  const once = h.step(10, 0, 0, 0, 10, 0, 0, 0, 80), held = h.step(10, 0, 0, 0, 10, 0, 0, 0, 80, 0, 0, h.PHYSICS.press);
  assert.ok(held[2] > once[2] * 2, "a press pushes " + h.PHYSICS.press + "x as hard: " + [once[2], held[2]]);
  const P = h.PHYSICS, age = 400, at = age * P.ringSpeed;
  assert.ok(h.ringPush(at, age) > 0, "a dot on the ring is pushed");
  assert.equal(h.ringPush(at + P.ringBand + 1, age), 0, "a dot beyond the band is not");
  assert.equal(h.ringPush(at, P.ringLife), 0, "a spent ring pushes nothing");
  assert.ok(h.ringPush(at, age) > h.ringPush(P.ringLife * 0.9 * P.ringSpeed, P.ringLife * 0.9), "a ring fades as it runs");
});

test("fitSize scales a 100px measurement to fill the width", () => {
  const h = load();
  assert.equal(h.fitSize(300, 1500), 500);
  assert.equal(h.fitSize(0, 1500), 0);
});
