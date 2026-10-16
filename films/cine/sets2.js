// More sets: night city with wet streets + sedan + rain, office (night / dawn) with real documents and
// the real Insidir product on a laptop, printing press, rotary telephone, stock ticker.
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { rng, noise1, clamp, lerp, ease, canvasTex } from "./engine.js";

const M = (tone, rough = .8, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(tone, tone, tone), roughness: rough, ...extra });
const add = (parent, geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], cast = true, receive = true, scale } = {}) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); if (scale) m.scale.set(...scale); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
};
export function envMap(renderer, scene, intensity = .35) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = intensity;
}

// ---------------------------------------------------------------- windows texture for towers
function windowTex(seed, lit = .22, cols = 8, rows = 24) {
  const r = rng(seed);
  const draw = (x, w, h, emissive) => {
    x.fillStyle = emissive ? "#000" : "#1a1a1a"; x.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const on = r() < lit, v = on ? 180 + r() * 75 : 10 + r() * 25;
      x.fillStyle = emissive ? (on ? `rgb(${v},${v},${v})` : "#000") : `rgb(${v * .5 + 20},${v * .5 + 20},${v * .5 + 20})`;
      x.fillRect(i * cw + cw * .14, j * rh + rh * .18, cw * .72, rh * .6);
      if (on && emissive && r() < .5) { x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(i * cw + cw * (.2 + r() * .4), j * rh + rh * .18, cw * .12, rh * .6); }
    }
  };
  const mk = em => { const c = document.createElement("canvas"); c.width = 256; c.height = 512; const s = r(); draw(c.getContext("2d"), 256, 512, em); return c; };
  const base = new THREE.CanvasTexture(mk(false)), emis = new THREE.CanvasTexture(mk(true));
  for (const t of [base, emis]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { base, emis };
}

// ---------------------------------------------------------------- sedan
export function buildSedan() {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: .18, metalness: .6, clearcoat: 1, clearcoatRoughness: .05 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: .02, metalness: .9, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: .12, metalness: 1 });
  const rubber = M(.03, .9);
  // side profile (x = length, y = height), extruded across the car's width
  const s = new THREE.Shape();
  const pts = [[-2.55, .32], [-2.6, .62], [-2.45, .78], [-1.4, .86], [-.95, 1.36], [.55, 1.4], [1.2, .92], [2.35, .8], [2.6, .62], [2.55, .32]];
  s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); s.lineTo(-2.55, .32);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.84, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 4, curveSegments: 8 });
  body.translate(0, 0, -.92); const bm = add(car, body, paint);
  // glasshouse inset
  const gs = new THREE.Shape(); const gp = [[-1.32, .9], [-.9, 1.32], [.5, 1.35], [1.1, .93]]; gs.moveTo(...gp[0]); for (const p of gp.slice(1)) gs.lineTo(...p); gs.lineTo(-1.32, .9);
  const gl = new THREE.ExtrudeGeometry(gs, { depth: 1.9, bevelEnabled: false }); gl.translate(0, .005, -.95); add(car, gl, glass);
  for (const [x, z] of [[-1.6, .93], [-1.6, -.93], [1.62, .93], [1.62, -.93]]) {
    const w = new THREE.Group(); w.position.set(x, .36, z); car.add(w);
    add(w, new THREE.CylinderGeometry(.36, .36, .26, 28), rubber, { rot: [Math.PI / 2, 0, 0] });
    add(w, new THREE.CylinderGeometry(.24, .24, .27, 20), chrome, { rot: [Math.PI / 2, 0, 0] });
    w.userData.wheel = true;
  }
  const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 8) }), tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) });
  for (const z of [-.68, .68]) {
    add(car, new THREE.CircleGeometry(.12, 20), head, { pos: [2.66, .64, z], rot: [0, Math.PI / 2, 0], cast: false });
    add(car, new THREE.PlaneGeometry(.06, .22), tail, { pos: [-2.66, .68, z], rot: [0, -Math.PI / 2, 0], cast: false });
  }
  add(car, new THREE.BoxGeometry(.05, .12, 1.3), chrome, { pos: [2.66, .48, 0] });
  add(car, new THREE.BoxGeometry(4.6, .03, .02), chrome, { pos: [0, .62, .97] }); add(car, new THREE.BoxGeometry(4.6, .03, .02), chrome, { pos: [0, .62, -.97] });
  // headlight beams
  const beamL = new THREE.SpotLight(0xffffff, 60, 40, .42, .6, 1.4); beamL.position.set(2.6, .65, 0); beamL.target.position.set(12, 0, 0); car.add(beamL, beamL.target);
  car.userData.spin = t => car.children.filter(c => c.userData.wheel).forEach(w => (w.rotation.z = -t * 9));
  return car;
}

