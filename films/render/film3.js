// FILM 03 — THE PRICE OF INFORMATION. 18s, 130 BPM (beat ~0.4615s). The most aggressive cut of the three.
// Full frame, hard light, impacts. Silence at 12s, a calm voice, then the product hits.
"use strict";
const B3 = 60 / 130, q = n => n * B3;
const S3 = { s2: q(6.5), eras: q(15), fast: q(18), faster: q(22), quiet: q(26), reveal: q(33.5), logo: q(36.5), end: 18 };

function form4(ctx, t, cam, opts = {}) {
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
  const sh = opts.shake || { x: 0, y: 0 };
  drawImageCam(ctx, IMG.f4, cam.x, cam.y, cam.z, cam.r || 0, sh.x, sh.y);
  if (opts.marks) { ctx.save(); ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(cam.r || 0); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y); opts.marks(ctx); ctx.restore(); }
  if (opts.lamp !== false) lampPool(ctx, W * .5, H * .45, W * .8, .12);
}
function slamText(ctx, text, t, t0, t1, { size = 64, y = H / 2 } = {}) {
  if (t < t0 || t >= t1) return;
  const l = t - t0, s = lerp(1.12, 1, ease.out(inv(0, .1, l))), sh = impactShake(t, t0, 10, .25);
  ctx.save(); ctx.translate(W / 2 + sh.x, y + sh.y); ctx.scale(s, s); ctx.translate(-W / 2, -y);
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, y - size * 1.6, W, size * 3.2);
  const lines = text.split("\n");
  lines.forEach((ln, i) => tracked(ctx, ln, W / 2, y + (i - (lines.length - 1) / 2) * size * 1.3, { size, weight: 800, track: .2 }));
  ctx.restore();
}
function bigNumber(ctx, text, t, t0) {
  const l = t - t0, sh = impactShake(t, t0, 26, .4), s = lerp(1.25, 1, ease.expoOut(inv(0, .12, l)));
  ctx.fillStyle = "#e6e2d9"; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.scale(s * (1 + l * .05), s * (1 + l * .05));
  ctx.fillStyle = "#0c0c0b"; ctx.font = `800 330px ${FONT}`; ctx.letterSpacing = "-12px"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 10); ctx.restore();
  lampPool(ctx, W * .5, H * .5, W * .7, .2);
}

