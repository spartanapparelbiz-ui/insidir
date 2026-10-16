// Articulated, clothed human figure with procedural motion (walk, shout, phone, sit/read, slam, turn).
// Units are metres; +Z is the figure's forward direction.
import * as THREE from "three";
import { rng, noise1, clamp, lerp, ease } from "./engine.js";

const matCache = new Map();
function mat(tone, rough = .8, extra = {}) {
  const key = tone + "|" + rough + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(tone, tone, tone), roughness: rough, metalness: 0, ...extra }));
  return matCache.get(key);
}
const G = {
  cap: (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s),
  sph: (r, s = 18) => new THREE.SphereGeometry(r, s, Math.round(s * .75)),
  cyl: (r0, r1, h, s = 14) => new THREE.CylinderGeometry(r0, r1, h, s),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
};
function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; return o; }
function joint(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export class Person {
  constructor(opts = {}) {
    const r = rng(opts.seed || 1);
    const o = this.o = {
      height: 1.72 + r() * .14, bulk: .92 + r() * .22,
      suit: opts.suit ?? [.06, .1, .16, .22, .3][Math.floor(r() * 5)], shirt: opts.shirt ?? (.72 + r() * .18), skin: opts.skin ?? (.3 + r() * .14),
      hair: opts.hair ?? (r() < .7 ? .05 + r() * .1 : .45 + r() * .3), jacket: opts.jacket ?? r() < .75, tie: opts.tie ?? r() < .8,
      bald: opts.bald ?? false, hat: opts.hat ?? false, sleeves: opts.sleeves ?? "long", ...opts,
    };
    const s = o.height / 1.78, b = o.bulk;
    this.root = new THREE.Group(); this.root.scale.setScalar(s);
    const suitM = mat(o.suit, .86), shirtM = mat(o.shirt, .72), skinM = mat(o.skin, .5), hairM = mat(o.hair, .65), shoeM = mat(.04, .35), tieM = mat(Math.max(0, o.suit - .03), .6);
    const torsoM = o.jacket ? suitM : shirtM, armM = o.jacket ? suitM : shirtM;
    // pelvis / hips
    this.hips = joint(this.root, 0, .96, 0);
    this.hips.add(mesh(G.cap(.155 * b, .12), mat(Math.max(.03, o.suit - .02), .88))).rotation.z = Math.PI / 2;
    this.hips.children[0].scale.set(1, 1, .75);
    // spine → chest
    this.spine = joint(this.hips, 0, .06, 0);
    const prof = [[.0, -.06], [.15, -.06], [.165, .04], [.15, .16], [.158, .28], [.185, .4], [.17, .47], [.09, .52], [0, .53]].map(([x, y]) => new THREE.Vector2(x * b, y));
    const torso = mesh(new THREE.LatheGeometry(prof, 24), torsoM); torso.scale.set(1.12, 1, .68); this.spine.add(torso);
    if (o.jacket) { const skirt = mesh(G.cyl(.168 * b, .185 * b, .26, 24), suitM); skirt.geometry = new THREE.CylinderGeometry(.165 * b, .19 * b, .26, 24, 1, true); skirt.material = suitM; skirt.scale.set(1.12, 1, .72); skirt.position.y = -.13; this.spine.add(skirt); }
    if (o.jacket) { // open jacket: shirt front + tie
      const front = mesh(G.box(.13 * b, .34, .02), shirtM, false); front.position.set(0, .31, .118 * b); this.spine.add(front);
      if (o.tie) { const tie = mesh(G.box(.045, .3, .015), tieM, false); tie.position.set(0, .3, .13 * b); this.spine.add(tie); }
      for (const sd of [-1, 1]) { const lap = mesh(G.box(.06, .3, .015), suitM, false); lap.position.set(sd * .062 * b, .31, .125 * b); lap.rotation.z = sd * -.22; this.spine.add(lap); }
    } else if (o.tie) { const tie = mesh(G.box(.045, .32, .015), tieM, false); tie.position.set(0, .3, .122 * b); this.spine.add(tie); }
    this.chest = joint(this.spine, 0, .42, 0);
    const sh = mesh(G.cap(.07 * b, .3 * b), torsoM); sh.rotation.z = Math.PI / 2; sh.position.y = -.02; this.chest.add(sh);
    // neck + head
    this.neck = joint(this.chest, 0, .05, .01);
    this.neck.add(mesh(G.cyl(.052, .06, .14), skinM)).position.y = .05;
    const collar = mesh(G.cyl(.065, .07, .05), shirtM); collar.position.y = .0; this.neck.add(collar);
    this.head = joint(this.neck, 0, .13, .01);
    const skull = mesh(G.sph(.1, 24), skinM); skull.scale.set(.93, 1.15, 1.02); skull.position.y = .1; this.head.add(skull);
    const nose = mesh(new THREE.ConeGeometry(.018, .05, 10), skinM); nose.rotation.x = Math.PI / 2 + .25; nose.position.set(0, .09, .108); this.head.add(nose);
    for (const sd of [-1, 1]) {
      const ear = mesh(G.sph(.025, 10), skinM); ear.scale.set(.5, 1, .8); ear.position.set(sd * .094, .09, 0); this.head.add(ear);
      const eye = mesh(G.sph(.012, 10), mat(.02, .2)); eye.position.set(sd * .036, .118, .088); this.head.add(eye);
      const brow = mesh(G.box(.04, .009, .02), hairM, false); brow.position.set(sd * .037, .142, .094); brow.rotation.z = sd * -.08; this.head.add(brow);
    }
    this.jaw = joint(this.head, 0, .06, .02);
    const jawM = mesh(G.sph(.075, 16), skinM); jawM.scale.set(1, .55, 1); jawM.position.set(0, -.012, .035); this.jaw.add(jawM);
    this.mouth = mesh(G.sph(.026, 12), mat(.015, .9)); this.mouth.scale.set(1.2, .2, .5); this.mouth.position.set(0, .045, .1); this.head.add(this.mouth);
    if (!o.bald) { const hair = mesh(G.sph(.106, 24), hairM); hair.scale.set(.96, .95, 1.06); hair.position.set(0, .135, -.012); this.head.add(hair); }
    if (o.hat) { const brim = mesh(G.cyl(.17, .17, .012, 24), mat(.05, .7)); brim.position.y = .2; this.head.add(brim); const crown = mesh(G.cyl(.1, .11, .11, 20), mat(.05, .7)); crown.position.y = .26; this.head.add(crown); }
    // arms
    this.arm = {};
    for (const sd of [-1, 1]) {
      const sho = joint(this.chest, sd * .19 * b, -.04, 0);
      sho.add(mesh(G.sph(.062 * b, 14), armM));
      const up = mesh(G.cap(.052 * b, .22), armM); up.position.y = -.14; sho.add(up);
      const elb = joint(sho, 0, -.29, 0);
      elb.add(mesh(G.sph(.047 * b, 12), armM));
      const fo = mesh(G.cap(.045 * b, .2), armM); fo.position.y = -.12; elb.add(fo);
      const cuff = mesh(G.cyl(.042, .042, .03), shirtM); cuff.position.y = -.245; elb.add(cuff);
      const wr = joint(elb, 0, -.265, 0);
      const hand = this.makeHand(skinM, sd); wr.add(hand.group);
      this.arm[sd] = { sho, elb, wr, hand };
    }
    // legs
    this.leg = {};
    const trouM = mat(Math.max(.03, o.suit - .02), .88);
    for (const sd of [-1, 1]) {
      const hip = joint(this.hips, sd * .095 * b, -.02, 0);
      const th = mesh(G.cap(.082 * b, .32), trouM); th.position.y = -.22; hip.add(th);
      const knee = joint(hip, 0, -.44, 0);
      knee.add(mesh(G.sph(.062 * b, 12), trouM));
      const sn = mesh(G.cap(.066 * b, .32), trouM); sn.position.y = -.21; knee.add(sn);
      const ank = joint(knee, 0, -.44, 0);
      const shoe = mesh(G.box(.095, .07, .26), shoeM); shoe.position.set(0, -.035, .06); ank.add(shoe);
      const toe = mesh(G.cyl(.047, .047, .095, 12), shoeM); toe.rotation.z = Math.PI / 2; toe.position.set(0, -.035, .19); ank.add(toe);
      this.leg[sd] = { hip, knee, ank };
    }
    this.seed = opts.seed || 1;
  }
  makeHand(m, sd) {
    const group = new THREE.Group();
    const palm = mesh(G.box(.07, .085, .028), m); palm.position.y = -.045; group.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const base = joint(group, (i - 1.5) * .018 * sd, -.09, 0);
      const f1 = mesh(G.cap(.0085, .03, 6), m); f1.position.y = -.02; base.add(f1);
      const mid = joint(base, 0, -.04, 0);
      const f2 = mesh(G.cap(.008, .026, 6), m); f2.position.y = -.017; mid.add(f2);
      fingers.push([base, mid]);
    }
    const tb = joint(group, .036 * sd, -.035, .01);
    const t1 = mesh(G.cap(.01, .035, 6), m); t1.position.y = -.025; tb.add(t1); tb.rotation.z = sd * .6;
    return { group, fingers, thumb: tb };
  }
  // ----- posing -----
  curl(sd, k) { const h = this.arm[sd].hand; for (const [b, m] of h.fingers) { b.rotation.x = k * 1.3; m.rotation.x = k * 1.5; } h.thumb.rotation.x = k * .9; }
  reset() {
    for (const o of [this.hips, this.spine, this.chest, this.neck, this.head, this.jaw]) o.rotation.set(0, 0, 0);
    for (const sd of [-1, 1]) { const a = this.arm[sd], l = this.leg[sd]; for (const j of [a.sho, a.elb, a.wr, l.hip, l.knee, l.ank]) j.rotation.set(0, 0, 0); a.sho.rotation.z = sd * .08; this.curl(sd, .25); }
    this.hips.position.y = .96; this.mouth.scale.y = .2;
  }
  breathe(t, k = 1) {
    const b = Math.sin(t * 1.6 + this.seed) * .012 * k;
    this.chest.rotation.x = b; this.head.rotation.x += b * .5;
    this.head.rotation.y += noise1(t * .35, this.seed) * .12 * k;
  }
  walk(phase, { stride = 1, arms = 1 } = {}) {
    const p = phase * Math.PI * 2;
    for (const sd of [-1, 1]) {
      const q = p + (sd > 0 ? 0 : Math.PI), L = this.leg[sd];
      L.hip.rotation.x = -Math.sin(q) * .42 * stride;
      L.knee.rotation.x = Math.max(0, Math.sin(q - 1.4)) * 1.0 * stride + .08;
      L.ank.rotation.x = Math.sin(q - .6) * .2 * stride;
      const A = this.arm[sd];
      A.sho.rotation.x = Math.sin(q) * .36 * arms; A.elb.rotation.x = -.25 - Math.max(0, Math.sin(q)) * .3 * arms;
    }
    this.hips.position.y = .96 - Math.abs(Math.cos(p)) * .025 * stride;
    this.hips.rotation.y = Math.sin(p) * .08 * stride; this.chest.rotation.y = -Math.sin(p) * .12 * stride;
    this.hips.rotation.z = Math.sin(p) * .03 * stride;
  }
  shout(t, { k = 1, armUp = 1, side = 1 } = {}) {
    const s = this.seed, beat = Math.max(0, Math.sin(t * 7 + s));
    this.jaw.rotation.x = (.15 + .35 * beat) * k; this.mouth.scale.y = (.4 + 1.6 * beat) * k + .2;
    this.head.rotation.x += -.25 * k + Math.sin(t * 7 + s) * .06 * k;
    this.spine.rotation.x += .1 * k + Math.sin(t * 3.5 + s) * .05 * k;
    const A = this.arm[side];
    A.sho.rotation.x = lerp(0, -2.7, armUp) + Math.sin(t * 7 + s) * .25 * armUp;
    A.sho.rotation.z = side * (.15 + .25 * armUp);
    A.elb.rotation.x = -.35 - Math.max(0, Math.sin(t * 7 + s + 1)) * .5 * armUp;
    this.curl(side, Math.sin(t * 5 + s) > .3 ? .05 : .9);
    const B = this.arm[-side]; B.sho.rotation.x = -.4 * k; B.elb.rotation.x = -1.1 * k; this.curl(-side, .7);
  }
  phoneAtEar(side = -1, k = 1) {
    const A = this.arm[side];
    A.sho.rotation.x = -1.0 * k; A.sho.rotation.z = side * -.55 * k; A.elb.rotation.x = -2.25 * k; A.wr.rotation.y = side * .6 * k; this.curl(side, .8 * k);
    this.head.rotation.z += side * -.15 * k;
  }
  sit(k = 1) {
    for (const sd of [-1, 1]) { const L = this.leg[sd]; L.hip.rotation.x = -1.5 * k; L.knee.rotation.x = 1.55 * k; L.ank.rotation.x = -.05; }
    this.hips.position.y = lerp(.96, .5, k);
  }
  readDesk(t, k = 1, lean = .35) {
    this.spine.rotation.x += lean * k; this.head.rotation.x += .45 * k;
    for (const sd of [-1, 1]) { const A = this.arm[sd]; A.sho.rotation.x = -.75 * k; A.sho.rotation.z = sd * -.12 * k; A.elb.rotation.x = -1.15 * k; A.wr.rotation.x = .2; this.curl(sd, .35); }
  }
  turnHead(yaw, pitch = 0) { this.head.rotation.y += yaw; this.head.rotation.x += pitch; this.neck.rotation.y = yaw * .3; }
}