// ---------------------------------------------------------------- night city, wet streets, rain
export function buildCity(scene, renderer, { seed = 11, size = 520, day = false, reflect = true } = {}) {
  const r = rng(seed), g = new THREE.Group(); scene.add(g);
  scene.background = new THREE.Color(day ? 0x9a9a9a : 0x060606);
  scene.fog = new THREE.FogExp2(day ? 0x9c9c9c : 0x101010, day ? .0035 : .006);
  envMap(renderer, scene, day ? .6 : .12);
  // streets run along X (avenue at z=0) and cross streets along Z every block
  const roadTex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = "#2b2b2b"; x.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { const v = 30 + r() * 40; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * w, r() * h, 2, 2); } }, { repeat: [80, 80] });
  const road = new THREE.MeshStandardMaterial({ map: roadTex, color: 0x777777, roughness: day ? .8 : .28, metalness: .1, transparent: reflect && !day, opacity: .78 });
  if (reflect && !day) {
    const mirror = new Reflector(new THREE.PlaneGeometry(size * 2, size * 2), { textureWidth: 1024, textureHeight: 576, color: 0x777777 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.y = -.02; g.add(mirror);
  }
  add(g, new THREE.PlaneGeometry(size * 2, size * 2), road, { rot: [-Math.PI / 2, 0, 0], cast: false });
  // sidewalks + curbs along the avenue
  for (const z of [-9, 9]) add(g, new THREE.BoxGeometry(size * 2, .16, 4), M(.3, day ? .9 : .5), { pos: [0, .08, z + Math.sign(z) * 2], cast: false });
  // towers on a block grid
  const blockX = 46, blockZ = 34, mats = [];
  for (let k = 0; k < 6; k++) { const { base, emis } = windowTex(seed + k, day ? 0 : .16 + k * .03); mats.push(new THREE.MeshStandardMaterial({ map: base, emissiveMap: emis, emissive: new THREE.Color(day ? 0 : 1.6, day ? 0 : 1.6, day ? 0 : 1.6), roughness: .6, metalness: .2, color: new THREE.Color(day ? .7 : .45, day ? .7 : .45, day ? .7 : .45) })); }
  const capM = M(.18, .7);
  for (let bx = -size / 2; bx < size / 2; bx += blockX) for (let bz = -size / 2; bz < size / 2; bz += blockZ) {
    if (Math.abs(bz + blockZ / 2) < 22) continue; // keep the avenue clear
    const n = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const w = (blockX - 14) / n, d = blockZ - 12, x = bx + 7 + w * i + w / 2, z = bz + 6 + d / 2;
      const near = Math.abs(z) < 60 && Math.abs(x) < 120;
      const h = (near ? 40 : 30) + Math.pow(r(), 2) * (near ? 140 : 210);
      const m = mats[Math.floor(r() * mats.length)];
      const bg = new THREE.BoxGeometry(w - 1, h, d), uvA = bg.attributes.uv, nA = bg.attributes.normal;
      for (let q = 0; q < uvA.count; q++) { const side = Math.abs(nA.getX(q)) > .5 ? d : w; uvA.setXY(q, uvA.getX(q) * Math.max(1, side / 18), uvA.getY(q) * Math.max(1, h / 36)); }
      add(g, bg, m, { pos: [x, h / 2, z] });
      add(g, new THREE.BoxGeometry(w - .2, 1.2, d + .8), capM, { pos: [x, h, z] });
      if (r() < .5) { const h2 = h * (.15 + r() * .25); add(g, new THREE.BoxGeometry(w * .65, h2, d * .65), m, { pos: [x, h + h2 / 2, z] }); }
      add(g, new THREE.BoxGeometry(w - .4, 6, d + .4), M(.12, .6), { pos: [x, 3, z] }); // dark ground floor / stone base
    }
  }
  // street lamps along the avenue
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9, 9) });
  const lamps = [];
  for (let x = -260; x <= 260; x += 26) for (const z of [-10.5, 10.5]) {
    add(g, new THREE.CylinderGeometry(.12, .16, 8, 10), M(.08, .5), { pos: [x, 4, z] });
    add(g, new THREE.BoxGeometry(2.2, .12, .12), M(.08, .5), { pos: [x, 8, z - Math.sign(z) * 1] });
    add(g, new THREE.SphereGeometry(.28, 12, 8), lampHead, { pos: [x, 7.8, z - Math.sign(z) * 2], cast: false });
    lamps.push([x, 7.6, z - Math.sign(z) * 2]);
  }
  const lampLights = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, day ? 0 : 160, 34, 1.7); g.add(l); lampLights.push(l); }
  if (day) {
    const sun = new THREE.DirectionalLight(0xffffff, 4); sun.position.set(-120, 160, 80); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 500 }); g.add(sun, sun.target);
    g.add(new THREE.HemisphereLight(0xffffff, 0x444444, .8));
  } else g.add(new THREE.HemisphereLight(0xffffff, 0x000000, .06));
  // rain streaks (camera-local box, re-seeded each frame deterministically)
  const N = 9000, rainGeo = new THREE.BufferGeometry(), rp = new Float32Array(N * 6);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: day ? 0 : .32, blending: THREE.AdditiveBlending, depthWrite: false }));
  rain.frustumCulled = false; g.add(rain);
  const rs = Array.from({ length: N }, () => [r(), r(), r(), .7 + r() * .6]);
  // steam from grates
  const steamTex = canvasTex(128, 128, (x, w, h) => { const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, { srgb: false });
  const steam = [];
  for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: day ? 0 : .25, color: 0xbbbbbb })); g.add(sp); steam.push([sp, r(), r()]); }
  const grates = [[18, 3], [-40, -4], [70, 2]];
  return {
    group: g, lamps,
    update(t, cam) {
      // nearest lamps get real lights
      const cp = cam.position, sorted = lamps.map(l => [l, (l[0] - cp.x) ** 2 + (l[2] - cp.z) ** 2]).sort((a, b) => a[1] - b[1]);
      lampLights.forEach((L, i) => L.position.set(...sorted[i][0]));
      // rain in a 60 m box around the camera
      for (let i = 0; i < N; i++) {
        const [a, b, c, s] = rs[i], fall = (b * 40 - t * 22 * s) % 40, y = cp.y - 20 + (fall < 0 ? fall + 40 : fall);
        const x = cp.x + (a - .5) * 60, z = cp.z + (c - .5) * 60;
        rp.set([x, y, z, x + .08, y - .9 * s, z], i * 6);
      }
      rainGeo.attributes.position.needsUpdate = true;
      steam.forEach(([sp, a, b], i) => { const gr = grates[i % 3], k = ((t * .25 + a) % 1); sp.position.set(gr[0] + (b - .5) * 2 + k * 1.5, .3 + k * 6, gr[1] + (a - .5) * 1.5); sp.scale.setScalar(1.5 + k * 5); sp.material.opacity = (day ? 0 : .22) * Math.sin(k * Math.PI); });
    },
  };
}

