// Sets: each builder adds a physical environment to a scene and returns handles for animation.
import * as THREE from "three";
import { rng, noise1, clamp, lerp, canvasTex } from "./engine.js";

const M = (tone, rough = .8, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(tone, tone, tone), roughness: rough, ...extra });
const add = (parent, geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], cast = true, receive = true } = {}) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
};
// Soft additive light shaft (a beam of window light through haze).
function shaft(parent, { from, to, width = 2, depth = 1.2, alpha = .12, tone = 1 }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
  const tex = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); const g2 = x.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, "rgba(0,0,0,1)"); g2.addColorStop(.25, "rgba(0,0,0,0)"); g2.addColorStop(.75, "rgba(0,0,0,0)"); g2.addColorStop(1, "rgba(0,0,0,1)"); x.globalCompositeOperation = "destination-out"; x.fillStyle = g2; x.fillRect(0, 0, w, h); }, { srgb: false });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(tone, tone, tone) });
  const grp = new THREE.Group();
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat); m.rotation.y = r; m.position.y = -len / 2; grp.add(m); }
  grp.position.copy(a); grp.lookAt(b); grp.rotateX(-Math.PI / 2); grp.scale.z = depth;
  parent.add(grp); return grp;
}

// Paper texture with rows of soft printed lines (no legible words).
export const paperTex = (seed = 1, rows = 40) => canvasTex(512, 660, (x, w, h) => {
  const r = rng(seed); x.fillStyle = "#e8e5dd"; x.fillRect(0, 0, w, h);
  x.fillStyle = "rgba(20,20,20,.75)";
  for (let i = 0; i < rows; i++) { const y = 40 + i * (h - 80) / rows; let xx = 36; while (xx < w - 40) { const ww = 8 + r() * 46; if (r() > .12) x.fillRect(xx, y, ww, 5); xx += ww + 7; } }
});