// A crowd of figures on a floor area, each with its own action; update(t) animates them all.
export class Crowd {
  constructor(scene, { count = 40, area = [-10, 10, -10, 10], seed = 5, era = 1965, actions = ["shout", "phone", "stand", "walk"], exclude = null } = {}) {
    const r = rng(seed); this.people = [];
    for (let i = 0; i < count; i++) {
      let x, z, tries = 0;
      do { x = lerp(area[0], area[1], r()); z = lerp(area[2], area[3], r()); tries++; } while (exclude && exclude(x, z) && tries < 20);
      const p = new Person({ seed: seed * 1000 + i, jacket: era < 1970 ? r() < .55 : r() < .8, hat: false });
      p.root.position.set(x, 0, z); p.root.rotation.y = r() * Math.PI * 2;
      p.action = actions[Math.floor(r() * actions.length)]; p.speed = .8 + r() * .5; p.phase = r(); p.heading = p.root.rotation.y;
      p.home = new THREE.Vector3(x, 0, z);
      scene.add(p.root); this.people.push(p);
    }
  }
  update(t, intensity = 1) {
    for (const p of this.people) {
      p.reset(); const tt = t * p.speed + p.phase * 10;
      if (p.action === "walk") {
        const d = (tt * .55) % 6 - 3; p.root.position.set(p.home.x + Math.sin(p.heading) * d, 0, p.home.z + Math.cos(p.heading) * d);
        p.walk(tt * .9);
      } else if (p.action === "shout") { p.shout(tt, { k: intensity, armUp: clamp(intensity * (.5 + .5 * Math.sin(tt * .7))), side: p.seed % 2 ? 1 : -1 }); p.walk(tt * .2, { stride: .08, arms: 0 }); }
      else if (p.action === "phone") { p.phoneAtEar(-1, 1); p.shout(tt, { k: .5 * intensity, armUp: .3 * intensity, side: 1 }); }
      else { p.breathe(tt, 1); p.turnHead(noise1(tt * .3, p.seed) * .7); }
      p.breathe(tt, .5);
    }
  }
}