// ---------------------------------------------------------------- office (night or dawn)
export async function buildOffice(scene, renderer, { seed = 21, mode = "night", desks = 1, textures } = {}) {
  const r = rng(seed), g = new THREE.Group(); scene.add(g);
  const night = mode === "night", dusk = mode === "dusk";
  scene.background = new THREE.Color(night ? 0x020202 : 0x777777);
  scene.fog = new THREE.FogExp2(night ? 0x050505 : 0x8a8a8a, night ? .01 : .03);
  envMap(renderer, scene, night ? .08 : .3);
  const carpet = canvasTex(512, 512, (x, w, h) => { x.fillStyle = "#3a3a3a"; x.fillRect(0, 0, w, h); for (let i = 0; i < 20000; i++) { const v = 40 + r() * 30; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * w, r() * h, 1, 1); } }, { repeat: [10, 10] });
  add(g, new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: carpet, roughness: .95 }), { rot: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(40, 30), M(.55, .9), { pos: [0, 3.4, 0], rot: [Math.PI / 2, 0, 0], cast: false });
  for (let i = -4; i <= 4; i++) add(g, new THREE.BoxGeometry(.6, .03, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(night ? .02 : 1.2, night ? .02 : 1.2, night ? .02 : 1.2) }), { pos: [i * 4, 3.38, 2], cast: false });
  add(g, new THREE.BoxGeometry(40, 3.4, .3), M(.6, .9), { pos: [0, 1.7, 9] });
  add(g, new THREE.BoxGeometry(.3, 3.4, 30), M(.6, .9), { pos: [-14, 1.7, 0] });
  // window wall at z = -6: mullions + city/sky backdrop
  const back = canvasTex(2048, 768, (x, w, h) => {
    const sky = x.createLinearGradient(0, 0, 0, h);
    if (night) { sky.addColorStop(0, "#050505"); sky.addColorStop(.7, "#1c1c1c"); sky.addColorStop(1, "#2b2b2b"); }
    else { sky.addColorStop(0, "#d8d8d8"); sky.addColorStop(.6, "#f2f2f2"); sky.addColorStop(1, "#fafafa"); }
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    let xx = 0;
    while (xx < w) {
      const bw = 40 + r() * 120, bh = 120 + r() * 520, tone = night ? 8 + r() * 14 : 120 + r() * 70;
      x.fillStyle = `rgb(${tone},${tone},${tone})`; x.fillRect(xx, h - bh, bw, bh);
      if (night) for (let wy = h - bh + 8; wy < h - 6; wy += 11) for (let wx = xx + 5; wx < xx + bw - 5; wx += 9) if (r() < .22) { const v = 150 + r() * 100; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(wx, wy, 5, 6); }
      else for (let wy = h - bh + 8; wy < h - 6; wy += 14) { x.fillStyle = "rgba(0,0,0,.12)"; x.fillRect(xx + 3, wy, bw - 6, 3); }
      xx += bw + 4 + r() * 10;
    }
  });
  add(g, new THREE.PlaneGeometry(60, 22), new THREE.MeshBasicMaterial({ map: back, color: new THREE.Color(night ? 1.4 : 2.2, night ? 1.4 : 2.2, night ? 1.4 : 2.2), fog: false }), { pos: [0, 6, -40], cast: false });
  for (let i = -10; i <= 10; i++) add(g, new THREE.BoxGeometry(.12, 3.4, .14), M(.06, .5), { pos: [i * 1.6, 1.7, -6] });
  add(g, new THREE.BoxGeometry(40, .2, .3), M(.06, .5), { pos: [0, .1, -6] }); add(g, new THREE.BoxGeometry(40, .25, .3), M(.06, .5), { pos: [0, 3.3, -6] });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .08, roughness: .05, metalness: 0, transmission: 0 });
  add(g, new THREE.PlaneGeometry(40, 3.4), glass, { pos: [0, 1.7, -6.02], cast: false });
  // desks (rows for the open-plan look); the hero desk is at the origin facing the window
  const deskTop = M(.28, .35), deskLeg = M(.1, .4, { metalness: .6 }), chairM = M(.07, .6);
  const makeDesk = (x, z, ry = 0) => {
    const d = new THREE.Group(); d.position.set(x, 0, z); d.rotation.y = ry; g.add(d);
    add(d, new THREE.BoxGeometry(1.8, .05, .85), deskTop, { pos: [0, .75, 0] });
    for (const [lx, lz] of [[-.85, -.38], [.85, -.38], [-.85, .38], [.85, .38]]) add(d, new THREE.BoxGeometry(.04, .75, .04), deskLeg, { pos: [lx, .375, lz] });
    const ch = new THREE.Group(); ch.position.set(0, 0, .75); d.add(ch);
    add(ch, new THREE.BoxGeometry(.52, .08, .5), chairM, { pos: [0, .48, 0] }); add(ch, new THREE.BoxGeometry(.5, .6, .06), chairM, { pos: [0, .85, .24] });
    add(ch, new THREE.CylinderGeometry(.03, .03, .44, 8), deskLeg, { pos: [0, .25, 0] }); add(ch, new THREE.CylinderGeometry(.28, .28, .03, 5), deskLeg, { pos: [0, .03, 0] });
    return { d, ch };
  };
  const hero = makeDesk(0, -3.2);
  const rowsDesks = [];
  if (desks > 1) for (let i = 0; i < desks; i++) { const x = -9 + (i % 6) * 3.4, z = -.5 + Math.floor(i / 6) * 2.8; if (Math.abs(x) < 1.5 && z < 1) continue; rowsDesks.push(makeDesk(x, z)); }
  // documents on the hero desk: the real Form 4 printed, a stack, a second page, a pen, the laptop with Insidir
  const paperM = tex => new THREE.MeshStandardMaterial({ map: tex, color: 0xb4b4b4, roughness: .9, side: THREE.DoubleSide });
  const form4 = add(hero.d, new THREE.PlaneGeometry(.43, .34), paperM(textures.form4), { pos: [-.12, .778, .12], rot: [-Math.PI / 2, 0, .06], cast: false });
  const page2 = add(hero.d, new THREE.PlaneGeometry(.43, .34), paperM(textures.form4b || textures.form4), { pos: [.4, .7795, .1], rot: [-Math.PI / 2, 0, -.12], cast: false });
  for (let k = 0; k < 14; k++) add(hero.d, new THREE.BoxGeometry(.3, .004, .38), M(.85, .9), { pos: [-.62, .78 + k * .0045, -.1], rot: [0, (r() - .5) * .08, 0] });
  const pen = new THREE.Group(); hero.d.add(pen);
  add(pen, new THREE.CylinderGeometry(.0055, .0045, .14, 12), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: .15, clearcoat: 1 }), { rot: [0, 0, Math.PI / 2] });
  add(pen, new THREE.ConeGeometry(.0045, .014, 10), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 1, roughness: .2 }), { pos: [.077, 0, 0], rot: [0, 0, -Math.PI / 2] });
  pen.position.set(.25, .79, .25); pen.rotation.y = .6;
  // laptop: base + screen hinge; the screen shows the real product capture
  const laptop = new THREE.Group(); laptop.position.set(.5, .776, -.18); laptop.rotation.y = -.25; hero.d.add(laptop);
  const alu = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: .8, roughness: .35 });
  add(laptop, new THREE.BoxGeometry(.34, .014, .24), alu, { pos: [0, .007, 0] });
  add(laptop, new THREE.PlaneGeometry(.3, .16), M(.06, .8), { pos: [0, .0145, .01], rot: [-Math.PI / 2, 0, 0], cast: false });
  const hinge = new THREE.Group(); hinge.position.set(0, .014, -.12); laptop.add(hinge);
  add(hinge, new THREE.BoxGeometry(.34, .225, .008), alu, { pos: [0, .1125, -.004] });
  const screenMat = new THREE.MeshBasicMaterial({ map: textures.screen, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: true });
  const screen = add(hinge, new THREE.PlaneGeometry(.318, .179), screenMat, { pos: [0, .1125, .0005], cast: false });
  hinge.rotation.x = -.28;
  // desk lamp: arm + shade + a real spotlight
  const lampG = new THREE.Group(); lampG.position.set(-.7, .775, -.3); hero.d.add(lampG);
  add(lampG, new THREE.CylinderGeometry(.08, .09, .02, 20), M(.08, .3, { metalness: .7 }));
  add(lampG, new THREE.CylinderGeometry(.008, .008, .45, 8), M(.08, .3, { metalness: .7 }), { pos: [0, .22, 0], rot: [0, 0, -.25] });
  add(lampG, new THREE.ConeGeometry(.09, .14, 20, 1, true), M(.06, .4, { side: THREE.DoubleSide, metalness: .6 }), { pos: [.13, .44, 0], rot: [0, 0, 2.4] });
  add(lampG, new THREE.SphereGeometry(.025, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 10, 10) }), { pos: [.17, .41, 0], cast: false });
  const deskSpot = new THREE.SpotLight(0xffffff, night ? 3.2 : dusk ? 2 : .6, 4, .8, .6, 1.6);
  deskSpot.position.set(.18, .4, 0); deskSpot.castShadow = true; deskSpot.shadow.mapSize.set(1024, 1024); deskSpot.shadow.bias = -.0004;
  lampG.add(deskSpot); deskSpot.target.position.set(.55, -.2, .35); lampG.add(deskSpot.target);
  // wall clock (dawn film)
  const clock = new THREE.Group(); clock.position.set(-13.8, 2.3, 0); clock.rotation.y = Math.PI / 2; g.add(clock);
  add(clock, new THREE.CylinderGeometry(.28, .28, .05, 40), M(.08, .4), { rot: [Math.PI / 2, 0, 0] });
  add(clock, new THREE.CircleGeometry(.25, 40), M(.9, .6), { pos: [0, 0, .03], cast: false });
  const handM = M(.03, .5);
  const hourH = add(clock, new THREE.BoxGeometry(.018, .13, .004), handM, { pos: [0, 0, .035] }); hourH.geometry.translate(0, .055, 0);
  const minH = add(clock, new THREE.BoxGeometry(.012, .2, .004), handM, { pos: [0, 0, .037] }); minH.geometry.translate(0, .09, 0);
  const secH = add(clock, new THREE.BoxGeometry(.004, .22, .003), M(.15), { pos: [0, 0, .04] }); secH.geometry.translate(0, .08, 0);
  // light: night = lamp + city glow; dawn = low sun through the windows with blinds-like shafts
  if (night || dusk) { g.add(new THREE.HemisphereLight(0xffffff, 0x000000, night ? .05 : .25)); const city = new THREE.DirectionalLight(0xffffff, night ? 1.1 : 1.4); city.position.set(2, 4, -20); g.add(city); }
  else {
    const sun = new THREE.DirectionalLight(0xffffff, 6); sun.position.set(-6, 5, -16); sun.target.position.set(2, 0, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 50 }); sun.shadow.bias = -.0004; g.add(sun, sun.target);
    // horizontal blind slats on the windows throw striped light
    for (let y = .3; y < 3.2; y += .09) add(g, new THREE.BoxGeometry(30, .045, .02), M(.5, .6), { pos: [0, y, -5.9], rot: [.6, 0, 0], receive: false });
    g.add(new THREE.HemisphereLight(0xffffff, 0x333333, .35));
  }
  return {
    group: g, hero, form4, page2, pen, laptop, hinge, screen, screenMat, clock, deskSpot, rowsDesks,
    setClock(t, base = 6 * 3600 + 51 * 60 + 33) {
      const s = base + t, step = Math.floor(s) + Math.min(1, (s % 1) / .08);
      secH.rotation.z = -step / 60 * Math.PI * 2; minH.rotation.z = -(s / 3600) * Math.PI * 2; hourH.rotation.z = -(s / 43200) * Math.PI * 2;
    },
  };
}

