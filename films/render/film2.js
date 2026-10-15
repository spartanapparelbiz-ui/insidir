// FILM 02 — THE ONE WHO LOOKED CLOSER. 25s, 120 BPM (beat 0.5s; the clock ticks every second, on the beat).
// Morning light through blinds, full frame, paper and pencil. Every cut lands on a tick.
"use strict";
const S2 = { doc: 5, inv: 10, fast: 14, quiet: 16, reveal: 21, link: 21.9, source: 22.7, logo: 23.3, end: 25 };

function paperShot(ctx, t, cam, { focusY = null, band = 80, blur = 7, marks = () => {}, light = true, drift = 10 } = {}) {
  ctx.fillStyle = "#1a1a19"; ctx.fillRect(0, 0, W, H);
  const im = IMG.f4, hh = handheld(t, .35, 17);
  const c = { ...cam, dx: (cam.dx || 0) + hh.x, dy: (cam.dy || 0) + hh.y, r: (cam.r || 0) + hh.r };
  if (focusY != null) drawImageDOF(ctx, im, c.x, c.y, c.z, c.r, c.dx, c.dy, focusY, band, blur);
  else drawImageCam(ctx, im, c.x, c.y, c.z, c.r, c.dx, c.dy);
  ctx.save(); ctx.translate(W / 2 + c.dx, H / 2 + c.dy); ctx.rotate(c.r); ctx.scale(c.z, c.z); ctx.translate(-c.x, -c.y); marks(ctx); ctx.restore();
  if (light) blindLight(ctx, t, { dark: .3, period: 150, drift, angle: -.42, soft: 22 });
  vignette(ctx, .5, .5);
}
// Graphite-grey highlighter in image space.
const hl = (x, x0, x1, y, k, h = 46) => highlighter(x, x0, y, x1, h, k, { color: "#8f8b84", alpha: .25 });
const ROW1_MARKS = (x, k = 1) => { hl(x, F4.amountX[0], F4.amountX[1], F4.row1, k); hl(x, F4.priceX[0], F4.priceX[1], F4.row1, k); };

