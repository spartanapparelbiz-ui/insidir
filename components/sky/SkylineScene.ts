/* The money skyline in WebGL (three, loaded only by components/sky/Skyline.tsx after first paint). Framework-free:
 * mountSkyline(el, …) builds the scene into `el` and returns update/destroy.
 *   Bars       glass (MeshPhysicalMaterial, slight transmission, ice tint) rising from a dark grid floor in the shared
 *              layout (lib/sky/skyline.ts skyLayout, barHeight); a faint mirrored copy below the floor reads as a
 *              reflection.
 *   Glow       each bar's top is a thin emissive cap; UnrealBloom (strength ~0.6) with a high threshold, so only the caps
 *              bloom.
 *   Sprites    the 8 biggest carry their team logo, portrait or monogram (drawn into a circle on a canvas).
 *   Motion     bars rise in with ease-out; new bets rise in place on update(); slow auto-orbit; drag to orbit
 *              horizontally (no wheel, no zoom; vertical swipes still scroll the page); mouse parallax.
 *   Picking    hover (or tap) a bar: onPick(bet, x, y) with screen coordinates for the HTML tooltip.
 *   Cost       pixel ratio ≤ 1.5; paused when off-screen or the tab is hidden. */
import {
  AmbientLight, BoxGeometry, CanvasTexture, Color, DirectionalLight, Fog, GridHelper, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SRGBColorSpace, Sprite, SpriteMaterial, Vector2, WebGLRenderer, type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { barHeight, skyLayout, type SkyBet } from "@/lib/sky/sky-pure";
import type { Art } from "@/lib/sky/art";
import { initials } from "@/lib/sky/sky-pure";

const ICE = new Color("#8FB8FF"), BG = new Color("#070B14");
const RISE_MS = 1300, SPRITES = 8;

interface Bar { bet: SkyBet; group: Group; body: Mesh; cap: Mesh; ghost: Mesh; sprite: Sprite | null; h: number; born: number }

export interface SkylineHandle { update(bets: SkyBet[]): void; destroy(): void }

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A round badge for a sprite: the image (logo or portrait) clipped to a circle on raised, with a ring; or the monogram. */
function badge(art: Art, onReady: (tex: CanvasTexture) => void): CanvasTexture {
  const S = 128, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!;
  const ringOf = (p: string | null | undefined) => (p === "D" ? "#4C8DFF" : p === "R" ? "#FF5A5F" : "rgba(148,163,184,0.45)");
  const base = (ring: string) => { g.clearRect(0, 0, S, S); g.fillStyle = "#121B2E"; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = ring; g.stroke(); };
  const mono = (text: string, ring: string) => { base(ring); g.fillStyle = "#F1F5FB"; g.font = "600 46px Outfit, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, S / 2, S / 2 + 2); };
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  let src: string | null = null, label = "?", ring = ringOf(null), portrait = false;
  if (art.kind === "teams") { src = art.teams[0]!.src; label = initials(art.teams[0]!.name); }
  else if (art.kind === "people") { src = art.people[0]!.src; label = initials(art.people[0]!.name); ring = ringOf(art.people[0]!.party); portrait = true; }
  else if (art.kind === "parties") { label = art.parties[0]!; ring = ringOf(art.parties[0]); }
  else if (art.kind === "logo") { src = art.src; label = initials(art.name); }
  else label = initials(art.name);
  mono(label, ring);
  if (src) {
    const img = new Image();
    img.onload = () => {
      base(ring);
      g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); g.clip();
      if (portrait) { const w = S, h = (img.height / img.width) * S; g.drawImage(img, 0, -(h - S) * 0.2, w, h); }
      else { const pad = 26, box = S - pad * 2, r = Math.min(box / img.width, box / img.height); g.drawImage(img, (S - img.width * r) / 2, (S - img.height * r) / 2, img.width * r, img.height * r); }
      g.restore(); tex.needsUpdate = true; onReady(tex);
    };
    img.onerror = () => { /* the monogram stays */ };
    img.src = src;
  }
  return tex;
}

export function mountSkyline(el: HTMLElement, initial: SkyBet[], opts: { onPick: (bet: SkyBet | null, x: number, y: number) => void; compact?: boolean }): SkylineHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(BG, 1);
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new Scene();
  // The backdrop is the page colour (set on the scene, so it goes through the same colour handling as the floor).
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 24, 46);
  const FOV = opts.compact ? 38 : 42;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  const home = { r: opts.compact ? 26 : 23, y: opts.compact ? 9 : 11 };
  camera.position.set(home.r * 0.72, home.y, home.r * 0.69);

  scene.add(new AmbientLight(0x8fb8ff, 0.55));
  const key = new DirectionalLight(0xffffff, 1.4); key.position.set(8, 18, 10); scene.add(key);
  const rim = new DirectionalLight(0x8fb8ff, 0.9); rim.position.set(-12, 6, -10); scene.add(rim);

  // The floor: a dark plane, its grid, and room below for the bars' reflections.
  const floor = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: BG, transparent: true, opacity: 0.82 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0; scene.add(floor);
  const grid = new GridHelper(60, 40, 0x24314d, 0x16203a);
  for (const m of [grid.material].flat()) { m.transparent = true; m.opacity = 0.7; }
  grid.position.y = 0.01; scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.55;
  controls.minPolarAngle = controls.maxPolarAngle = Math.atan2(Math.hypot(camera.position.x, camera.position.z), camera.position.y);
  controls.target.set(0, 2.6, 0);
  // Horizontal drags orbit; vertical swipes keep scrolling the page.
  renderer.domElement.style.touchAction = "pan-y";

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.6, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const glass = new MeshPhysicalMaterial({ color: ICE.clone().multiplyScalar(0.55), roughness: 0.12, metalness: 0.05, transmission: 0.35, thickness: 0.6, transparent: true, opacity: 0.88, clearcoat: 1, clearcoatRoughness: 0.15 });
  const capMat = new MeshBasicMaterial({ color: ICE.clone().multiplyScalar(1.6) });
  const ghostMat = new MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.07 });
  const box = new BoxGeometry(1, 1, 1);

  let bars: Bar[] = [];
  let min = 1, max = 1;
  const t0 = performance.now();

  function place(list: SkyBet[], now: number) {
    const pos = skyLayout(list.length, opts.compact ? 11 : 10);
    min = Math.min(...list.map(b => b.amount)); max = Math.max(...list.map(b => b.amount));
    const keep = new Map(bars.map(b => [b.bet.id, b]));
    const next: Bar[] = [];
    list.forEach((bet, i) => {
      let b = keep.get(bet.id);
      if (!b) {
        const group = new Group();
        const body = new Mesh(box, glass); const cap = new Mesh(box, capMat); const ghost = new Mesh(box, ghostMat);
        group.add(body, cap, ghost); scene.add(group);
        b = { bet, group, body, cap, ghost, sprite: null, h: 0, born: now };
      }
      keep.delete(bet.id);
      b.bet = bet; b.h = barHeight(bet.amount, min, max, 0.9, opts.compact ? 6.5 : 8.5);
      const w = i < 3 ? 1.05 : 0.8;
      b.group.position.set(pos[i]!.x, 0, pos[i]!.z);
      b.body.scale.set(w, 1, w); b.cap.scale.set(w * 1.002, 0.07, w * 1.002); b.ghost.scale.set(w, 1, w);
      (b.body.userData as { bet: SkyBet }).bet = bet;
      if (i < SPRITES && !b.sprite) {
        const mat = new SpriteMaterial({ map: badge(bet.art, t => { mat.map = t; mat.needsUpdate = true; }), transparent: true, depthWrite: false });
        b.sprite = new Sprite(mat); b.sprite.scale.set(1.5, 1.5, 1); b.group.add(b.sprite);
      } else if (i >= SPRITES && b.sprite) { b.group.remove(b.sprite); b.sprite.material.map?.dispose(); b.sprite.material.dispose(); b.sprite = null; }
      next.push(b);
    });
    for (const gone of keep.values()) { scene.remove(gone.group); gone.sprite?.material.map?.dispose(); gone.sprite?.material.dispose(); }
    bars = next;
  }
  place(initial, t0);

  // Size, parallax, picking.
  const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / Math.max(1, h);
    // A narrow canvas (a phone) widens the view so the outer bars and their badges stay in frame.
    camera.fov = camera.aspect < 1.3 ? Math.min(64, FOV * (1.3 / camera.aspect) ** 0.8) : FOV; camera.updateProjectionMatrix(); };
  size();
  const ro = new ResizeObserver(size); ro.observe(el);
  const mouse = new Vector2(), par = { x: 0, y: 0 };
  const ray = new Raycaster();
  const pick = (cx: number, cy: number) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(bars.map(b => b.body as Object3D), false)[0];
    const bet = hit ? (hit.object.userData as { bet: SkyBet }).bet : null;
    opts.onPick(bet, cx - r.left, cy - r.top);
    return bet;
  };
  let downAt: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    par.x = ((e.clientX - r.left) / r.width - 0.5); par.y = ((e.clientY - r.top) / r.height - 0.5);
    if (e.pointerType === "mouse") { const b = pick(e.clientX, e.clientY); renderer.domElement.style.cursor = b ? "pointer" : "grab"; controls.autoRotate = !b; }
  };
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && e.pointerType !== "mouse") { const b = pick(e.clientX, e.clientY); controls.autoRotate = !b; }
    downAt = null;
  };
  const onLeave = () => { opts.onPick(null, 0, 0); controls.autoRotate = true; par.x = par.y = 0; };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointerleave", onLeave);

  // Run only while visible.
  let raf = 0, inView = true, alive = true;
  const loop = (t: number) => {
    raf = 0;
    if (!alive || !inView || document.hidden) return;
    for (const b of bars) {
      const k = easeOut((t - b.born) / RISE_MS - (b.born === t0 ? bars.indexOf(b) * 0.02 : 0));
      const h = Math.max(0.001, b.h * k);
      b.body.scale.y = h; b.body.position.y = h / 2;
      b.cap.position.y = h + 0.035;
      b.ghost.scale.y = h * 0.6; b.ghost.position.y = -h * 0.3;
      if (b.sprite) { b.sprite.position.y = h + 1.25 + Math.sin(t / 900 + b.group.position.x) * 0.08; (b.sprite.material as SpriteMaterial).opacity = k; }
    }
    controls.target.x += (par.x * 1.6 - controls.target.x) * 0.04;
    controls.target.y += (2.6 - par.y * 1.0 - controls.target.y) * 0.04;
    controls.update();
    composer.render();
    raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!raf && alive && inView && !document.hidden) raf = requestAnimationFrame(loop); };
  const io = new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); wake(); }, { threshold: 0.01 });
  io.observe(el);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  wake();

  return {
    update(list) { place(list, performance.now()); wake(); },
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose(); composer.dispose(); box.dispose(); glass.dispose(); capMat.dispose(); ghostMat.dispose();
      for (const b of bars) { b.sprite?.material.map?.dispose(); b.sprite?.material.dispose(); }
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