// ---------------------------------------------------------------- printing press
export function buildPress(scene, renderer, { seed = 31, textures } = {}) {
  const r = rng(seed), g = new THREE.Group(); scene.add(g);
  scene.background = new THREE.Color(0x020202); scene.fog = new THREE.FogExp2(0x060606, .05); envMap(renderer, scene, .25);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: .95, roughness: .22 }), dark = M(.05, .5, { metalness: .6 });
  const rollers = [];
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 1.15, y = 1.2 + (i % 2) * .62, rr = .26 + (i % 3) * .05;
    const m = add(g, new THREE.CylinderGeometry(rr, rr, 3.4, 48), steel, { pos: [x, y, 0], rot: [Math.PI / 2, 0, 0] });
    for (const z of [-1.8, 1.8]) add(g, new THREE.CylinderGeometry(rr * .5, rr * .5, .3, 20), dark, { pos: [x, y, z], rot: [Math.PI / 2, 0, 0] });
    rollers.push([m, rr]);
  }
  add(g, new THREE.BoxGeometry(11, 2.8, .12), dark, { pos: [0, 1.4, -1.95] });
  // the paper web: a long strip textured with newsprint, scrolled through its UVs
  const web = textures.newsprint; web.wrapS = web.wrapT = THREE.RepeatWrapping; web.repeat.set(6, 1);
  const webM = new THREE.MeshStandardMaterial({ map: web, roughness: .8, side: THREE.DoubleSide });
  const curve = new THREE.CatmullRomCurve3(rollers.map(([m, rr], i) => new THREE.Vector3(m.position.x, m.position.y + (i % 2 ? -rr : rr) * 1.02, 0)));
  const webGeo = new THREE.TubeGeometry(curve, 200, 1, 2, false);
  // flatten the tube into a ribbon of width 3.1
  const ribbonGeo = new THREE.BufferGeometry(), pts = curve.getPoints(300), pos = [], uv = [], idx = [];
  pts.forEach((p, i) => { pos.push(p.x, p.y, -1.55, p.x, p.y, 1.55); uv.push(i / 300 * 6, 0, i / 300 * 6, 1); if (i) { const a = i * 2; idx.push(a - 2, a - 1, a, a - 1, a + 1, a); } });
  ribbonGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); ribbonGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); ribbonGeo.setIndex(idx); ribbonGeo.computeVertexNormals();
  const ribbon = new THREE.Mesh(ribbonGeo, webM); ribbon.receiveShadow = true; g.add(ribbon);
  // conveyor of folded newspapers
  const paperM = new THREE.MeshStandardMaterial({ map: textures.folded, roughness: .85 });
  const papers = []; for (let i = 0; i < 28; i++) { const p = add(g, new THREE.BoxGeometry(.42, .03, .3), paperM); papers.push(p); }
  add(g, new THREE.BoxGeometry(14, .06, .5), dark, { pos: [0, 3.45, -1.2] });
  const key = new THREE.SpotLight(0xffffff, 45, 30, .5, .5, 1.3); key.position.set(-3, 6, 5); key.target.position.set(0, 1.4, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); g.add(key, key.target);
  const rim = new THREE.SpotLight(0xffffff, 40, 30, .6, .6, 1.3); rim.position.set(5, 4, -6); rim.target.position.set(0, 1.4, 0); g.add(rim, rim.target);
  g.add(new THREE.HemisphereLight(0xffffff, 0x000000, .05));
  return {
    group: g,
    update(t, speed = 1) {
      rollers.forEach(([m, rr], i) => (m.rotation.y = (i % 2 ? 1 : -1) * t * speed * 7 / rr * .3));
      web.offset.x = -t * speed * 1.4;
      papers.forEach((p, i) => { const k = ((t * speed * .9 + i / papers.length) % 1); p.position.set(lerp(-7, 7, k), 3.5, -1.2); p.rotation.y = Math.sin(i) * .05; });
    },
  };
}