// ---------------------------------------------------------------- 1960s exchange trading floor
export function buildFloor(scene, { seed = 3, paper = 220 } = {}) {
  const r = rng(seed), g = new THREE.Group(); scene.add(g);
  scene.fog = new THREE.FogExp2(0x3a3a3a, .02);
  scene.background = new THREE.Color(0x2a2a2a);
  // floor: worn boards with a sheen
  const floorTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = "#6d6d6d"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) { x.fillStyle = `rgb(${90 + r() * 40},${90 + r() * 40},${90 + r() * 40})`; x.fillRect(0, i * 32, w, 31); x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(0, i * 32 + 31, w, 1); for (let k = 0; k < 4; k++) x.fillRect(r() * w, i * 32, 1, 32); }
  }, { repeat: [8, 8] });
  add(g, new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .45, metalness: .05 }), { rot: [-Math.PI / 2, 0, 0], cast: false });
  // walls and tall windows (window wall at z = -18)
  const wallM = M(.42, .9);
  add(g, new THREE.BoxGeometry(70, 22, 1), wallM, { pos: [0, 11, -18.5] });
  add(g, new THREE.BoxGeometry(70, 22, 1), wallM, { pos: [0, 11, 22] });
  add(g, new THREE.BoxGeometry(1, 22, 42), wallM, { pos: [-26, 11, 2] });
  add(g, new THREE.BoxGeometry(1, 22, 42), wallM, { pos: [26, 11, 2] });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.2) });
  for (let i = -3; i <= 3; i++) {
    const x = i * 7.2;
    add(g, new THREE.PlaneGeometry(4.2, 12), glowM, { pos: [x, 9.5, -17.95], cast: false });
    for (let k = 1; k < 6; k++) add(g, new THREE.BoxGeometry(4.2, .12, .1), M(.08), { pos: [x, 3.5 + k * 2, -17.9], cast: false });
    for (let k = -1; k <= 1; k++) add(g, new THREE.BoxGeometry(.1, 12, .1), M(.08), { pos: [x + k * 1.4, 9.5, -17.9], cast: false });
    shaft(g, { from: [x, 13, -17.5], to: [x + 3, 0, 2], width: 4, alpha: .035 });
  }
  // columns with capitals
  const colM = M(.55, .7);
  for (const z of [-12, -2, 8, 16]) for (const x of [-20, -12, 12, 20]) {
    add(g, new THREE.CylinderGeometry(.7, .78, 19, 20), colM, { pos: [x, 9.5, z] });
    add(g, new THREE.BoxGeometry(2, .6, 2), colM, { pos: [x, 19.2, z] });
    add(g, new THREE.BoxGeometry(1.9, .4, 1.9), colM, { pos: [x, .2, z] });
  }
  // coffered ceiling
  add(g, new THREE.PlaneGeometry(60, 50), M(.3, .9), { pos: [0, 21, 2], rot: [Math.PI / 2, 0, 0], cast: false });
  for (let i = -6; i <= 6; i++) { add(g, new THREE.BoxGeometry(.5, .9, 44), M(.38), { pos: [i * 4, 20.5, 2], cast: false }); }
  for (let k = -5; k <= 5; k++) { add(g, new THREE.BoxGeometry(52, .9, .5), M(.38), { pos: [0, 20.5, 2 + k * 4], cast: false }); }
  // hanging pendant lamps
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) });
  const lamps = [];
  for (let i = -2; i <= 2; i++) for (let k = -1; k <= 2; k++) {
    const x = i * 8, z = k * 8 + 1, y = 7.5;
    add(g, new THREE.CylinderGeometry(.01, .01, 13, 4), M(.05), { pos: [x, y + 6.5, z], cast: false });
    add(g, new THREE.SphereGeometry(.35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(.15, .5, { side: THREE.DoubleSide }), { pos: [x, y + .1, z], rot: [Math.PI, 0, 0], cast: false });
    add(g, new THREE.SphereGeometry(.16, 12, 8), lampM, { pos: [x, y, z], cast: false });
    lamps.push([x, y, z]);
  }
  for (const [x, y, z] of lamps.filter((_, i) => i % 3 === 0)) { const pl = new THREE.PointLight(0xffffff, 5, 14, 1.8); pl.position.set(x, y - .4, z); g.add(pl); }
  // trading posts: horseshoe counters with a board crown
  const postM = M(.2, .5), boardM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .4, emissive: new THREE.Color(.15, .15, .15) });
  const boardTex = canvasTex(1024, 128, (x, w, h) => { x.fillStyle = "#0b0b0b"; x.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(230,230,230,${.5 + r() * .5})`; x.fillRect(20 + i * 56, 30, 34, 18); x.fillRect(20 + i * 56, 72, 22 + r() * 12, 14); } });
  const posts = [];
  for (const [x, z] of [[-9, -7], [9, -7], [-11, 9], [11, 9]]) {
    const p = new THREE.Group(); p.position.set(x, 0, z); g.add(p);
    add(p, new THREE.TorusGeometry(2.6, .45, 10, 40, Math.PI * 1.5), postM, { pos: [0, 1.05, 0], rot: [Math.PI / 2, 0, Math.PI * .25] });
    add(p, new THREE.CylinderGeometry(2.2, 2.2, 1.0, 32, 1, true), M(.12, .6, { side: THREE.DoubleSide }), { pos: [0, .5, 0] });
    add(p, new THREE.CylinderGeometry(.18, .18, 3.2, 10), M(.3, .4, { metalness: .6 }), { pos: [0, 2.6, 0] });
    const crown = add(p, new THREE.CylinderGeometry(2.3, 2.3, 1.1, 40, 1, true), new THREE.MeshStandardMaterial({ map: boardTex, roughness: .4, emissive: new THREE.Color(1, 1, 1), emissiveMap: boardTex, emissiveIntensity: .7, side: THREE.DoubleSide }), { pos: [0, 4.5, 0] });
    add(p, new THREE.CylinderGeometry(2.35, 2.35, .15, 40), M(.1), { pos: [0, 5.1, 0] });
    add(p, new THREE.CylinderGeometry(2.35, 2.35, .15, 40), M(.1), { pos: [0, 3.9, 0] });
    // telephones on the counter
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 1.4 + .4; add(p, new THREE.BoxGeometry(.22, .1, .26), M(.05, .3), { pos: [Math.cos(a) * 2.6, 1.55, Math.sin(a) * 2.6], rot: [0, -a, 0] }); }
    posts.push(p);
  }
  // paper slips littering the floor (instanced)
  const slipGeo = new THREE.PlaneGeometry(.1, .14), slipM = M(.82, .9, { side: THREE.DoubleSide });
  const slips = new THREE.InstancedMesh(slipGeo, slipM, paper); slips.receiveShadow = true;
  const d = new THREE.Object3D();
  for (let i = 0; i < paper; i++) { d.position.set(lerp(-18, 18, r()), .005, lerp(-15, 18, r())); d.rotation.set(-Math.PI / 2, 0, r() * 6); d.updateMatrix(); slips.setMatrixAt(i, d.matrix); }
  g.add(slips);
  // airborne slips that the crowd throws (animated)
  const air = new THREE.InstancedMesh(slipGeo, slipM, 60); g.add(air);
  const airSeeds = Array.from({ length: 60 }, () => [lerp(-12, 12, r()), lerp(-6, 14, r()), r() * 10, r()]);
  // light: cool window key from behind, soft fill
  const key = new THREE.DirectionalLight(0xffffff, 5.5); key.position.set(3, 12, -26); key.target.position.set(0, 0, 4); g.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -22, right: 22, top: 20, bottom: -20, near: 1, far: 70 }); key.shadow.bias = -.0005;
  g.add(new THREE.HemisphereLight(0xffffff, 0x222222, .12));
  return {
    group: g, posts, lamps,
    update(t) {
      for (let i = 0; i < airSeeds.length; i++) {
        const [x, z, ph, s] = airSeeds[i], k = ((t * .35 + ph) % 3) / 3;
        d.position.set(x + Math.sin(t * 2 + ph) * .4, lerp(3.4, 0, k), z + Math.cos(t * 1.7 + ph) * .3);
        d.rotation.set(t * 3 * s + ph, t * 2 + ph, t * 4 * s); d.updateMatrix(); air.setMatrixAt(i, d.matrix);
      }
      air.instanceMatrix.needsUpdate = true;
    },
  };
}