function caption(ctx, text, t, t0, t1, { words = true } = {}) {
  if (t < t0 - .01 || t > t1) return;
  const a = 1 - ease.in(inv(t1 - .35, t1, t));
  ctx.save(); const g = ctx.createLinearGradient(0, 760, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.5, `rgba(0,0,0,${.7 * a})`); g.addColorStop(1, `rgba(0,0,0,${.85 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 760, W, 320); ctx.restore();
  // words arrive one per beat, like the ticks
  const ws = text.split(" "), n = words ? Math.min(ws.length, Math.floor((t - t0) / .5) + 1) : ws.length;
  const shown = ws.slice(0, n).join(" ");
  ctx.save(); ctx.font = `600 34px ${FONT}`; ctx.letterSpacing = `${.3 * 34}px`; const wFull = ctx.measureText(text.toUpperCase()).width - .3 * 34; ctx.restore();
  tracked(ctx, shown, W / 2 - wFull / 2, 930, { size: 34, weight: 600, track: .3, align: "left", alpha: a });
}

const FILM = {
  duration: 25,
  async load() {
    await Promise.all([loadImage("f4", "../filing/form4_full.png"), loadImage("pins", "../product2x/company_nvda_insiders_full.png")]);
  },
  draw(ctx, t) {
    const wall = (c, t) => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#77746e"); g.addColorStop(1, "#3b3a37"); c.fillStyle = g; c.fillRect(0, 0, W, H); };
    const shots = [
      // 1 — The empty office at dawn: the wall clock, blind light crawling across the wall.
      { at: 0, end: 2.5, draw: (c, t, l) => { wall(c, t); c.save(); c.translate(lerp(40, -40, l / 2.5), 0); drawWallClock(c, 1180, 470, 250, t, { startSec: 33 }); c.restore(); blindLight(c, t, { dark: .5, period: 170, drift: 26, soft: 26 }); vignette(c, .7); blackFrame(c, 1 - ease.inOut(inv(0, 1, l))); } },
      { at: 2.5, end: 5, draw: (c, t, l) => { wall(c, t); drawWallClock(c, 760 + l * 14, 560, 760, t, { startSec: 33 }); blindLight(c, t, { dark: .45, period: 210, drift: 26, soft: 30, x0: 60 }); vignette(c, .65); } },
      // 2 — The document. One field per second.
      { at: 5, end: 6, draw: (c, t, l) => paperShot(c, t, { x: 1900 + l * 80, y: 560, z: 1.05 }) },
      { at: 6, end: 7, draw: (c, t, l) => paperShot(c, t, { x: 300 + l * 60, y: 700, z: 2.1, r: -.02 }, { focusY: 540, band: 70 }) },
      { at: 7, end: 8, draw: (c, t, l) => paperShot(c, t, { x: 2800 + l * 40, y: 720, z: 2.3, r: .015 }, { focusY: 520, band: 80, marks: x => tickMark(x, 2690, 690, 48, inv(.5, .8, l)) }) },
      { at: 8, end: 8.5, draw: (c, t, l) => { c.fillStyle = "#050505"; c.fillRect(0, 0, W, H); drawWatch(c, W * .5, H * .55, 520, t, { rot: -.15 }); blindLight(c, t, { dark: .55, period: 150, soft: 20 }); vignette(c, .6); } },
      { at: 8.5, end: 9, draw: (c, t, l) => paperShot(c, t, { x: 1455, y: 851, z: 2.6, r: -.01 }, { focusY: 540, band: 60 }) },
      { at: 9, end: 10, draw: (c, t, l) => paperShot(c, t, { x: 1700 + l * 160, y: 1528, z: 2.4, r: .01 }, { focusY: 540, band: 60, marks: x => tickMark(x, 1960, 1500, 44, inv(.5, .8, l)) }) },
      // 3 — The investigation. Every beat, then every half beat.
      { at: 10, end: 10.5, draw: (c, t, l) => paperShot(c, t, { x: 2250, y: 1528, z: 2.3 }, { focusY: 540, band: 70, marks: x => hl(x, F4.amountX[0], F4.amountX[1], F4.row1, inv(.05, .4, l)) }) },
      { at: 10.5, end: 11, draw: (c, t, l) => paperShot(c, t, { x: 1150, y: 2350, z: 2.2, r: -.01 }, { focusY: 532, band: 60, marks: x => hl(x, F4.fn1RangeX[0], F4.fn1RangeX[1], F4.fn1 - 2, inv(.05, .4, l), 34) }) },
      { at: 11, end: 11.5, draw: (c, t, l) => paperShot(c, t, { x: 2700, y: 1528, z: 2.7, r: .012 }, { focusY: 540, band: 60, marks: x => { ROW1_MARKS(x, 1); hl(x, F4.priceX[0], F4.priceX[1], F4.row1, inv(.05, .4, l)); } }) },
      { at: 11.5, end: 12, draw: (c, t, l) => paperShot(c, t, { x: 2470 - l * 80, y: 1607, z: 1.9 }, { focusY: 540, band: 60, marks: x => ROW1_MARKS(x) }) },
      { at: 12, end: 13, draw: (c, t, l) => {
        // two documents side by side: the line and its footnote
        const [a, ax] = off("half"), [b2, bx] = off("half2");
        paperShot(ax, t, { x: 2440, y: 1528, z: 1.7, dx: -60 }, { focusY: 540, band: 80, marks: x => { ROW1_MARKS(x); tickMark(x, 2560, 1490, 40, inv(.45, .75, l)); } });
        paperShot(bx, t + 3, { x: 1150, y: 2350, z: 1.7, dx: 60 }, { focusY: 532, band: 70, marks: x => { hl(x, F4.fn1RangeX[0], F4.fn1RangeX[1], F4.fn1 - 2, 1, 34); tickMark(x, 1330, 2318, 40, inv(.5, .8, l)); } });
        c.drawImage(a, W * .25, 0, W / 2, H, 0, 0, W / 2, H); c.drawImage(b2, W * .25, 0, W / 2, H, W / 2, 0, W / 2, H);
        c.fillStyle = "#0c0c0b"; c.fillRect(W / 2 - 3, 0, 6, H);
      } },
      { at: 13, end: 13.5, draw: (c, t, l) => paperShot(c, t, { x: 640, y: 2425, z: 2.2, r: -.012 }, { focusY: 540, band: 50, marks: x => hl(x, F4.fn2X[0], F4.fn2X[1], F4.fn2, inv(.05, .45, l), 34) }) },
      { at: 13.5, end: 14, draw: (c, t, l) => paperShot(c, t, { x: 3011, y: lerp(1500, 1630, ease.inOut(l / .5)), z: 2.2 }, { focusY: 540, band: 90, marks: x => ROW1_MARKS(x) }) },
      { at: 14, end: 14.25, draw: (c, t, l) => { drawMovement(c, t, { zoom: 1.2 }); vignette(c, .6); } },
      { at: 14.25, end: 14.5, draw: (c, t, l) => paperShot(c, t, { x: 2660, y: 2670, z: 2.3 }, { focusY: 540, band: 60 }) },
      { at: 14.5, end: 14.75, draw: (c, t, l) => paperShot(c, t, { x: 3150, y: 2669, z: 2.8 }, { focusY: 540, band: 60 }) },
      { at: 14.75, end: 15, draw: (c, t, l) => { wall(c, t); drawWallClock(c, 960, 540, 900, t, { startSec: 33 }); vignette(c, .6); } },
      { at: 15, end: 15.5, draw: (c, t, l) => paperShot(c, t, { x: lerp(500, 3500, ease.inOut(l / .5)), y: 1528, z: 1.7 }, { focusY: 540, band: 70, blur: 9, marks: x => ROW1_MARKS(x) }) },
      { at: 15.5, end: 16, draw: (c, t, l) => paperShot(c, t, { x: 1920, y: 1560, z: lerp(.9, .8, l * 2) }, { marks: x => ROW1_MARKS(x) }) },
      // 4 — The realization. Silence; focus racks from the line to its footnote.
      { at: 16, end: 21, draw: (c, t, l) => {
        const z = lerp(.95, 1.12, ease.sine(l / 5)), cy = lerp(1880, 1950, ease.sine(l / 5)), rk = ease.inOut(inv(1.6, 3.2, l));
        const fy = 540 + (lerp(F4.row1, F4.fn1, rk) - cy) * z;
        paperShot(c, t, { x: 1980, y: cy, z, r: -.01 }, { focusY: fy, band: 45, blur: 6, drift: 4, marks: x => { ROW1_MARKS(x); hl(x, F4.fn1RangeX[0], F4.fn1RangeX[1], F4.fn1 - 2, 1, 34); } });
      } },
      // 5 — Insidir: the same trade in the product, its link back to the Form 4, then the source itself.
      { at: S2.reveal, end: S2.link, draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pins, lerp(1500, 1700, l / .9), 2956, lerp(1.0, .92, l / .9)); vignette(c, .4); } },
      { at: S2.link, end: S2.source, draw: (c, t, l) => {
        c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
        const k = ease.inOut(inv(0, .45, l)), cx = lerp(2600, 3330, k), z = lerp(.92, 1.6, k);
        drawImageCam(c, IMG.pins, cx, 2956, z);
        const [x0, y0] = camPoint(3260, 2984, cx, 2956, z), [x1] = camPoint(3400, 2984, cx, 2956, z);
        c.strokeStyle = INK; c.lineWidth = 3; if (l > .45) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(lerp(x0, x1, ease.out(inv(.45, .65, l))), y0); c.stroke(); }
        vignette(c, .45);
      } },
      { at: S2.source, end: S2.logo, draw: (c, t, l) => { paperShot(c, t, { x: 1920, y: 1450, z: lerp(.34, .37, l / .6) }, { light: false, marks: x => ROW1_MARKS(x) }); } },
      { at: S2.logo, end: 25.01, draw: (c, t, l) => {
        c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
        drawHalftoneWordmark(c, inv(0, .7, l), ease.inOut(inv(.75, 1.0, l)), { cell: 9 });
        tracked(c, "Go straight to the source.", W / 2, 700, { size: 22, weight: 500, track: .42, alpha: ease.out(inv(.9, 1.4, l)) * .86 });
        if (t >= 24.9) blackFrame(c, 1);
      } },
    ];
    playShots(ctx, shots, t);
    caption(ctx, "Everyone read the headline.", t, 1.0, 4.7);
    caption(ctx, "Almost nobody read the filing.", t, 7.0, 9.85);
    caption(ctx, "The details change everything.", t, 17.0, 20.75, { words: false });
  },
};
