// FILM 01 — THE CITY NEVER SLEEPS. 20s, 128 BPM (beat 0.46875s). Anamorphic 2.39 letterbox, night.
"use strict";
const B1 = 60 / 128, b = n => n * B1;
const LB = 138; // 2.39:1 letterbox inside 1920x1080
const F1T = { s2: b(8), s3: b(17), lit: b(17), doc: b(22), macro: b(25), drop: b(28), pull: b(34), reveal: b(36), logo: b(39), end: 20 };

// Document camera with marks drawn in image space (so they move with the page).
function docShot(ctx, cam, { lamp = true, focusY = null, band = 70, blur = 7, marks = () => {} } = {}) {
  const im = IMG.f4;
  ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
  if (focusY != null) drawImageDOF(ctx, im, cam.x, cam.y, cam.z, cam.r || 0, cam.dx || 0, cam.dy || 0, focusY, band, blur);
  else drawImageCam(ctx, im, cam.x, cam.y, cam.z, cam.r || 0, cam.dx || 0, cam.dy || 0);
  ctx.save(); ctx.translate(W / 2 + (cam.dx || 0), H / 2 + (cam.dy || 0)); ctx.rotate(cam.r || 0); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  marks(ctx); ctx.restore();
  if (lamp) lampPool(ctx, W * .58, H * .38, W * .75, .05);
}

