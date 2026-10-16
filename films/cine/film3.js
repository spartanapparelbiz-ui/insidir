// FILM 03 — THE PRICE OF INFORMATION. 18 s, 130 BPM (beat ~0.4615 s). Hard light, handheld, the fastest cutting.
import * as THREE from "three";
import { placeCamera, lerp, inv, ease, clamp, noise1 } from "./engine.js";
import { buildFloor } from "./sets.js";
import { buildCity, buildOffice, buildPress, buildPhone, buildTicker } from "./sets2.js";
import { Person, Crowd } from "./humans.js";
import { loadTextures } from "./textures.js";
import { gripReceiver } from "./film1.js";
import { useScene, activeShot, makeUnderline, F4px, SCRpx, slam, endCard, shutter } from "./filmkit.js";

export const duration = 18;
const B = 60 / 130, q = n => n * B;
let S = {}, shots, TX;

export async function load(e) {
  const tx = TX = await loadTextures(), R = e.renderer;
  S.floor = new THREE.Scene(); S.floorH = buildFloor(S.floor, { seed: 8, paper: 320 });
  S.crowd = new Crowd(S.floor, { count: 76, area: [-8, 8, -6, 13], seed: 33, era: 1975, actions: ["shout", "shout", "shout", "phone", "walk"], exclude: (x, z) => Math.abs(x) < .8 && z > 4 && z < 8 });
  S.trader = new Person({ seed: 7310, jacket: false, shirt: .8, suit: .1, hair: .08, tie: true }); S.trader.root.position.set(0, 0, 6.2); S.floor.add(S.trader.root);
  S.phone = new THREE.Scene(); S.phoneH = buildPhone(S.phone, R, { textures: tx });
  const p = new Person({ seed: 7311, jacket: false, shirt: .8 }); S.hand = p.arm[1].elb; p.arm[1].sho.remove(S.hand); p.curl(1, .85); S.hand.userData.wr = p.arm[1].wr; S.phone.add(S.hand);
  S.ticker = new THREE.Scene(); S.tickerH = buildTicker(S.ticker, R, { textures: tx });
  S.press = new THREE.Scene(); S.pressH = buildPress(S.press, R, { textures: tx });
  S.street = new THREE.Scene(); S.streetH = buildCity(S.street, R, { day: true, reflect: false, seed: 19 });
  S.walkers = new Crowd(S.street, { count: 40, area: [-14, 14, 9.3, 12.6], seed: 61, actions: ["walk"] });
  S.walkers.people.forEach((w, i) => { w.heading = i % 2 ? Math.PI / 2 : -Math.PI / 2; w.root.rotation.y = w.heading; w.speed = 1.3 + (i % 5) * .1; });
  S.office = new THREE.Scene(); S.off = await buildOffice(S.office, R, { mode: "dusk", desks: 12, textures: tx });
  S.res = new Person({ seed: 5120, jacket: false, shirt: .22, suit: .1, hair: .06, skin: .34, tie: false, bald: false }); S.res.root.position.set(0, 0, -2.45); S.res.root.rotation.y = Math.PI; S.office.add(S.res.root);
  S.underline = makeUnderline(S.off.form4, 2100, 2810, 1562, 7);
  const W4 = (ix, iy) => S.off.form4.localToWorld(F4px(ix, iy, 0));
  const SCR = (ix, iy) => S.off.screen.localToWorld(SCRpx(ix, iy, 0));
  const poseRes = (t, k = 1) => { S.res.reset(); S.res.sit(1); S.res.readDesk(t, k); S.res.breathe(t, .6); };
  const floorUp = (t, I = 1.5) => { S.floorH.update(t); S.crowd.update(t, I); };
  const traderUp = (t, yaw = 0, sh = 1) => { const p = S.trader; p.reset(); p.root.rotation.y = yaw; p.shout(t, { k: sh, armUp: sh, side: 1 }); };
  const office = (t, l, cam, dof, k = 1) => { poseRes(t, k); placeCamera(e.camera, { ...cam, t }); e.setDOF(...dof); };
  const sh = (scene, at, end, up, gain) => ({ scene, at, end, up, gain });
  const kinds = {
    floor: (t, l) => { floorUp(t); traderUp(t, 2.4); placeCamera(e.camera, { pos: [lerp(-2, 2, l * 2), 1.6, 9.5], look: [0, 1.5, 3], fov: 30, t, shake: 2 }); e.setDOF(4.5, .0025); },
    floorWide: (t, l) => { floorUp(t); traderUp(t, 2.4); placeCamera(e.camera, { pos: [-10, 7 - l * 2, 15], look: [0, 1.2, 2], fov: 34, t, shake: .8 }); e.setDOF(14, .0008); },
    press: (t, l) => { S.pressH.update(t, 2); placeCamera(e.camera, { pos: [-2.2, 1.7, 1.8], look: [0, 1.4, 0], fov: 30, t, shake: .8 }); e.setDOF(2.6, .003); },
    papers: (t, l) => { S.pressH.update(t, 2.2); placeCamera(e.camera, { pos: [-1.2, 3.75, -.1], look: [.8, 3.5, -1.2], fov: 28, t, shake: .6 }); e.setDOF(1.2, .004); },
    ticker: (t, l) => { S.tickerH.update(t * 1.6); placeCamera(e.camera, { pos: [.45, .26, .4], look: [.12, .13, 0], fov: 30, t, shake: .6 }); e.setDOF(.55, .004); },
    street: (t, l) => { S.walkers.update(t); S.streetH.update(t, e.camera); placeCamera(e.camera, { pos: [-1 + l * 2, .35, 8.2], look: [0, .9, 11], fov: 26, t, shake: 1 }); e.setDOF(3.2, .002); },
    tower: (t, l) => { S.streetH.update(t, e.camera); placeCamera(e.camera, { pos: [0, 1.6, 7], look: [12, 160, -20], fov: 44, roll: .2 + l * .5, t, shake: .5 }); e.setDOF(200, .0001); },
    form4: (t, l) => { poseRes(t); const c = W4(lerp(2050, 2550, l * 2), 1528); placeCamera(e.camera, { pos: [c.x + .05, c.y + .24, c.z + .16], look: [c.x, c.y, c.z], fov: 30, t, shake: .5 }); e.setDOF(.29, .006); },
    modern: (t, l) => office(t, l, { pos: [lerp(4.8, 4.2, l), 1.5, 2.2], look: [0, 1, -3], fov: 30, shake: .4 }, [6, .0012]),
    phone: (t, l) => { gripReceiver(S.phoneH, S.hand, ease.out(inv(0, .25, l))); placeCamera(e.camera, { pos: [.6, .6, .6], look: [0, .3, 0], fov: 34, t, shake: .8 }); e.setDOF(.9, .003); },
  };
  shots = [
    // 1 — Immediate chaos: three hits.
    sh("floor", 0, q(1.5), (t, l) => { floorUp(t, 1.8); traderUp(t, 2.4); placeCamera(e.camera, { pos: [lerp(-3.5, 2.5, ease.out(l / q(1.5))), 1.65, 9.2], look: [lerp(-6, 4, ease.out(l / q(1.5))), 1.5, 4], fov: 30, roll: lerp(-.06, .04, l / q(1.5)), t, shake: 2.4 }); e.setDOF(4.2, .003); }),
    sh("phone", q(1.5), q(3), (t, l) => { const k = l < .06 ? lerp(.5, 0, l / .06) : Math.max(0, Math.sin((l - .06) * 30) * .04 * Math.exp(-(l - .06) * 12)); gripReceiver(S.phoneH, S.hand, k); const s = l > .06 && l < .3 ? (1 - (l - .06) / .24) * .012 : 0; placeCamera(e.camera, { pos: [.42 + Math.sin(l * 80) * s, .42 + Math.cos(l * 70) * s, .45], look: [0, .17, 0], fov: 32, t, shake: .5 }); e.setDOF(.62, .004); }),
    sh("floor", q(3), q(4.5), (t, l) => { floorUp(t, 1.8); const turn = ease.out(inv(.04, .2, l)); traderUp(t, lerp(-1.7, 0, turn), turn > .9 ? .45 : .2); placeCamera(e.camera, { pos: [.05, 1.68, 8.0 - l * .3], look: [0, 1.55, 6.2], fov: 30, t, shake: 1.2 }); e.setDOF(1.85 - l * .3, .004); }, 1.25),
    sh("floor", q(4.5), q(6.5), (t, l) => { floorUp(t, 1.8); traderUp(t, 2.4); placeCamera(e.camera, { pos: [lerp(3.5, -3, l / q(2)), 2.6, 12], look: [0, 1.2, 3], fov: 32, roll: .05, t, shake: 2.2 }); e.setDOF(8, .0015); }),
    // 2 — Information moves.
    sh("press", q(6.5), q(7.5), kinds.press), sh("press", q(7.5), q(8.5), kinds.papers), sh("ticker", q(8.5), q(9), kinds.ticker),
    sh("street", q(9), q(10), kinds.street), sh("street", q(10), q(10.5), kinds.tower), sh("press", q(10.5), q(11), kinds.press),
    sh("office", q(11), q(12), (t, l) => {
      poseRes(t); const drop = ease.in(inv(0, .16, l)), shk = l > .16 && l < .45 ? (1 - (l - .16) / .29) * .01 : 0;
      S.off.form4.position.y = lerp(1.05, .778, drop); S.off.form4.rotation.z = .06 + (1 - drop) * .4;
      placeCamera(e.camera, { pos: [.25 + Math.sin(l * 90) * shk, .86 + Math.cos(l * 77) * shk, -2.7], look: [-.12, .8, -3.08], fov: 32, t }); e.setDOF(.5, .004);
    }, .8),
    sh("floor", q(12), q(13), kinds.floor), sh("phone", q(13), q(14), kinds.phone), sh("ticker", q(14), q(15), kinds.ticker),
    // 3 — Different eras, same information.
    sh("floor", q(15), q(16.5), kinds.floorWide, 1.4), sh("office", q(16.5), q(18), kinds.modern, 1.3),
    sh("press", q(18), q(19.5), kinds.papers), sh("office", q(19.5), q(20.5), kinds.form4, .62), sh("floor", q(20.5), q(22), kinds.floor),
    ...(() => { const order = ["floor", "modern", "press", "ticker", "form4", "street", "phone", "papers", "floorWide", "tower", "form4", "floor", "modern", "press"], list = []; let t0 = q(22), i = 0;
      while (t0 < q(26) - 1e-6) { const d = t0 < q(24) ? B / 2 : B / 4, k = order[i++ % order.length], scene = { floor: "floor", floorWide: "floor", modern: "office", form4: "office", press: "press", papers: "press", ticker: "ticker", street: "street", tower: "street", phone: "phone" }[k]; list.push(sh(scene, t0, Math.min(q(26), t0 + d), kinds[k], k === "form4" ? .62 : k === "modern" ? 1.3 : 1)); t0 += d; }
      return list; })(),
    // 4 — The contrast: silence, one researcher, one line.
    sh("office", q(26), q(33.5), (t, l) => {
      poseRes(t, .95); const d = q(33.5) - q(26), k = ease.inOut(inv(0, d, l)), c = W4(2450, 1540), tip = S.underline(ease.out(inv(1.6, 2.8, l)));
      S.off.form4.position.y = .778; S.off.form4.rotation.z = .06;
      placeCamera(e.camera, { pos: [lerp(2.6, c.x + .1, k), lerp(1.45, c.y + .3, k), lerp(-1.4, c.z + .2, k)], look: [lerp(0, c.x, k), lerp(.95, c.y, k), lerp(-3, c.z, k)], fov: lerp(32, 28, k), t, shake: .12 });
      e.setDOF(lerp(2.9, .37, k), lerp(.0015, .006, k));
    }, .7),
    // 5 — Insidir: three cuts on the product, then the mark.
    ...[[q(33.5), q(34.5), "overview"], [q(34.5), q(35.5), "filings"], [q(35.5), q(36.5), "screen"]].map(([at, end, key], i) => sh("office", at, end, (t, l) => {
      poseRes(t, .95); S.off.screenMat.map = TX[key]; S.off.hinge.rotation.x = -.28; S.off.laptop.updateMatrixWorld(true);
      const c = SCR(1920, 1080), qq = S.off.screen.getWorldQuaternion(new THREE.Quaternion()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(qq), d = lerp([.3, .26, .24][i], [.24, .2, .17][i], ease.out(inv(0, B, l)));
      placeCamera(e.camera, { pos: [c.x + n.x * d, c.y + n.y * d, c.z + n.z * d], look: [c.x, c.y, c.z], fov: 30, t, shake: .4 }); e.setDOF(d, .002);
    })),
  ];
}

export function frame(e, ov, t) {
  ov.clearRect(0, 0, 1920, 1080);
  if (t >= q(36.5)) { endCard(ov, t - q(36.5), "Know what matters.", { scatter: .4, solidAt: [.22, .4], lineAt: [.45, .8], fadeOut: [18 - q(36.5) - .3, 18 - q(36.5)] }); return; }
  const s = activeShot(shots, t); useScene(e, S[s.scene]);
  if (s.scene === "office" && !(t >= q(11) && t < q(12))) { S.off.form4.position.y = .778; S.off.form4.rotation.z = .06; }
  if (!(t >= q(33.5))) S.off.screenMat.map = TX.screen;
  e.render(t, ts => s.up(ts, ts - s.at), { contrast: 1.25, vig: .6, gain: s.gain || 1, fade: t >= q(26) && t < q(26) + .35 ? ease.out((t - q(26)) / .35) : 1 });
  slam(ov, "The world moves fast.", t, q(18), q(20.5));
  slam(ov, "Information\nmoves faster.", t, q(22), q(25.5), { size: 74 });
  shutter(ov, t, q(6.5), .12); shutter(ov, t, q(15), .12); shutter(ov, t, q(33.5), .1);
}
