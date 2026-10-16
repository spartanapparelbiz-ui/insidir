// FILM 02 — THE ONE WHO LOOKED CLOSER. 25 s, 120 BPM (beat 0.5 s; the room clock ticks every second, on the beat).
// One protagonist, dawn, an empty open-plan office, sun through blinds.
import * as THREE from "three";
import { placeCamera, lerp, inv, ease, clamp } from "./engine.js";
import { buildOffice } from "./sets2.js";
import { Person } from "./humans.js";
import { loadTextures } from "./textures.js";
import { useScene, activeShot, makeHighlight, F4px, SCRpx, caption, endCard } from "./filmkit.js";

export const duration = 25;
let S = {}, shots;
const HERO = { seed: 202, jacket: true, shirt: .82, suit: .16, hair: .26, skin: .38, tie: true, height: 1.8, bulk: 1.02, bald: false };

export async function load(e) {
  const tx = await loadTextures(), R = e.renderer;
  S.office = new THREE.Scene(); S.off = await buildOffice(S.office, R, { mode: "dawn", desks: 18, textures: tx });
  S.hero = new Person(HERO); S.office.add(S.hero.root);
  // a forearm built from the same figure, for close shots of his hand on the page
  const twin = new Person(HERO); S.arm = twin.arm[1].elb; twin.arm[1].sho.remove(S.arm); twin.curl(1, .55); S.arm.userData.wr = twin.arm[1].wr; S.office.add(S.arm);
  const hl = (x0, x1, y, h) => makeHighlight(S.off.form4, x0, x1, y, h);
  S.hlAmount = hl(2112, 2390, 1528); S.hlPrice = hl(2596, 2794, 1528); S.hlFn = hl(998, 1306, 2346, 36); S.hlFn2 = hl(33, 1219, 2425, 36);
  S.off.form4.updateMatrixWorld(true);
  const W4 = (ix, iy, z = 0) => S.off.form4.localToWorld(F4px(ix, iy, z));
  const P2 = (u, v) => S.off.page2.localToWorld(new THREE.Vector3((u - .5) * .43, (.5 - v) * .34, 0));
  const SCR = (ix, iy) => S.off.screen.localToWorld(SCRpx(ix, iy, 0));
  const setMarks = (a, p, f, f2) => { S.hlAmount(a); S.hlPrice(p); S.hlFn(f); S.hlFn2(f2); };
  // his walk: from the far aisle to the chair, then he sits
  const walkPath = t => { const k = clamp(t / 4.3), x = lerp(1.6, .05, ease.out(k)), z = lerp(3.4, -2.35, k); return { x, z, d: k * 5.9 }; };
  const poseHero = (t, mode) => {
    const p = S.hero; p.root.visible = true; p.reset();
    if (mode === "walk") { const w = walkPath(t); p.root.position.set(w.x, 0, w.z); p.root.rotation.y = Math.PI + .15 * (1 - clamp(t / 4.3)); p.walk(w.d / 1.45, { stride: 1 - ease.in(inv(3.8, 4.3, t)) }); }
    else { p.root.position.set(0, 0, -2.45); p.root.rotation.y = Math.PI; const sk = mode === "sitting" ? ease.inOut(inv(4.3, 5.2, t)) : 1; p.sit(sk); if (mode !== "sitting") p.readDesk(t, mode === "back" ? .25 : 1, mode === "lean" ? .6 : .35); }
    p.breathe(t, .7);
  };
  const handAt = (pt, rot = [-1.1, .2, .3], lift = .045) => { S.arm.visible = true; S.arm.position.set(0, 0, 0); S.arm.rotation.set(...rot); S.arm.updateMatrixWorld(true); const palm = S.arm.userData.wr.localToWorld(new THREE.Vector3(0, -.07, .01)); S.arm.position.add(pt.clone().add(new THREE.Vector3(0, lift, 0)).sub(palm)); };
  const noHand = () => (S.arm.visible = false);
  const readCam = (t, ix, iy, { h = .3, back = .2, side = .06, dz = 0 } = {}) => { S.hero.root.visible = false; const c = W4(ix, iy); placeCamera(e.camera, { pos: [c.x + side, c.y + h, c.z + back + dz], look: [c.x, c.y, c.z], fov: 30, t, shake: .15 }); e.setDOF(Math.hypot(h, back, side), .005); };
  shots = [
    // 1 — The empty office at dawn. He walks the length of it to one desk.
    { at: 0, end: 2.5, gain: 1.0, up: (t, l) => { poseHero(t, "walk"); noHand(); const w = walkPath(t); placeCamera(e.camera, { pos: [w.x + .6, 1.35, w.z + 3.6], look: [w.x - .1, 1.25, w.z - 2], fov: 34, t, shake: .35 }); e.setDOF(3.7, .0015); } },
    { at: 2.5, end: 3, gain: 1.0, up: (t, l) => { poseHero(t, "walk"); noHand(); const c = S.off.clock.position; placeCamera(e.camera, { pos: [c.x + .75, c.y - .05, c.z + .25], look: [c.x, c.y, c.z], fov: 28, t, shake: .1 }); e.setDOF(.78, .003); } },
    { at: 3, end: 5, gain: 1.0, up: (t, l) => { poseHero(t, t < 4.3 ? "walk" : "sitting"); noHand(); placeCamera(e.camera, { pos: [lerp(3.4, 2.9, l / 2), 1.3, lerp(-1, -1.6, l / 2)], look: [0, 1.0, -2.8], fov: 32, t, shake: .3 }); e.setDOF(3.6, .0015); } },
    // 2 — The document.
    { at: 5, end: 6.5, up: (t, l) => { poseHero(t, "read"); noHand(); placeCamera(e.camera, { pos: [-1.9, 1.15, -1.6], look: [0, .95, -2.9], fov: 30, t, shake: .25 }); e.setDOF(2.3, .002); } },
    { at: 6.5, end: 8, gain: .68, up: (t, l) => { poseHero(t, "read"); const k = l / 1.5; noHand(); readCam(t, lerp(500, 1400, k), lerp(700, 850, k), { h: .32, back: .22 }); } },
    { at: 8, end: 9, gain: 1.15, up: (t, l) => { poseHero(t, "read"); noHand(); placeCamera(e.camera, { pos: [.9, .55, -1.2], look: [0, 1.05, -2.6], fov: 34, t, shake: .2 }); e.setDOF(1.75, .002); } },
    { at: 9, end: 10, gain: .68, up: (t, l) => { poseHero(t, "read"); noHand(); const c = W4(1900, 1500); placeCamera(e.camera, { pos: [c.x - .05, c.y + .3, c.z + .2], look: [c.x, c.y, c.z], fov: 30, t, shake: .15 }); e.setDOF(.36 + lerp(-.03, .05, l), .006); } },
    // 3 — The investigation: the line, then its footnote, then the line again.
    { at: 10, end: 10.5, gain: .68, up: (t, l) => { poseHero(t, "lean"); setMarks(ease.out(inv(.05, .45, l)), 0, 0, 0); noHand(); readCam(t, 2250, 1528, { h: .26, back: .17 }); } },
    { at: 10.5, end: 11, gain: .68, up: (t, l) => { poseHero(t, "lean"); setMarks(1, 0, ease.out(inv(.05, .45, l)), 0); noHand(); readCam(t, 1150, 2346, { h: .25, back: .16, side: -.04 }); } },
    { at: 11, end: 11.5, up: (t, l) => { poseHero(t, "lean"); setMarks(1, 0, 1, 0); noHand(); placeCamera(e.camera, { pos: [1.3, 1.25, -2.3], look: [0, 1.05, -2.75], fov: 30, t, shake: .25 }); e.setDOF(1.35, .002); } },
    { at: 11.5, end: 12, gain: .68, up: (t, l) => { poseHero(t, "lean"); setMarks(1, ease.out(inv(.05, .45, l)), 1, 0); noHand(); readCam(t, 2650, 1528, { h: .24, back: .16 }); } },
    { at: 12, end: 12.5, gain: 1.2, up: (t, l) => { poseHero(t, "lean"); setMarks(1, 1, 1, 0); noHand(); placeCamera(e.camera, { pos: [-5.5, .4, 4.5], look: [0, 1.2, -2.6], fov: 34, t, shake: .2 }); e.setDOF(8, .001); } },
    { at: 12.5, end: 13, gain: .68, up: (t, l) => { poseHero(t, "lean"); setMarks(1, 1, 1, ease.out(inv(.05, .45, l))); noHand(); readCam(t, 620, 2425, { h: .24, back: .15 }); } },
    { at: 13, end: 13.5, up: (t, l) => { poseHero(t, "back"); S.hero.turnHead(.5 * ease.out(inv(0, .4, l))); setMarks(1, 1, 1, 1); noHand(); placeCamera(e.camera, { pos: [-1.6, 1.2, -1.9], look: [0, 1.2, -2.6], fov: 30, t, shake: .2 }); e.setDOF(1.8, .002); } },
    ...[[13.5, 2250, 1528], [13.75, 1150, 2346], [14, 2700, 1528], [14.25, 3011, 1567], [14.5, 1455, 851], [14.75, 255, 685], [15, 2250, 1528], [15.25, 1150, 2346], [15.5, 2700, 1528], [15.75, 1900, 1900]].map(([at, ix, iy], i) => ({
      at, end: at + .25, gain: .68, up: (t, l) => { poseHero(t, "lean"); setMarks(1, 1, 1, 1); noHand(); readCam(t, ix, iy, { h: i % 2 ? .22 : .3, back: i % 2 ? .14 : .2, side: (i % 2 ? -1 : 1) * .05 }); },
    })),
    // 4 — The realization. Silence. From behind his shoulder, the camera finds the line.
    { at: 16, end: 21, gain: .72, up: (t, l) => {
      poseHero(t, "lean"); setMarks(1, 1, 1, 1); noHand();
      const k = ease.sine(l / 5), c = W4(lerp(1900, 2420, k), lerp(1650, 1528, k));
      placeCamera(e.camera, { pos: [lerp(1.15, c.x + .34, k), lerp(1.7, c.y + .27, k), lerp(-2.05, c.z + .06, k)], look: [c.x, c.y, c.z], fov: lerp(34, 28, k), t, shake: .12 });
      e.setDOF(lerp(1.1, .38, k), lerp(.003, .006, k));
    } },
    // 5 — Insidir: he opens the laptop; the same trade, then the source.
    { at: 21, end: 23.3, up: (t, l) => {
      poseHero(t, "read"); setMarks(1, 1, 1, 1); noHand();
      S.off.hinge.rotation.x = lerp(1.62, -.28, ease.inOut(inv(0, .75, l))); S.off.screenMat.color.setScalar(lerp(0, 1.15, ease.in(inv(.5, .9, l))));
      S.off.laptop.updateMatrixWorld(true);
      const c = SCR(1920, 1080), q = S.off.screen.getWorldQuaternion(new THREE.Quaternion()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), k = ease.inOut(inv(.7, 2.2, l)), d = lerp(.7, .19, k);
      placeCamera(e.camera, { pos: [c.x + n.x * d + .12 * (1 - k), c.y + n.y * d + .1 * (1 - k), c.z + n.z * d], look: [c.x, c.y, c.z], fov: 30, t, shake: .1 });
      e.setDOF(d, .003);
    } },
  ];
}

export function frame(e, ov, t) {
  ov.clearRect(0, 0, 1920, 1080);
  if (t >= 23.3) { endCard(ov, t - 23.3, "Go straight to the source.", { scatter: .6, solidAt: [.7, 1.0], lineAt: [.9, 1.4] }); if (t >= 24.9) { ov.fillStyle = "#000"; ov.fillRect(0, 0, 1920, 1080); } return; }
  const s = activeShot(shots, t); useScene(e, S.office);
  S.off.setClock(t);
  const fade = t < 1 ? ease.inOut(t) : 1;
  e.render(t, ts => s.up(ts, ts - s.at), { fade, contrast: 1.1, vig: .6, gain: s.gain || 1 });
  caption(ov, "Everyone read the headline.", t, 1.0, 4.7, { words: true });
  caption(ov, "Almost nobody read the filing.", t, 7.0, 9.85, { words: true });
  caption(ov, "The details change everything.", t, 17.0, 20.75);
}
