// Insidir films: shared drawing library for the frame-by-frame canvas renderer.
// Everything is deterministic in time t (seconds) so any frame can be rendered alone.
"use strict";
const W = 1920, H = 1080, FPS = 30;
const INK = "#e9e4da", PAPER = "#0c0c0b";
const FONT = "JBM";

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const inv = (a, b, v) => clamp((v - a) / (b - a));
const ease = {
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  expoOut: k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k),
  sine: k => .5 - .5 * Math.cos(Math.PI * k),
};
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }
function hash(n) { const r = rng(n * 9301 + 49297); r(); return r(); }
function noise1(x, seed = 1) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i * 13 + seed), hash((i + 1) * 13 + seed), u) * 2 - 1; }
// Handheld drift: low-frequency noise on x, y and rotation.
function handheld(t, amp = 1, seed = 3) {
  return { x: (noise1(t * .9, seed) * 6 + noise1(t * 3.1, seed + 7) * 1.6) * amp, y: (noise1(t * .8, seed + 3) * 5 + noise1(t * 2.7, seed + 11) * 1.4) * amp, r: noise1(t * .6, seed + 5) * .0025 * amp };
}
// Short decaying shake after an impact at time t0.
function impactShake(t, t0, amp = 14, dur = .35) {
  if (t < t0 || t > t0 + dur) return { x: 0, y: 0 };
  const k = 1 - (t - t0) / dur, e = k * k;
  return { x: Math.sin((t - t0) * 90) * amp * e, y: Math.cos((t - t0) * 77) * amp * .7 * e };
}

// ---------- assets ----------
const IMG = {};
function loadImage(key, src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[key] = im; res(im); }; im.onerror = () => rej(new Error("image " + src)); im.src = src; });
}
const FRAMESETS = {};
async function loadFrames(key, dir, count) {
  FRAMESETS[key] = [];
  const jobs = [];
  for (let i = 1; i <= count; i++) jobs.push(loadImage(`${key}_${i}`, `${dir}/${String(i).padStart(3, "0")}.jpg`).then(im => FRAMESETS[key][i - 1] = im));
  await Promise.all(jobs);
}
function frameOf(key, t, speed = 1, offset = 0) {
  const arr = FRAMESETS[key]; const i = clamp(Math.floor((t * speed + offset) * FPS), 0, arr.length - 1); return arr[i];
}

// ---------- offscreen canvases ----------
const POOL = {};
function off(name, w = W, h = H) {
  let c = POOL[name];
  if (!c || c.width !== w || c.height !== h) { c = POOL[name] = document.createElement("canvas"); c.width = w; c.height = h; }
  const x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
  return [c, x];
}

// ---------- camera on an image ----------
// Places image point (cx, cy) at the canvas centre with `zoom` canvas px per image px.
function drawImageCam(ctx, im, cx, cy, zoom, rot = 0, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(W / 2 + dx, H / 2 + dy); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
  ctx.drawImage(im, 0, 0);
  ctx.restore();
}
// Cover-fit a full image with a slow push (scale >= 1 relative to cover).
function drawCover(ctx, im, scale = 1, fx = .5, fy = .5, dx = 0, dy = 0, rot = 0) {
  const s = Math.max(W / im.width, H / im.height) * scale;
  drawImageCam(ctx, im, im.width * fx, im.height * fy, s, rot, dx, dy);
}
// Same camera, with depth of field: sharp only in a horizontal band around canvas y = focusY.
function drawImageDOF(ctx, im, cx, cy, zoom, rot, dx, dy, focusY, band, blur) {
  const [a, ax] = off("dofSharp");
  drawImageCam(ax, im, cx, cy, zoom, rot, dx, dy);
  ctx.save(); ctx.filter = `blur(${blur}px)`; drawImageCam(ctx, im, cx, cy, zoom, rot, dx, dy); ctx.restore();
  const g = ax.createLinearGradient(0, focusY - band * 2, 0, focusY + band * 2);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.3, "rgba(0,0,0,1)"); g.addColorStop(.7, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ax.globalCompositeOperation = "destination-in"; ax.fillStyle = g; ax.fillRect(0, 0, W, H);
  ctx.drawImage(a, 0, 0);
}
// Maps an image point through the same camera to canvas coordinates.
function camPoint(px, py, cx, cy, zoom, rot = 0, dx = 0, dy = 0) {
  const x = (px - cx) * zoom, y = (py - cy) * zoom, c = Math.cos(rot), s = Math.sin(rot);
  return [W / 2 + dx + x * c - y * s, H / 2 + dy + x * s + y * c];
}