// ---------------------------------------------------------------- rotary telephone on a desk
export function buildPhone(scene, renderer, { textures } = {}) {
  const g = new THREE.Group(); scene.add(g);
  scene.background = new THREE.Color(0x010101); scene.fog = null; envMap(renderer, scene, .3);
  const bakelite = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: .22, clearcoat: 1, clearcoatRoughness: .1 });
  const desk = add(g, new THREE.BoxGeometry(3, .06, 2), new THREE.MeshStandardMaterial({ map: textures.wood, roughness: .45 }), { pos: [0, -.03, 0] });
  for (let k = 0; k < 10; k++) add(g, new THREE.PlaneGeometry(.1, .14), M(.85, .9, { side: THREE.DoubleSide }), { pos: [-.5 + Math.sin(k * 7) * .4, .002 + k * .0004, .3 + Math.cos(k * 3) * .25], rot: [-Math.PI / 2, 0, k], cast: false });
  const base = new THREE.Group(); g.add(base);
  const prof = [[0, 0], [.13, 0], [.135, .02], [.12, .08], [.085, .12], [0, .125]].map(([x, y]) => new THREE.Vector2(x, y));
  add(base, new THREE.LatheGeometry(prof, 40), bakelite, { scale: [1.05, 1, 1.15] });
  const dial = new THREE.Group(); dial.position.set(0, .1, .07); dial.rotation.x = -.75; base.add(dial);
  add(dial, new THREE.CylinderGeometry(.062, .062, .008, 40), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: .55, roughness: .45 }), { rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 1.6 + 1; add(dial, new THREE.TorusGeometry(.009, .0025, 6, 16), bakelite, { pos: [Math.cos(a) * .045, Math.sin(a) * .045, .006] }); }
  add(dial, new THREE.CircleGeometry(.02, 24), M(.9, .6), { pos: [0, 0, .006], cast: false });
  const cradle = []; for (const x of [-.07, .07]) cradle.push(add(base, new THREE.BoxGeometry(.03, .04, .05), bakelite, { pos: [x, .135, -.03] }));
  const receiver = new THREE.Group(); g.add(receiver);
  add(receiver, new THREE.CapsuleGeometry(.018, .16, 6, 16), bakelite, { rot: [0, 0, Math.PI / 2], pos: [0, .02, 0] });
  for (const x of [-.1, .1]) add(receiver, new THREE.SphereGeometry(.035, 24, 16), bakelite, { pos: [x, 0, 0], scale: [1, .75, 1] });
  // coiled cord
  const coil = new THREE.CatmullRomCurve3(Array.from({ length: 120 }, (_, i) => new THREE.Vector3(-.13 - i * .002, .02 - i * .0006 + Math.sin(i * .9) * .012, -.02 + Math.cos(i * .9) * .012)));
  add(g, new THREE.TubeGeometry(coil, 400, .003, 6), bakelite);
  const key = new THREE.SpotLight(0xffffff, 3, 6, .45, .45, 1.4); key.position.set(-.8, 1.1, .6); key.target.position.set(0, .05, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0003; g.add(key, key.target);
  const rim = new THREE.SpotLight(0xffffff, 2.2, 6, .5, .6, 1.4); rim.position.set(.9, .5, -.9); rim.target.position.set(0, .05, 0); g.add(rim, rim.target);
  return {
    group: g, base, receiver, desk,
    // k: 0 = resting in the cradle, 1 = lifted to 0.35 m; slam is k going 1 → 0 fast with a bounce
    setReceiver(k, tilt = 0) {
      receiver.position.set(0, .17 + k * .32, -.03 + k * .1); receiver.rotation.set(tilt + k * .5, 0, k * .25);
    },
  };
}

