// Shared film plumbing: scene switching, shot playback, captions and end cards on the 2D overlay,
// and Form 4 pixel → paper-mesh coordinates (so marks land on the real filing's lines).
import * as THREE from "three";
import { clamp, inv, ease, lerp } from "./engine.js";

export function useScene(e, scene) { e.scene = scene; e.renderPass.scene = scene; e.bokeh.scene = scene; }
export function activeShot(shots, t) { for (const s of shots) if (t >= s.at && t < s.end) return s; return shots[shots.length - 1]; }

// Form 4 image (3840×3021) → local coordinates of the .43 × .34 m paper plane.
export const F4px = (ix, iy, z = .0006) => new THREE.Vector3(-.215 + ix / 3840 * .43, .17 - iy / 3021 * .34, z);
// Product screen crop (3840×2160) → local coordinates of the .318 × .179 m laptop screen.
export const SCRpx = (ix, iy, z = .0006) => new THREE.Vector3(-.159 + ix / 3840 * .318, .0895 - iy / 2160 * .179, z);

// An ink underline that grows across the paper (child of the paper mesh).
export function makeUnderline(paper, x0, x1, iy, width = 4) {
  const a = F4px(x0, iy), b = F4px(x1, iy), len = b.x - a.x;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, width / 3021 * .34 * 1.6), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: .3, transparent: true, opacity: .92 }));
  m.geometry.translate(.5, 0, 0); m.position.copy(a); m.scale.x = .0001; paper.add(m);
  return k => { m.scale.x = Math.max(.0001, len * clamp(k)); m.visible = k > 0; return paper.localToWorld(new THREE.Vector3(a.x + len * clamp(k), a.y, .004)); };
}
export function makeHighlight(paper, x0, x1, iy, h = 46) {
  const a = F4px(x0, iy), b = F4px(x1, iy), len = b.x - a.x;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, h / 3021 * .34), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .2, depthWrite: false }));
  m.geometry.translate(.5, 0, 0); m.position.copy(a).setZ(.0004); m.scale.x = .0001; paper.add(m);
  return k => { m.scale.x = Math.max(.0001, len * clamp(k)); m.visible = k > 0; };
}

// ---------- 2D overlay (type in the site's JetBrains Mono, end card from the landing page's halftone mark)
export function caption(ov, text, t, t0, t1, { y = 930, size = 34, words = false, beat = .5, band = true } = {}) {
  if (t < t0 || t >= t1) return;
  const a = ease.out(inv(t0, t0 + .35, t)) * (1 - ease.in(inv(t1 - .3, t1, t)));
  if (band) { const g = ov.createLinearGradient(0, y - 170, 0, 1080); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.55, `rgba(0,0,0,${.55 * a})`); g.addColorStop(1, `rgba(0,0,0,${.7 * a})`); ov.fillStyle = g; ov.fillRect(0, y - 170, 1920, 1080 - y + 170); }
  if (words) {
    const ws = text.split(" "), n = Math.min(ws.length, Math.floor((t - t0) / beat) + 1);
    ov.save(); ov.font = `600 ${size}px JBM`; ov.letterSpacing = `${.3 * size}px`; const wFull = ov.measureText(text.toUpperCase()).width - .3 * size; ov.restore();
    window.tracked(ov, ws.slice(0, n).join(" "), 960 - wFull / 2, y, { size, weight: 600, track: .3, align: "left", alpha: a });
  } else window.tracked(ov, text, 960, y, { size, weight: 600, track: lerp(.42, .3, ease.out(inv(t0, t0 + 1.2, t))), alpha: a });
}
export function slam(ov, text, t, t0, t1, { size = 70 } = {}) {
  if (t < t0 || t >= t1) return;
  const l = t - t0, s = lerp(1.14, 1, ease.out(inv(0, .1, l)));
  ov.save(); ov.translate(960, 540); ov.scale(s, s); ov.translate(-960, -540);
  ov.fillStyle = "rgba(0,0,0,.5)"; ov.fillRect(0, 540 - size * 1.7, 1920, size * 3.4);
  const lines = text.split("\n"); lines.forEach((ln, i) => window.tracked(ov, ln, 960, 540 + (i - (lines.length - 1) / 2) * size * 1.3, { size, weight: 800, track: .2 }));
  ov.restore();
}
export function endCard(ov, l, line, { scatter = 1, solidAt = [.62, .9], lineAt = [.75, 1.25], fadeOut = null } = {}) {
  ov.fillStyle = "#0c0c0b"; ov.fillRect(0, 0, 1920, 1080);
  window.drawHalftoneWordmark(ov, inv(0, solidAt[0], l), ease.inOut(inv(...solidAt, l)), { scatter });
  window.tracked(ov, line, 960, 700, { size: 22, weight: 500, track: .42, alpha: ease.out(inv(...lineAt, l)) * .86 });
  if (fadeOut) { ov.fillStyle = `rgba(0,0,0,${ease.in(inv(fadeOut[0], fadeOut[1], l))})`; ov.fillRect(0, 0, 1920, 1080); }
}
export function letterbox(ov, h = 138) { ov.fillStyle = "#000"; ov.fillRect(0, 0, 1920, h); ov.fillRect(0, 1080 - h, 1920, h); }
export function shutter(ov, t, t0, dur = .16) {
  const d = Math.abs(t - t0); if (d > dur / 2) return;
  const h = 540 * ease.out(1 - d / (dur / 2)); ov.fillStyle = "#000"; ov.fillRect(0, 0, 1920, h); ov.fillRect(0, 1080 - h, 1920, h);
}