// ---------- light ----------
function lampPool(ctx, x, y, r, floor = .08, warm = 1) {
  ctx.save(); ctx.globalCompositeOperation = "multiply";
  const g = ctx.createRadialGradient(x, y, r * .05, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${warm})`); g.addColorStop(.45, "rgba(200,200,200,1)"); g.addColorStop(1, `rgba(${floor * 255},${floor * 255},${floor * 255},1)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function vignette(ctx, strength = .65, inner = .45) {
  ctx.save();
  const g = ctx.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
// Venetian-blind window light: soft diagonal bars, multiplied over the frame.
function blindLight(ctx, t, opts = {}) {
  const { angle = -.38, period = 120, duty = .55, drift = 14, dark = .42, soft = 18, x0 = 0 } = opts;
  const [c, x] = off("blind");
  x.fillStyle = `rgb(${255 * (1 - dark)},${255 * (1 - dark)},${255 * (1 - dark)})`; x.fillRect(0, 0, W, H);
  x.translate(W / 2, H / 2); x.rotate(angle); x.filter = `blur(${soft}px)`; x.fillStyle = "#fff";
  const off0 = (t * drift + x0) % period;
  for (let y = -1600; y < 1600; y += period) x.fillRect(-2000, y + off0, 4000, period * duty);
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.drawImage(c, 0, 0); ctx.restore();
}
function blackFrame(ctx, a = 1) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); }

// ---------- type ----------
function tracked(ctx, text, x, y, { size = 34, weight = 600, track = .32, color = INK, align = "center", alpha = 1, upper = true } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textBaseline = "middle";
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = `${track * size}px`;
  const s = upper ? text.toUpperCase() : text;
  const w = ctx.measureText(s).width - track * size;
  const sx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.textAlign = "left"; ctx.fillText(s, sx, y); ctx.restore();
  return w;
}
// A caption that types on character by character over [t0, t1].
function typeOn(ctx, text, x, y, t, t0, t1, opts = {}) {
  const n = Math.floor(clamp((t - t0) / (t1 - t0)) * text.length);
  if (n <= 0) return;
  const full = text.toUpperCase(), shown = full.slice(0, n);
  ctx.save(); ctx.font = `${opts.weight || 600} ${opts.size || 34}px ${FONT}`; ctx.letterSpacing = `${(opts.track ?? .32) * (opts.size || 34)}px`;
  const w = ctx.measureText(full).width - (opts.track ?? .32) * (opts.size || 34); ctx.restore();
  tracked(ctx, shown, x - w / 2, y, { ...opts, align: "left" });
}

