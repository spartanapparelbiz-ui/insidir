// FILM 01 — THE CITY NEVER SLEEPS. 20 s, 128 BPM (beat 0.46875 s), 2.39 letterbox, night, rain.
import * as THREE from "three";
import { placeCamera, lerp, inv, ease, clamp, noise1 } from "./engine.js";
import { buildFloor } from "./sets.js";
import { buildCity, buildSedan, buildOffice, buildPress, buildPhone, buildTicker } from "./sets2.js";
import { Person, Crowd } from "./humans.js";
import { loadTextures } from "./textures.js";
import { useScene, activeShot, makeUnderline, F4px, SCRpx, caption, endCard, letterbox, shutter } from "./filmkit.js";

export const duration = 20;
const B = 60 / 128, b = n => n * B;
let S = {}, shots;

function handRig(seed) {
  const p = new Person({ seed, jacket: true, suit: .08, shirt: .9 });
  const elb = p.arm[1].elb; p.arm[1].sho.remove(elb); p.curl(1, .8); elb.userData.wr = p.arm[1].wr; return elb;
}
// Receiver at lift k; the forearm is placed so the palm closes over it.
export function gripReceiver(phoneH, elb, k, rot = [-.35, .3, .5]) {
  phoneH.setReceiver(k); phoneH.receiver.updateMatrixWorld(true);
  elb.position.set(0, 0, 0); elb.rotation.set(rot[0] + k * .4, rot[1], rot[2]); elb.updateMatrixWorld(true);
  const palm = elb.userData.wr.localToWorld(new THREE.Vector3(0, -.05, .01)), want = phoneH.receiver.position.clone().add(new THREE.Vector3(0, .04, 0));
  elb.position.add(want.sub(palm));
}