const FILM = {
  duration: 18,
  async load() {
    await Promise.all([loadImage("f4", "../filing/form4_full.png"), loadImage("pins", "../product2x/company_nvda_insiders_full.png"),
      loadImage("pover", "../product2x/company_nvda.png"), loadImage("pfil", "../product2x/company_nvda_filings_full.png"),
      loadFrames("A01", "../frames/A01", 134), loadFrames("A04", "../frames/A04", 134)]);
  },
  draw(ctx, t) {
    const flap = (c, t, l, lines, opts, startOff = .7) => { c.fillStyle = "#060606"; c.fillRect(0, 0, W, H); drawFlapBoard(c, lines, t, t - l - startOff, opts); };
    const phone = (c, clipT, scale = 1.12, fx = .5) => drawCover(c, FRAMESETS.A04[clamp(Math.floor(clipT * FPS), 0, 133)], scale, fx, .5);
    const newsprint = (c, t, l) => {
      // the city, printed as an old newspaper photo
      const [src, sx] = off("np"); drawCover(sx, frameOf("A01", l, 1, 2.2), 1.15, .5, .5);
      halftoneCanvas(c, src, { cell: 9 });
      c.fillStyle = "#151514"; c.fillRect(120, 70, W - 240, 6); c.fillRect(120, 88, W - 240, 2); c.fillRect(120, H - 90, W - 240, 2);
      lampPool(c, W * .45, H * .45, W * .8, .25);
    };
    const shots = [
      // 1 — Immediate chaos: three hits.
      { at: 0, end: q(1.5), draw: (c, t, l) => { const sh = impactShake(t, 0, 22, .35); c.save(); c.translate(sh.x, sh.y); flap(c, t, l, FLAP_LINES, { x: 170, y: 262, cw: 44, ch: 72, gap: 7, rowGap: 22 }, .55); c.restore(); vignette(c, .6); } },
      { at: q(1.5), end: q(3), draw: (c, t, l) => { const sh = impactShake(t, q(1.5) + .05, 30, .4); c.save(); c.translate(sh.x, sh.y); phone(c, .8 - l * 1.3, 1.18); c.restore(); vignette(c, .5); } },
      { at: q(3), end: q(4.5), draw: (c, t, l) => bigNumber(c, "1,356,000", t, q(3)) },
      { at: q(4.5), end: S3.s2, draw: (c, t, l) => { const hh = handheld(t, 3, 5); c.fillStyle = "#030303"; c.fillRect(0, 0, W, H); drawTickerTape(c, TAPE_TEXT, t, { y: 540 + hh.y, h: 240, speed: 2600, rot: -.12 + hh.r * 6, zoom: 1.2 }); lampPool(c, W * .5, H * .5, W * .6, .05); } },
      // 2 — Information moves: 0.23–0.46s shots.
      { at: S3.s2, end: q(7.5), draw: (c, t, l) => { drawPress(c, t, PRESS_LINES, { speed: 5200, angle: .1, zoom: 1.4 }); vignette(c, .55); } },
      { at: q(7.5), end: q(8.5), draw: (c, t, l) => { drawCover(c, frameOf("A01", l, 3, .5), 1.2, .5, .5); vignette(c, .5); } },
      { at: q(8.5), end: q(9), draw: (c, t, l) => { c.fillStyle = "#030303"; c.fillRect(0, 0, W, H); drawTickerTape(c, TAPE_TEXT_B, t, { y: 540, h: 260, speed: 3000, rot: .1, zoom: 1.3, dir: 1 }); } },
      { at: q(9), end: q(9.5), draw: (c, t, l) => { c.fillStyle = "#060606"; c.fillRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.scale(2.6, 2.6); c.translate(-W / 2, -H / 2); drawFlapBoard(c, FLAP_LINES.slice(1, 2), t, t - l - .45, { x: 360, y: 505, cw: 30, ch: 48, gap: 5 }); c.restore(); vignette(c, .6); } },
      { at: q(9.5), end: q(10.5), draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pfil, 1900, lerp(2000, 4300, ease.in(l / B3)), .62, 0, 0, 0); vignette(c, .5); } },
      { at: q(10.5), end: q(11), draw: (c, t, l) => { drawPress(c, t, PRESS_LINES, { speed: 6000, angle: -.2, zoom: 2.1 }); vignette(c, .6); } },
      { at: q(11), end: q(12), draw: (c, t, l) => { phone(c, .45 + l * 1.4, 1.1, .45); vignette(c, .5); } },
      { at: q(12), end: q(14), draw: (c, t, l) => {
        // a report lands on the desk
        const k = ease.in(inv(0, .16, l)), z = lerp(.62, .4, k), sh = impactShake(t, q(12) + .16, 24, .45);
        c.fillStyle = "#0a0a0a"; c.fillRect(0, 0, W, H);
        if (l < .16) { c.save(); c.filter = `blur(${(1 - k) * 10}px)`; drawImageCam(c, IMG.f4, 1920, 1500, z, -.08 + k * .05); c.restore(); }
        else drawImageCam(c, IMG.f4, 1920, 1500, .4 + (l - .16) * .02, -.03, sh.x, sh.y);
        lampPool(c, W * .5, H * .45, W * .7, .08);
      } },
      { at: q(14), end: S3.eras, draw: (c, t, l) => { c.fillStyle = "#040404"; c.fillRect(0, 0, W, H); drawWatch(c, W * .5, H * .58, 640, t, { rot: .2 }); lampPool(c, W * .5, H * .35, W * .7, .06); } },
      // 3 — Different eras, same information.
      { at: S3.eras, end: q(16.5), draw: (c, t, l) => newsprint(c, t, l) },
      { at: q(16.5), end: S3.fast, draw: (c, t, l) => form4(c, t, { x: 2300, y: 1500, z: 1.2 + l * .3, r: -.02 }) },
      { at: S3.fast, end: q(19.5), draw: (c, t, l) => { drawPress(c, t, PRESS_LINES, { speed: 4800, angle: .04, zoom: 1.6 }); vignette(c, .6); } },
      { at: q(19.5), end: q(20.5), draw: (c, t, l) => { flap(c, t, l, FLAP_LINES.slice(0, 3), { x: 130, y: 330, cw: 44, ch: 72, gap: 7, rowGap: 22 }, .9); vignette(c, .6); } },
      { at: q(20.5), end: S3.faster, draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pover, 1920 + l * 120, 1080, .62); vignette(c, .45); } },
      ...(() => {
        // accelerating: half beats, then quarter beats
        const list = [], kinds = ["tape", "newsprint", "form", "air", "flap", "list", "press", "phone", "form2", "tape2", "air2", "press2"];
        let tt = S3.faster, i = 0;
        while (tt < S3.quiet - 1e-6) {
          const d = tt < q(24) ? B3 / 2 : B3 / 4, kind = kinds[i++ % kinds.length], at = tt;
          list.push({ at, end: Math.min(at + d, S3.quiet), draw: (c, t, l) => {
            if (kind === "tape" || kind === "tape2") { c.fillStyle = "#030303"; c.fillRect(0, 0, W, H); drawTickerTape(c, kind === "tape" ? TAPE_TEXT : TAPE_TEXT_B, t, { y: 540, h: 230, speed: 3200, rot: kind === "tape" ? -.1 : .12, zoom: 1.25, dir: kind === "tape" ? -1 : 1 }); }
            else if (kind === "newsprint") newsprint(c, t, l + 1);
            else if (kind === "form" || kind === "form2") form4(c, t, kind === "form" ? { x: 2440, y: 1528, z: 1.8 } : { x: 900, y: 2360, z: 1.6 });
            else if (kind === "air" || kind === "air2") { drawCover(c, frameOf("A01", l, 3, kind === "air" ? 1.5 : 3), 1.3, .5, .5); }
            else if (kind === "flap") flap(c, t, l, FLAP_LINES.slice(2, 5), { x: 130, y: 330, cw: 44, ch: 72, gap: 7, rowGap: 22 }, .9);
            else if (kind === "list") { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pins, 1900, 3200 + l * 900, .7); }
            else if (kind === "press" || kind === "press2") drawPress(c, t, PRESS_LINES, { speed: 6000, angle: kind === "press" ? .1 : -.15, zoom: 1.5 });
            else if (kind === "phone") phone(c, .3 + l * 2, 1.3);
            vignette(c, .55);
          } });
          tt += d;
        }
        return list;
      })(),
      // 4 — The contrast: silence, one person, one line.
      { at: S3.quiet, end: S3.reveal, draw: (c, t, l) => {
        const d = S3.reveal - S3.quiet, z = lerp(.8, 1.25, ease.sine(l / d));
        c.fillStyle = "#0a0a0a"; c.fillRect(0, 0, W, H);
        drawImageDOF(c, IMG.f4, lerp(2000, 2420, ease.sine(l / d)), 1560, z, -.01, 0, 0, 540 + (1528 - 1560) * z, 70, 7);
        c.save(); c.translate(W / 2, H / 2); c.rotate(-.01); c.scale(z, z); c.translate(-lerp(2000, 2420, ease.sine(l / d)), -1560);
        penStroke(c, 2100, 1562, 2810, inv(1.4, 2.4, l), { width: 5, seed: 8 }); c.restore();
        lampPool(c, W * .52, H * .46, W * .7, .1); vignette(c, .55);
        blackFrame(c, 1 - ease.out(inv(0, .5, l)));
      } },
      // 5 — Insidir: the workflow in three cuts, then the mark.
      { at: S3.reveal, end: q(34.5), draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); const s = lerp(1.06, 1, ease.out(inv(0, .12, l))); drawImageCam(c, IMG.pover, 1920, 1080, .5 * s); } },
      { at: q(34.5), end: q(35.5), draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pfil, 1920, lerp(1300, 1900, ease.out(l / B3)), .5); } },
      { at: q(35.5), end: S3.logo, draw: (c, t, l) => { c.fillStyle = PAPER; c.fillRect(0, 0, W, H); drawImageCam(c, IMG.pins, 2000, 2956, lerp(.8, .95, l / B3)); } },
      { at: S3.logo, end: 18.01, draw: (c, t, l) => {
        c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
        const sh = impactShake(t, S3.logo, 12, .3);
        c.save(); c.translate(sh.x, sh.y); drawHalftoneWordmark(c, inv(0, .22, l), ease.out(inv(.25, .4, l)), { cell: 9, scatter: .4 }); c.restore();
        tracked(c, "Know what matters.", W / 2, 700, { size: 22, weight: 500, track: .42, alpha: ease.out(inv(.45, .8, l)) * .86 });
        blackFrame(c, ease.in(inv(18 - S3.logo - .3, 18 - S3.logo, l)));
      } },
    ];
    playShots(ctx, shots, t);
    slamText(ctx, "The world moves fast.", t, q(18), q(20.5));
    slamText(ctx, "Information\nmoves faster.", t, q(22), q(25.5), { size: 72 });
    shutter(ctx, t, S3.s2, .12); shutter(ctx, t, S3.eras, .12);
  },
};