// ---------------------------------------------------------------- stock ticker under a glass dome
export function buildTicker(scene, renderer, { textures } = {}) {
  const g = new THREE.Group(); scene.add(g);
  scene.background = new THREE.Color(0x010101); scene.fog = null; envMap(renderer, scene, .5);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 1, roughness: .28 });
  add(g, new THREE.BoxGeometry(2.4, .05, 1.6), new THREE.MeshStandardMaterial({ map: textures.wood, roughness: .45 }), { pos: [0, -.025, 0] });
  add(g, new THREE.CylinderGeometry(.16, .19, .08, 40), brass, { pos: [0, .04, 0] });
  add(g, new THREE.CylinderGeometry(.11, .11, .09, 30), brass, { pos: [0, .125, 0] });
  const wheel = add(g, new THREE.CylinderGeometry(.045, .045, .03, 30), M(.1, .4, { metalness: .8 }), { pos: [0, .2, 0], rot: [Math.PI / 2, 0, 0] });
  const gear = add(g, new THREE.TorusGeometry(.05, .008, 8, 30), brass, { pos: [-.05, .2, .02] });
  add(g, new THREE.SphereGeometry(.19, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .12, roughness: 0, metalness: 0, clearcoat: 1 }), { pos: [0, .17, 0], cast: false });
  // tape: a ribbon that leaves the wheel and curls onto the table; printed with real Form 4 numbers
  const tape = textures.tape; tape.wrapS = THREE.RepeatWrapping;
  const tapeM = new THREE.MeshStandardMaterial({ map: tape, roughness: .8, side: THREE.DoubleSide });
  const n = 160, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = .045 + k * .7, y = .2 - Math.min(k * 3, 1) * .2 + Math.max(0, Math.sin(k * 9)) * .03 * (1 - k), z = Math.sin(k * 6) * .05 * k;
    pos.push(x, y + .0, z - .012, x, y, z + .012); uv.push(k * 4, 0, k * 4, 1);
    if (i) { const a = i * 2; idx.push(a - 2, a - 1, a, a - 1, a + 1, a); }
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  add(g, tg, tapeM, { cast: true });
  const key = new THREE.SpotLight(0xffffff, 2.4, 5, .4, .5, 1.4); key.position.set(-.6, .9, .5); key.target.position.set(0, .12, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); g.add(key, key.target);
  const rim = new THREE.SpotLight(0xffffff, 1.6, 5, .5, .6, 1.4); rim.position.set(.7, .4, -.7); rim.target.position.set(0, .15, 0); g.add(rim, rim.target);
  return { group: g, update(t) { tape.offset.x = -t * 1.8; wheel.rotation.y = t * 20; gear.rotation.z = Math.floor(t * 14) * .4; } };
}