export async function load(e) {
  const tx = await loadTextures(), R = e.renderer;
  // city + sedan
  S.city = new THREE.Scene(); S.cityH = buildCity(S.city, R); S.car = buildSedan(); S.city.add(S.car);
  // trading floor
  S.floor = new THREE.Scene(); S.floorH = buildFloor(S.floor, { seed: 3 });
  S.crowd = new Crowd(S.floor, { count: 64, area: [-8, 8, -7, 12], seed: 12, actions: ["shout", "shout", "phone", "stand", "walk", "shout"], exclude: (x, z) => Math.abs(x) < 1 && z > 2 });
  S.trader = new Person({ seed: 4401, jacket: true, suit: .1, shirt: .88 }); S.trader.root.position.set(.9, 0, 6); S.trader.root.rotation.y = -2.6; S.floor.add(S.trader.root);
  // phone, ticker, press
  S.phone = new THREE.Scene(); S.phoneH = buildPhone(S.phone, R, { textures: tx }); S.hand = handRig(77); S.phone.add(S.hand);
  S.ticker = new THREE.Scene(); S.tickerH = buildTicker(S.ticker, R, { textures: tx });
  S.press = new THREE.Scene(); S.pressH = buildPress(S.press, R, { textures: tx });
  // night office with the researcher
  S.office = new THREE.Scene(); S.off = await buildOffice(S.office, R, { mode: "night", textures: tx });
  S.res = new Person({ seed: 9001, jacket: false, shirt: .16, suit: .08, hair: .06, tie: false }); S.res.root.position.set(0, 0, -2.45); S.res.root.rotation.y = Math.PI; S.office.add(S.res.root);
  S.underline = makeUnderline(S.off.form4, 2100, 2810, 1562, 7);
  S.off.form4.updateMatrixWorld(true);

  const carX = t => -60 + t * 9;
  const poseRes = (t, k = 1) => { const p = S.res; p.reset(); p.sit(1); p.readDesk(t, k); p.breathe(t, .6); };
  const officeWorld = (ix, iy) => S.off.form4.localToWorld(F4px(ix, iy, 0));
  const screenWorld = (ix, iy, z = 0) => S.off.screen.localToWorld(SCRpx(ix, iy, z));
  shots = [
    // 1 — Manhattan at night: aerial descent onto the sedan, then alongside it in the rain
    { at: 0, end: b(5), scene: "city", dof: [80, .00005], up: (t, l) => {
      const k = ease.inOut(l / b(5)), cx = carX(t);
      S.car.position.set(cx, 0, -3); S.car.userData.spin(t);
      const cam = { pos: [lerp(cx - 190, cx - 26, k), lerp(150, 14, k), lerp(14, 6, k)], look: [lerp(cx + 60, cx + 4, k), lerp(20, .5, k), -3], fov: lerp(44, 36, k), t, shake: .3 };
      placeCamera(e.camera, cam); S.cityH.update(t, e.camera);
    } },
    { at: b(5), end: b(8), scene: "city", dofFn: () => [3.4, .0018], up: (t, l) => {
      const cx = carX(t); S.car.position.set(cx, 0, -3); S.car.userData.spin(t);
      placeCamera(e.camera, { pos: [cx + 4.2 + l * .3, 1.05, 4.6], look: [cx + .6, .7, -3], fov: 30, t, shake: .6 }); S.cityH.update(t, e.camera);
    } },
    // 2 — The financial machine, one shot per beat
    { at: b(8), end: b(9), scene: "phone", dof: [.62, .004], up: (t, l) => {
      const k = ease.out(inv(.12, .42, l)); gripReceiver(S.phoneH, S.hand, k);
      placeCamera(e.camera, { pos: [.6, .5 + k * .25, .6], look: [0, .22 + k * .3, 0], fov: 34, t, shake: .4 });
    } },
    { at: b(9), end: b(10), scene: "floor", dof: [3.2, .002], up: (t, l) => {
      S.floorH.update(t); S.crowd.update(t, 1.2); S.trader.reset(); S.trader.shout(t, { armUp: 1 });
      placeCamera(e.camera, { pos: [lerp(-.2, .1, l / B), 1.55, lerp(10.5, 9.4, l / B)], look: [.4, 1.5, 4], fov: 30, t, shake: 1.2 });
    } },
    { at: b(10), end: b(11), scene: "ticker", dof: [.55, .004], up: (t, l) => { S.tickerH.update(t); placeCamera(e.camera, { pos: [.42 - l * .08, .28, .42], look: [.12, .14, 0], fov: 30, t, shake: .3 }); } },
    { at: b(11), end: b(12), scene: "press", dof: [2.6, .003], up: (t, l) => { S.pressH.update(t, 1.4); placeCamera(e.camera, { pos: [-2.8 + l * .5, 1.9, 2.2], look: [0, 1.4, 0], fov: 34, t, shake: .5 }); } },
    { at: b(12), end: b(13), scene: "floor", gain: 1.5, dof: [12, .001], up: (t, l) => { S.floorH.update(t); S.crowd.update(t, 1.2); S.trader.reset(); S.trader.shout(t); placeCamera(e.camera, { pos: [-9 + l * .8, 9, 16], look: [0, 1, 2], fov: 36, t, shake: .4 }); } },
    { at: b(13), end: b(14), scene: "floor", dof: [2.1, .003], up: (t, l) => { S.floorH.update(t); S.crowd.update(t, 1.2); S.trader.reset(); S.trader.shout(t, { armUp: 1, side: -1 }); placeCamera(e.camera, { pos: [.3, 1.62, 8.1], look: [.9, 1.6, 6], fov: 32, t, shake: 1 }); } },
    { at: b(14), end: b(15), scene: "press", dof: [1.4, .004], up: (t, l) => { S.pressH.update(t, 1.6); placeCamera(e.camera, { pos: [-1.4, 3.7, -.2], look: [.6, 3.5, -1.2], fov: 30, t, shake: .4 }); } },
    { at: b(15), end: b(16), scene: "ticker", dof: [.3, .005], up: (t, l) => { S.tickerH.update(t); placeCamera(e.camera, { pos: [.5, .1, .22], look: [.38, .04, 0], fov: 28, t, shake: .3 }); } },
    { at: b(16), end: b(16.5), scene: "floor", dof: [5, .002], up: (t, l) => { S.floorH.update(t); S.crowd.update(t, 1.3); S.trader.reset(); S.trader.shout(t); placeCamera(e.camera, { pos: [2, .5, 11], look: [0, 2.6, 3], fov: 30, t, shake: 1 }); } },
    { at: b(16.5), end: b(17), scene: "phone", dof: [.62, .004], up: (t, l) => {
      const k = 1 - ease.in(inv(0, .14, l)); gripReceiver(S.phoneH, S.hand, k);
      placeCamera(e.camera, { pos: [-.5, .45, .5], look: [0, .2, 0], fov: 32, t, shake: .4 });
    } },
    // 3 — Someone is still working: a lone desk lamp high above the city
    { at: b(17), end: b(22), scene: "office", gain: 1.7, dofFn: () => [lerp(7.5, 4.2, ease.inOut(inv(b(17), b(22), e.__t))), .0012], up: (t, l) => {
      poseRes(t); const k = ease.inOut(l / (b(22) - b(17)));
      placeCamera(e.camera, { pos: [lerp(5.5, 2.4, k), lerp(2.1, 1.55, k), lerp(5.5, 1.2, k)], look: [0, .95, -3.2], fov: 32, t, shake: .25 });
    } },
    { at: b(22), end: b(25), scene: "office", gain: .72, dofFn: () => [1.1, .004], up: (t, l) => {
      poseRes(t); const k = ease.inOut(l / (b(25) - b(22)));
      placeCamera(e.camera, { pos: [lerp(1.0, .9, k), lerp(1.05, 1.0, k), lerp(-3.05, -2.95, k)], look: [-.15, .8, -3.05], fov: 32, t, shake: .2 });
    } },
    { at: b(25), end: b(28), scene: "office", gain: .62, dof: [.42, .006], up: (t, l) => {
      poseRes(t); const k = l / (b(28) - b(25)), p = officeWorld(lerp(400, 3000, k), lerp(700, 1528, k));
      S.off.pen.position.copy(S.off.hero.d.worldToLocal(p.clone().add(new THREE.Vector3(0, .012, .01)))); S.off.pen.rotation.set(0, .5, .25);
      placeCamera(e.camera, { pos: [p.x + .18, p.y + .26, p.z + .3], look: [p.x, p.y, p.z], fov: 30, t, shake: .2 });
    } },
    // 4 — The discovery: silence; the pen underlines the line
    { at: b(28), end: b(34), scene: "office", gain: .6, dof: [.36, .006], up: (t, l) => {
      poseRes(t, .9); const k = ease.out(inv(.5, 1.6, l)), tip = S.underline(k);
      S.off.pen.position.copy(S.off.hero.d.worldToLocal(tip.clone().add(new THREE.Vector3(0, .01, .006)))); S.off.pen.rotation.set(0, .5, .35);
      const c = officeWorld(2450, 1540), z = ease.sine(l / (b(34) - b(28)));
      placeCamera(e.camera, { pos: [c.x + .08, c.y + lerp(.36, .26, z), c.z + lerp(.24, .16, z)], look: [c.x, c.y, c.z], fov: 30, t, shake: .15 });
    } },
    { at: b(34), end: b(36), scene: "office", dofFn: () => [lerp(.3, 2.2, ease.inOut(inv(b(34), b(36), e.__t))), .002], up: (t, l) => {
      poseRes(t, .9); S.underline(1); const k = ease.inOut(l / (b(36) - b(34))), c = officeWorld(2450, 1540);
      placeCamera(e.camera, { pos: [lerp(c.x + .08, 1.6, k), lerp(c.y + .26, 1.7, k), lerp(c.z + .16, -1.2, k)], look: [lerp(c.x, 0, k), lerp(c.y, .85, k), lerp(c.z, -3.1, k)], fov: 32, t });
    } },
    // 5 — Insidir: the same trade, on the laptop
    { at: b(36), end: b(39), scene: "office", dof: [.3, .003], up: (t, l) => {
      poseRes(t, .9); S.underline(1); const k = ease.inOut(inv(0, 1.2, l)), c = screenWorld(1920, 1080, 0), n = new THREE.Vector3(0, 0, 1).applyQuaternion(S.off.screen.getWorldQuaternion(new THREE.Quaternion()));
      const d = lerp(.55, .2, k), side = new THREE.Vector3(1, 0, 0).applyQuaternion(S.off.screen.getWorldQuaternion(new THREE.Quaternion()));
      placeCamera(e.camera, { pos: [c.x + n.x * d + side.x * .1 * (1 - k), c.y + n.y * d + .05 * (1 - k), c.z + n.z * d + side.z * .1 * (1 - k)], look: [c.x, c.y, c.z], fov: 30, t });
      e.setDOF(d, .003);
    } },
  ];
}

export function frame(e, ov, t) {
  ov.clearRect(0, 0, 1920, 1080);
  if (t >= b(39)) { endCard(ov, t - b(39), "Look closer.", { fadeOut: [1.45, 1.72] }); return; }
  const s = activeShot(shots, t); useScene(e, S[s.scene]); e.__t = t;
  e.setDOF(...(s.dofFn ? s.dofFn() : s.dof));
  const fade = t < 1 ? ease.inOut(t) : 1;
  e.render(t, ts => s.up(ts, ts - s.at), { fade, contrast: 1.18, vig: .7, gain: s.gain || 1 });
  caption(ov, "The information was always there.", t, b(28) + .9, b(36) - .05, { y: 872 });
  shutter(ov, t, b(8)); shutter(ov, t, b(17));
  letterbox(ov);
}