// ---------- split-flap board (real Form 4 lines) ----------
const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,$-/";
function flapChar(target, t, startT, seed) {
  // Each cell cycles through characters and lands on its target, mechanical stepping at 18 flips/s.
  const steps = 4 + Math.floor(hash(seed) * 14), rate = 18;
  const k = (t - startT) * rate;
  if (k >= steps) return { ch: target, prev: target, phase: 1 };
  if (k < 0) return { ch: " ", prev: " ", phase: 1 };
  const i = Math.floor(k), ti = FLAP_CHARS.indexOf(target) < 0 ? 0 : FLAP_CHARS.indexOf(target);
  const at = j => FLAP_CHARS[((ti - (steps - j)) % FLAP_CHARS.length + FLAP_CHARS.length) % FLAP_CHARS.length];
  return { ch: at(i + 1), prev: at(i), phase: k - i };
}
function drawFlapCell(ctx, x, y, w, h, cell) {
  const r = 5;
  ctx.fillStyle = "#151514"; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.font = `700 ${h * .74}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.letterSpacing = "0px";
  const cx = x + w / 2, cy = y + h / 2 + h * .03;
  const half = (ch, top, sy) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, top ? y : y + h / 2, w, h / 2); ctx.clip();
    ctx.translate(cx, y + h / 2); ctx.scale(1, sy); ctx.translate(-cx, -(y + h / 2));
    ctx.fillStyle = top ? "#1b1b1a" : "#121211"; ctx.fillRect(x, top ? y : y + h / 2, w, h / 2);
    ctx.fillStyle = top ? "#e9e4da" : "#d6d1c7"; ctx.fillText(ch, cx, cy); ctx.restore();
  };
  // static halves: new char top, old char bottom; the falling flap on top of them
  half(cell.ch, true, 1); half(cell.prev, false, 1);
  if (cell.phase < .5) half(cell.prev, true, 1 - cell.phase * 2);
  else half(cell.ch, false, (cell.phase - .5) * 2);
  ctx.fillStyle = "#000"; ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
}
function drawFlapBoard(ctx, lines, t, startT, { x = 0, y = 0, cw = 44, ch = 66, gap = 6, rowGap = 14, stagger = .02 } = {}) {
  lines.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      const cell = flapChar(line[c], t, startT + (r * line.length + c) * stagger * .25 + r * .06, r * 101 + c * 7 + 1);
      drawFlapCell(ctx, x + c * (cw + gap), y + r * (ch + rowGap), cw, ch, cell);
    }
  });
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- ticker tape ----------
function drawTickerTape(ctx, text, t, { y = H / 2, h = 150, speed = 900, rot = -.06, blur = 1, zoom = 1, dir = -1 } = {}) {
  ctx.save(); ctx.translate(W / 2, y); ctx.rotate(rot); ctx.scale(zoom, zoom);
  // paper strip with a slight curl shade
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, "#8d8a84"); g.addColorStop(.18, "#e7e3da"); g.addColorStop(.75, "#d9d5cc"); g.addColorStop(1, "#6d6a65");
  ctx.fillStyle = g; ctx.fillRect(-W * 1.5, -h / 2, W * 3, h);
  ctx.font = `700 ${h * .5}px ${FONT}`; ctx.textBaseline = "middle"; ctx.letterSpacing = `${h * .06}px`; ctx.fillStyle = "#151514";
  const tw = ctx.measureText(text).width;
  const xoff = ((dir * t * speed) % tw + tw) % tw;
  const samples = blur > 0 ? 7 : 1;
  for (let s = 0; s < samples; s++) {
    ctx.globalAlpha = 1 / samples * (samples > 1 ? 1.6 : 1);
    const sx = xoff + (samples > 1 ? (s / (samples - 1) - .5) * speed / FPS * blur : 0);
    for (let k = -3; k < 3; k++) ctx.fillText(text, -W * 1.5 + sx + k * tw, 4);
  }
  ctx.restore();
}

// ---------- press: newsprint racing past a steel cylinder ----------
function drawPress(ctx, t, lines, { speed = 2600, angle = 0, zoom = 1, seed = 1 } = {}) {
  ctx.save(); ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.rotate(angle); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
  // web of paper
  const px0 = 260, px1 = W - 260;
  ctx.fillStyle = "#d8d4cb"; ctx.fillRect(px0, -400, px1 - px0, H + 800);
  ctx.save(); ctx.beginPath(); ctx.rect(px0, -400, px1 - px0, H + 800); ctx.clip();
  ctx.font = `600 34px ${FONT}`; ctx.fillStyle = "#1a1a19"; ctx.textBaseline = "top"; ctx.letterSpacing = "0px";
  const lh = 50, total = lines.length * lh, cols = 3, cw = (px1 - px0 - 120) / cols;
  const shift = (t * speed) % total, samples = 4;
  for (let s = 0; s < samples; s++) {
    ctx.globalAlpha = 1.7 / samples;
    const sy = shift + s / samples * speed / FPS * .9;
    for (let c = 0; c < cols; c++) for (let rep = -1; rep < 3; rep++) for (let i = 0; i < lines.length; i++) {
      const y = rep * total + i * lh + sy - 400 + c * 97;
      if (y < -60 || y > H + 60) continue;
      ctx.fillText(lines[(i + c * 7) % lines.length].slice(0, 26), px0 + 60 + c * cw, y);
    }
  }
  ctx.restore();
  // steel cylinders top and bottom with rotating highlights
  for (const [cy, rr] of [[-60, 260], [H + 60, 260]]) {
    const g = ctx.createLinearGradient(0, cy - rr / 2, 0, cy + rr / 2);
    g.addColorStop(0, "#050505"); g.addColorStop(.35, "#6d6c69"); g.addColorStop(.5, "#c9c7c2"); g.addColorStop(.62, "#5c5b58"); g.addColorStop(1, "#050505");
    ctx.fillStyle = g; ctx.fillRect(0, cy - rr / 2, W, rr);
    ctx.globalAlpha = .35; ctx.fillStyle = "#000";
    for (let i = 0; i < 40; i++) { const yy = cy - rr / 2 + (((i * 23 + t * speed * .6) % rr) + rr) % rr; ctx.fillRect(0, yy, W, 2); }
    ctx.globalAlpha = 1;
  }
  // side frames
  const sg = ctx.createLinearGradient(0, 0, px0, 0); sg.addColorStop(0, "#020202"); sg.addColorStop(.8, "#2a2a29"); sg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = sg; ctx.fillRect(0, -400, px0, H + 800);
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillStyle = sg; ctx.fillRect(0, -400, px0, H + 800); ctx.restore();
  ctx.restore();
}

// ---------- clocks ----------
// Mechanical second hand: steps once per second with a small overshoot, or sweeps (8 beats/s) for a watch.
function secondAngle(t, mode, startSec = 37) {
  const s = t + startSec;
  if (mode === "sweep") return (Math.floor(s * 8) / 8) / 60 * Math.PI * 2;
  const i = Math.floor(s), f = s - i;
  const k = f < .09 ? ease.out(f / .09) * 1.06 : f < .2 ? 1.06 - .06 * ease.out((f - .09) / .11) : 1;
  return (i - 1 + k) / 60 * Math.PI * 2;
}
function drawWallClock(ctx, cx, cy, R, t, { startSec = 37, minute = 51, hour = 6 } = {}) {
  ctx.save(); ctx.translate(cx, cy);
  // shadow on wall
  ctx.save(); ctx.filter = `blur(${R * .06}px)`; ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.arc(R * .05, R * .07, R * 1.04, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // rim
  const rim = ctx.createLinearGradient(-R, -R, R, R); rim.addColorStop(0, "#3a3a38"); rim.addColorStop(.5, "#0b0b0b"); rim.addColorStop(1, "#262624");
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, R * 1.06, 0, Math.PI * 2); ctx.fill();
  const face = ctx.createRadialGradient(-R * .3, -R * .3, R * .1, 0, 0, R);
  face.addColorStop(0, "#f4f1ea"); face.addColorStop(1, "#cfcac0");
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
    ctx.save(); ctx.rotate(a); ctx.fillStyle = "#111"; ctx.fillRect(-R * (big ? .018 : .006), -R * .95, R * (big ? .036 : .012), R * (big ? .12 : .05)); ctx.restore();
  }
  ctx.fillStyle = "#111"; ctx.font = `600 ${R * .14}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.letterSpacing = "0px";
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillText(String(i), Math.sin(a) * R * .71, -Math.cos(a) * R * .71); }
  const sec = secondAngle(t, "step", startSec), min = (minute + (t + startSec) / 60) / 60 * Math.PI * 2, hr = (hour + minute / 60) / 12 * Math.PI * 2;
  const hand = (a, len, w, col, tail = .15) => { ctx.save(); ctx.rotate(a); ctx.fillStyle = col; ctx.fillRect(-w / 2, -len, w, len * (1 + tail)); ctx.restore(); };
  ctx.save(); ctx.translate(R * .012, R * .02); ctx.globalAlpha = .25; hand(hr, R * .5, R * .05, "#000"); hand(min, R * .78, R * .035, "#000"); hand(sec, R * .86, R * .012, "#000", .25); ctx.restore();
  hand(hr, R * .5, R * .05, "#111"); hand(min, R * .78, R * .035, "#111"); hand(sec, R * .86, R * .012, "#2b2b2b", .25);
  ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0, 0, R * .035, 0, Math.PI * 2); ctx.fill();
  // crystal reflection
  const gl = ctx.createLinearGradient(-R, -R, R * .2, R * .2); gl.addColorStop(0, "rgba(255,255,255,.28)"); gl.addColorStop(.5, "rgba(255,255,255,0)");
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawWatch(ctx, cx, cy, R, t, { startSec = 12, minute = 47, hour = 11, rot = 0 } = {}) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  // strap
  const st = ctx.createLinearGradient(-R * .55, 0, R * .55, 0); st.addColorStop(0, "#050505"); st.addColorStop(.5, "#2a2a29"); st.addColorStop(1, "#050505");
  ctx.fillStyle = st; ctx.fillRect(-R * .55, -R * 3, R * 1.1, R * 6);
  // case & bezel
  const cs = ctx.createLinearGradient(-R, -R, R, R); cs.addColorStop(0, "#f2f2f0"); cs.addColorStop(.35, "#6a6a68"); cs.addColorStop(.55, "#d8d8d4"); cs.addColorStop(1, "#2c2c2b");
  ctx.fillStyle = cs; ctx.beginPath(); ctx.arc(0, 0, R * 1.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0e0e0e"; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  const dial = ctx.createRadialGradient(0, -R * .3, R * .1, 0, 0, R); dial.addColorStop(0, "#2e2e2d"); dial.addColorStop(1, "#0b0b0b");
  ctx.fillStyle = dial; ctx.beginPath(); ctx.arc(0, 0, R * .97, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, big = i % 5 === 0; ctx.save(); ctx.rotate(a); ctx.fillStyle = big ? "#e9e4da" : "#8a8781"; ctx.fillRect(-R * (big ? .022 : .006), -R * .92, R * (big ? .044 : .012), R * (big ? .16 : .06)); ctx.restore(); }
  const sec = secondAngle(t, "sweep", startSec), min = (minute + (t + startSec) / 60) / 60 * Math.PI * 2, hr = (hour + minute / 60) / 12 * Math.PI * 2;
  const hand = (a, len, w, col, tail = .12) => { ctx.save(); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w / 2, len * tail); ctx.lineTo(-w * .3, -len); ctx.lineTo(w * .3, -len); ctx.lineTo(w / 2, len * tail); ctx.fill(); ctx.restore(); };
  hand(hr, R * .52, R * .07, "#e9e4da"); hand(min, R * .8, R * .05, "#e9e4da"); hand(sec, R * .88, R * .014, "#bdb9b1", .25);
  ctx.fillStyle = "#cfcac0"; ctx.beginPath(); ctx.arc(0, 0, R * .04, 0, Math.PI * 2); ctx.fill();
  const gl = ctx.createLinearGradient(-R, -R, R * .3, R * .3); gl.addColorStop(0, "rgba(255,255,255,.22)"); gl.addColorStop(.45, "rgba(255,255,255,0)");
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * .97, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Watch movement: meshing gears and an oscillating balance wheel.
function drawMovement(ctx, t, { zoom = 1 } = {}) {
  ctx.save(); ctx.fillStyle = "#070707"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom);
  const gear = (x, y, r, teeth, a, shade) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r); g.addColorStop(0, shade); g.addColorStop(1, "#3a3a39");
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const aa = i / (teeth * 2) * Math.PI * 2, rr = i % 2 ? r : r * 1.08; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 5; k++) { const aa = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(aa) * r * .55, Math.sin(aa) * r * .55, r * .26, r * .17, aa, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0, 0, r * .12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9e4da"; ctx.beginPath(); ctx.arc(0, 0, r * .05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const step = Math.floor(t * 6) + ease.out((t * 6) % 1);
  gear(-380, 40, 300, 60, step * .02, "#cfccc5");
  gear(30, -230, 170, 34, -step * .035, "#b7b4ad");
  gear(260, 120, 120, 24, step * .05, "#d9d6cf");
  // balance wheel
  const osc = Math.sin(t * Math.PI * 2 * 3) * 2.2;
  ctx.save(); ctx.translate(480, -200); ctx.rotate(osc);
  ctx.strokeStyle = "#e3e0d8"; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 10; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(0, 0); const aa = k / 3 * Math.PI * 2; ctx.lineTo(Math.cos(aa) * 150, Math.sin(aa) * 150); ctx.stroke(); }
  ctx.strokeStyle = "rgba(220,220,215,.5)"; ctx.lineWidth = 2; ctx.beginPath();
  for (let a = 0; a < Math.PI * 10; a += .05) { const r = 12 + a * 3.4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
  ctx.restore();
  // jewels
  for (const [x, y] of [[-380, 40], [30, -230], [260, 120], [480, -200]]) { ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ---------- city at night (procedural) ----------
function drawFacade(ctx, t, { camX = 0, camY = 0, zoom = 1, litIndex = [7, 4], others = .012, seed = 4 } = {}) {
  ctx.save(); ctx.fillStyle = "#020202"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2 - camX, -H / 2 - camY);
  const cols = 15, rows = 9, ww = 118, wh = 92, gx = 30, gy = 46, ox = W / 2 - (cols * (ww + gx)) / 2, oy = H / 2 - (rows * (wh + gy)) / 2;
  // stone facade
  const fg = ctx.createLinearGradient(0, oy - 200, 0, oy + rows * (wh + gy) + 200); fg.addColorStop(0, "#161615"); fg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = fg; ctx.fillRect(ox - 200, oy - 300, cols * (ww + gx) + 400, rows * (wh + gy) + 600);
  const r = rng(seed);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = ox + i * (ww + gx), y = oy + j * (wh + gy), lit = i === litIndex[0] && j === litIndex[1];
    const faint = r() < others;
    if (lit) {
      const g = ctx.createRadialGradient(x + ww * .6, y + wh * .75, 4, x + ww * .5, y + wh * .6, ww * .9);
      g.addColorStop(0, "#f6f2e8"); g.addColorStop(.5, "#a9a59d"); g.addColorStop(1, "#3c3b38");
      ctx.fillStyle = g; ctx.fillRect(x, y, ww, wh);
      // silhouette of a seated figure and a lamp in the lit window
      ctx.fillStyle = "#0b0b0b";
      ctx.beginPath(); ctx.ellipse(x + ww * .34, y + wh * .52, ww * .075, wh * .11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + ww * .2, y + wh); ctx.quadraticCurveTo(x + ww * .22, y + wh * .62, x + ww * .34, y + wh * .62); ctx.quadraticCurveTo(x + ww * .48, y + wh * .62, x + ww * .5, y + wh); ctx.fill();
      ctx.fillRect(x + ww * .62, y + wh * .82, ww * .38, wh * .06);
      ctx.fillRect(x + ww * .78, y + wh * .5, ww * .02, wh * .32);
      ctx.beginPath(); ctx.moveTo(x + ww * .72, y + wh * .52); ctx.lineTo(x + ww * .86, y + wh * .52); ctx.lineTo(x + ww * .82, y + wh * .42); ctx.lineTo(x + ww * .76, y + wh * .42); ctx.fill();
    } else {
      ctx.fillStyle = faint ? "#2a2a28" : "#060606"; ctx.fillRect(x, y, ww, wh);
      // faint reflections of the city
      ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(x + ww * r() * .7, y, ww * .12, wh);
    }
    ctx.fillStyle = "#1d1d1c"; ctx.fillRect(x - 3, y + wh, ww + 6, 7); // sill
    ctx.fillStyle = "#121211"; ctx.fillRect(x + ww / 2 - 2, y, 4, wh); // mullion
  }
  ctx.restore();
}
function drawRain(ctx, t, { count = 420, speed = 2400, len = 46, slant = .18, alpha = .22, seed = 9, width = 1.4 } = {}) {
  ctx.save(); ctx.strokeStyle = `rgba(235,235,230,${alpha})`; ctx.lineWidth = width; ctx.beginPath();
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = r() * (W + 400) - 200, sp = speed * (.7 + r() * .6), y0 = r() * (H + 200), z = .5 + r() * .8;
    const y = ((y0 + t * sp) % (H + 200)) - 100, x = x0 + (y + 100) * slant;
    ctx.moveTo(x, y); ctx.lineTo(x + len * z * slant, y + len * z);
  }
  ctx.stroke(); ctx.restore();
}