const FILM = {
  duration: 20,
  async load() {
    await Promise.all([loadImage("f4", "../filing/form4_full.png"), loadImage("pins", "../product2x/company_nvda_insiders_full.png"),
      loadFrames("A01", "../frames/A01", 134), loadFrames("A04", "../frames/A04", 134)]);
  },
  draw(ctx, t) {
    const shots = [
      // 1 — Manhattan at night (real generated aerial footage), rain over the lens.
      { at: 0, end: F1T.s2, draw: (c, t, l) => {
        const hh = handheld(t, .5);
        drawCover(c, frameOf("A01", l, .95), lerp(1.04, 1.13, ease.sine(l / 3.75)), .5, .52, hh.x, hh.y);
        drawRain(c, t, { alpha: .13, count: 300, slant: .08 });
        vignette(c, .55); blackFrame(c, 1 - ease.inOut(inv(0, 1.1, l)));
      } },
      // 2 — The financial machine: one shot per beat.
      { at: b(8), end: b(9), draw: (c, t, l) => { drawCover(c, frameOf("A04", l, 1.35, .42), 1.08, .45, .5); vignette(c, .5); } },
      { at: b(9), end: b(10), draw: (c, t, l) => { c.fillStyle = "#060606"; c.fillRect(0, 0, W, H); drawFlapBoard(c, FLAP_LINES.slice(0, 4), t, b(9) - .9, { x: 130, y: 250, cw: 44, ch: 70, gap: 7, rowGap: 22 }); vignette(c, .6); } },
      { at: b(10), end: b(11), draw: (c, t, l) => { c.fillStyle = "#030303"; c.fillRect(0, 0, W, H); drawTickerTape(c, TAPE_TEXT, t, { y: 560, h: 190, speed: 1500, rot: -.09, zoom: 1.3 }); lampPool(c, W * .55, H * .5, W * .6, .04); } },
      { at: b(11), end: b(12), draw: (c, t, l) => { drawPress(c, t, PRESS_LINES, { speed: 3200, angle: .05, zoom: 1.25 }); vignette(c, .55); } },
      { at: b(12), end: b(13), draw: (c, t, l) => { c.fillStyle = "#040404"; c.fillRect(0, 0, W, H); drawWatch(c, W * .52, H * .5, 400, t, { rot: -.2 + l * .08 }); lampPool(c, W * .4, H * .3, W * .7, .06); } },
      { at: b(13), end: b(14), draw: (c, t, l) => { c.fillStyle = "#060606"; c.fillRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.scale(2.3 + l * .2, 2.3 + l * .2); c.translate(-W / 2, -H / 2); drawFlapBoard(c, FLAP_LINES.slice(0, 1), t, b(13) - .55, { x: 360, y: 505, cw: 30, ch: 48, gap: 5 }); c.restore(); vignette(c, .6); } },
      { at: b(14), end: b(15), draw: (c, t, l) => { drawPress(c, t, PRESS_LINES, { speed: 3600, angle: -.12, zoom: 1.8 }); vignette(c, .6); } },
      { at: b(15), end: b(16), draw: (c, t, l) => { c.fillStyle = "#030303"; c.fillRect(0, 0, W, H); drawTickerTape(c, TAPE_TEXT_B, t, { y: 520, h: 230, speed: 1700, rot: .07, zoom: 1.2, dir: 1 }); lampPool(c, W * .45, H * .5, W * .6, .04); } },
      { at: b(16), end: b(16.5), draw: (c, t, l) => { c.fillStyle = "#040404"; c.fillRect(0, 0, W, H); drawWatch(c, W * .45, H * .62, 700, t, { rot: .3 }); lampPool(c, W * .5, H * .4, W * .7, .06); } },
      { at: b(16.5), end: b(17), draw: (c, t, l) => { drawCover(c, frameOf("A04", l, 1.4, 1.25), 1.25, .55, .5); vignette(c, .5); } },
      // 3 — Someone is still working: one lit window in a dark tower.
      { at: F1T.lit, end: F1T.doc, draw: (c, t, l) => {
        const d = F1T.doc - F1T.lit, k = ease.inOut(l / d);
        drawFacade(c, t, { zoom: lerp(1.05, 3.6, k), camX: lerp(0, -15, k), camY: lerp(0, -23, k) });
        drawRain(c, t, { alpha: .18, count: 380, slant: .1, seed: 4 });
        vignette(c, .7);
      } },
      { at: F1T.doc, end: F1T.macro, draw: (c, t, l) => {
        // the page under the lamp; a band of focus moves line by line, like an eye reading
        const fy = lerp(380, 760, ease.inOut(l / (F1T.macro - F1T.doc)));
        docShot(c, { x: 1900, y: 1200, z: .62 + l * .03, r: -.035 }, { focusY: fy, band: 55, blur: 6 });
        vignette(c, .55);
      } },
      { at: F1T.macro, end: F1T.macro + B1, draw: (c, t, l) => { docShot(c, { x: 330 + l * 90, y: 690, z: 2.1, r: -.02 }, { focusY: 540, band: 60, blur: 9 }); vignette(c, .5); } },
      { at: F1T.macro + B1, end: F1T.macro + 2 * B1, draw: (c, t, l) => { docShot(c, { x: 1560 + l * 90, y: 668, z: 2.2, r: .015 }, { focusY: 540, band: 60, blur: 9 }); vignette(c, .5); } },
      { at: F1T.macro + 2 * B1, end: F1T.drop, draw: (c, t, l) => { docShot(c, { x: 1700 - l * 120, y: 1528, z: 1.9, r: -.01 }, { focusY: 540, band: 50, blur: 10 }); vignette(c, .5); } },
      // 4 — The discovery: silence, the pen underlines the line, the line is the story.
      { at: F1T.drop, end: F1T.pull, draw: (c, t, l) => {
        const d = F1T.pull - F1T.drop, z = lerp(1.15, 1.42, ease.sine(l / d));
        docShot(c, { x: 2430, y: 1540, z, r: -.012 }, { focusY: 540 + (1528 - 1540) * z, band: 75, blur: 8, marks: x => penStroke(x, 2100, 1562, 2810, inv(.45, 1.5, l), { width: 6, seed: 5 }) });
        vignette(c, .55);
      } },
      { at: F1T.pull, end: F1T.reveal, draw: (c, t, l) => {
        const k = ease.inOut(l / (F1T.reveal - F1T.pull)), z = lerp(1.42, .36, k);
        docShot(c, { x: lerp(2430, 1920, k), y: lerp(1540, 1510, k), z, r: lerp(-.012, -.05, k) }, { marks: x => penStroke(x, 2100, 1562, 2810, 1, { width: 6, seed: 5 }) });
        vignette(c, .6);
      } },
      // 5 — Insidir: the page becomes the product at the same angle, then the camera looks closer at the same trade.
      { at: F1T.reveal, end: F1T.logo, draw: (c, t, l) => {
        const k = ease.inOut(inv(.1, 1.3, l)), z = lerp(.42, 1.2, k);
        c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
        drawImageCam(c, IMG.pins, lerp(1920, 2300, k), lerp(2950, 2956, k), z, lerp(-.05, 0, k));
        const [x0, y0] = camPoint(2370, 2990, lerp(1920, 2300, k), lerp(2950, 2956, k), z, lerp(-.05, 0, k));
        const [x1] = camPoint(2560, 2990, lerp(1920, 2300, k), lerp(2950, 2956, k), z, lerp(-.05, 0, k));
        c.save(); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(lerp(x0, x1, ease.out(inv(1.0, 1.35, l))), y0); if (l > 1.0) c.stroke(); c.restore();
        vignette(c, .45);
      } },
      { at: F1T.logo, end: 20.01, draw: (c, t, l) => {
        c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
        const k = inv(0, .6, l), solid = ease.inOut(inv(.62, .9, l));
        drawHalftoneWordmark(c, k, solid, { scatter: 1 });
        tracked(c, "Look closer.", W / 2, 700, { size: 22, weight: 500, track: .42, alpha: ease.out(inv(.75, 1.25, l)) * .86 });
        blackFrame(c, ease.in(inv(1.45, 1.72, l)));
      } },
    ];
    playShots(ctx, shots, t);
    // overlays
    if (t >= F1T.drop + .9 && t < F1T.reveal) {
      const a = ease.out(inv(F1T.drop + .9, F1T.drop + 1.6, t)) * (1 - ease.in(inv(F1T.reveal - .25, F1T.reveal, t)));
      ctx.save(); const gg = ctx.createLinearGradient(0, 760, 0, 942); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(.45, `rgba(0,0,0,${.78 * a})`); gg.addColorStop(1, `rgba(0,0,0,${.9 * a})`); ctx.fillStyle = gg; ctx.fillRect(0, 760, W, 182); ctx.restore();
      tracked(ctx, "The information was always there.", W / 2, 872, { size: 34, weight: 600, track: lerp(.5, .3, ease.out(inv(F1T.drop + .9, F1T.drop + 2.2, t))), alpha: a });
    }
    shutter(ctx, t, F1T.s2, .16);
    shutter(ctx, t, F1T.lit, .16);
    if (t < F1T.logo) letterbox(ctx, LB);
  },
};