// ---------- halftone wordmark (the landing page's identity) ----------
let WM_MASK = null;
function wordmarkMask() {
  if (WM_MASK) return WM_MASK;
  const [c, x] = off("wmMask", W, H);
  x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#fff"; x.font = `800 230px ${FONT}`; x.letterSpacing = `${-.04 * 230}px`; x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.fillText("insidir.", W / 2 + 4, 600);
  WM_MASK = x.getImageData(0, 0, W, H);
  return WM_MASK;
}
// k: 0 → dots absent, 1 → full halftone; solid: 0..1 crossfade to the solid wordmark.
function drawHalftoneWordmark(ctx, k, solid = 0, { cell = 9, scatter = 0, seed = 21, alpha = 1 } = {}) {
  const m = wordmarkMask(), r = rng(seed);
  ctx.save(); ctx.globalAlpha = alpha * (1 - solid); ctx.fillStyle = INK;
  for (let y = 380; y < 660; y += cell) for (let x = 400; x < 1520; x += cell) {
    let cov = 0, n = 0;
    for (let yy = 0; yy < cell; yy += 3) for (let xx = 0; xx < cell; xx += 3) { cov += m.data[((y + yy) * W + x + xx) * 4]; n++; }
    cov /= n * 255;
    const rnd = r();
    if (cov < .02) continue;
    const delay = rnd * .5, kk = ease.out(clamp((k - delay) / .5));
    const rad = cell * .5 * Math.sqrt(cov) * kk;
    if (rad < .3) continue;
    const sx = scatter * (r() - .5) * 400 * (1 - kk), sy = scatter * (r() - .5) * 300 * (1 - kk);
    ctx.beginPath(); ctx.arc(x + cell / 2 + sx, y + cell / 2 + sy, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (solid > 0) {
    ctx.save(); ctx.globalAlpha = alpha * solid; ctx.fillStyle = INK; ctx.font = `800 230px ${FONT}`; ctx.letterSpacing = `${-.04 * 230}px`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("insidir.", W / 2 + 4, 600); ctx.restore();
  }
}
// Halftone any canvas region (used for "printed newspaper" looks).
function halftoneCanvas(ctx, src, { cell = 8, ink = "#141413", paper = "#d6d1c6", angle = .26 } = {}) {
  const sx = src.getContext("2d").getImageData(0, 0, W, H).data;
  ctx.save(); ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H); ctx.fillStyle = ink;
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let v = -H; v < H * 1.6; v += cell) for (let u = -W * .3; u < W * 1.3; u += cell) {
    const x = u * c - v * s + W * .15, y = u * s + v * c - H * .2;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = ((y | 0) * W + (x | 0)) * 4, lum = (sx[i] * .3 + sx[i + 1] * .59 + sx[i + 2] * .11) / 255;
    const rad = cell * .55 * Math.sqrt(1 - lum);
    if (rad > .4) { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ---------- marks on paper ----------
function penStroke(ctx, x0, y0, x1, k, { width = 5, color = "rgba(10,10,12,.92)", wobble = 1.6, seed = 2 } = {}) {
  if (k <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.beginPath();
  const xe = lerp(x0, x1, ease.out(k));
  for (let x = x0; x <= xe; x += 6) { const y = y0 + noise1(x / 90, seed) * wobble + (x - x0) * .006; x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  // nib
  ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(xe, y0 + (xe - x0) * .006, width * .7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function highlighter(ctx, x0, y0, x1, h, k, { alpha = .38, color = "#9a968e" } = {}) {
  if (k <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = color; ctx.globalAlpha = alpha + .5;
  const xe = lerp(x0, x1, ease.out(k));
  ctx.beginPath(); ctx.moveTo(x0, y0 - h / 2 + 3); ctx.lineTo(xe, y0 - h / 2); ctx.lineTo(xe + 4, y0 + h / 2); ctx.lineTo(x0 - 3, y0 + h / 2 - 2); ctx.fill();
  ctx.restore();
}
function tickMark(ctx, x, y, s, k) {
  if (k <= 0) return;
  ctx.save(); ctx.strokeStyle = "rgba(25,25,25,.85)"; ctx.lineWidth = s * .12; ctx.lineCap = "round"; ctx.beginPath();
  const a = clamp(k * 2), b = clamp(k * 2 - 1);
  ctx.moveTo(x, y); ctx.lineTo(x + s * .35 * a, y + s * .35 * a);
  if (b > 0) ctx.lineTo(x + s * .35 + s * .65 * b, y + s * .35 - s * .9 * b);
  ctx.stroke(); ctx.restore();
}

// ---------- camera shutter ----------
// Two blades meet at t0 and part again; k is 0..1 closure.
function shutter(ctx, t, t0, dur = .2) {
  const d = Math.abs(t - t0); if (d > dur / 2) return;
  const k = 1 - d / (dur / 2), h = H / 2 * ease.out(k);
  ctx.save(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); ctx.restore();
}
function letterbox(ctx, size = 66) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, size); ctx.fillRect(0, H - size, W, size); }

// ---------- timeline helper ----------
// shots: [{at, end, draw(ctx, t, local, shot)}]; the active one is drawn.
function playShots(ctx, shots, t) {
  for (const s of shots) if (t >= s.at && t < s.end) { s.draw(ctx, t, t - s.at, s); return s; }
  blackFrame(ctx); return null;
}
