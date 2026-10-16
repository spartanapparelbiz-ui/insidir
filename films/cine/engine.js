// Insidir films — 3D engine: deterministic frame renderer for coded live-action-style shots.
// WebGL (Three.js) scene → depth of field → bloom → filmic tone map, accumulated over sub-frames
// for real motion blur, then a black-and-white grade (curve, halation, vignette, gate weave).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export const FPS = 30;
export const OUT_W = 1920, OUT_H = 1080;

export class Engine {
  constructor(canvas, { scale = 1, sub = 3, shutter = .5 } = {}) {
    this.w = Math.round(OUT_W * scale); this.h = Math.round(OUT_H * scale);
    this.sub = sub; this.shutter = shutter;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    r.setPixelRatio(1); r.setSize(this.w, this.h, false);
    canvas.style.width = OUT_W + "px"; canvas.style.height = OUT_H + "px";
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(35, this.w / this.h, .05, 2000);
    this.scene = new THREE.Scene();
    const rt = () => new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, rt());
    this.composer.renderToScreen = false;
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 5, aperture: .002, maxblur: .008 });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), .35, .5, .95);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bokeh); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.accum = rt();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, w: { value: 1 } }, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: "uniform sampler2D tex; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * w, 1.0); }",
    });
    this.gradeMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, time: { value: 0 }, contrast: { value: 1.12 }, lift: { value: .02 }, gain: { value: 1.0 }, vig: { value: .55 }, weave: { value: 1 }, flash: { value: 0 }, fade: { value: 1 } },
      depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `
        uniform sampler2D tex; uniform float time, contrast, lift, gain, vig, weave, flash, fade; varying vec2 vUv;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          // gate weave: the frame floats a fraction of a pixel, like film in a projector gate
          vec2 wv = vec2(h(floor(time*24.)) - .5, h(floor(time*24.) + 7.) - .5) * .0009 * weave;
          vec2 uv = vUv + wv;
          vec3 c = texture2D(tex, uv).rgb;
          float l = dot(c, vec3(.2126, .7152, .0722));
          // soft halation around highlights
          vec3 s = vec3(0.); float k = 0.;
          for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { vec2 o = vec2(float(i), float(j)) * .0022; s += texture2D(tex, uv + o).rgb; k += 1.; }
          float hl = dot(s / k, vec3(.2126, .7152, .0722));
          l += max(hl - .7, 0.) * .35;
          // print curve: deep blacks, silver highlights
          l = clamp((l - .5) * contrast + .5 + lift, 0., 1.);
          l = l * l * (3. - 2. * l) * .35 + l * .65;
          l *= gain;
          vec2 p = vUv - .5; float v = 1. - dot(p * vec2(1.15, 1.), p * vec2(1.15, 1.)) * vig * 1.9;
          l *= clamp(v, 0., 1.);
          l = mix(l, 1., flash) * fade;
          gl_FragColor = vec4(vec3(l), 1.);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.addMat);
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
  }
  setDOF(focus, aperture = .002, maxblur = .008) {
    const u = this.bokeh.uniforms; u.focus.value = focus; u.aperture.value = aperture; u.maxblur.value = maxblur;
  }
  // update(t) must pose the whole world (scene, camera, dof) for time t. Renders sub-frames across the shutter.
  render(t, update, grade = {}) {
    const r = this.renderer, n = this.sub;
    r.setRenderTarget(this.accum); r.setClearColor(0x000000, 1); r.clear();
    for (let i = 0; i < n; i++) {
      const ts = t + (n > 1 ? (i / (n - 1) - .5) * this.shutter / FPS : 0);
      update(ts, i);
      this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
      this.composer.render();
      this.quad.material = this.addMat; this.addMat.uniforms.tex.value = this.composer.readBuffer.texture; this.addMat.uniforms.w.value = 1 / n;
      r.setRenderTarget(this.accum); r.autoClear = false; r.render(this.quadScene, this.quadCam); r.autoClear = true;
    }
    const g = this.gradeMat.uniforms;
    g.tex.value = this.accum.texture; g.time.value = t;
    for (const k of ["contrast", "lift", "gain", "vig", "weave", "flash", "fade"]) if (k in grade) g[k].value = grade[k]; else g[k].value = { contrast: 1.12, lift: .02, gain: 1, vig: .55, weave: 1, flash: 0, fade: 1 }[k];
    this.quad.material = this.gradeMat;
    r.setRenderTarget(null); r.render(this.quadScene, this.quadCam);
  }
}

// ---------- deterministic helpers ----------
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }
const hsh = n => { const r = rng(n * 9301 + 49297); r(); return r(); };
export function noise1(x, seed = 1) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hsh(i * 13 + seed) * (1 - u) + hsh((i + 1) * 13 + seed) * u) * 2 - 1; }
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const inv = (a, b, v) => clamp((v - a) / (b - a));
export const ease = {
  out: k => 1 - Math.pow(1 - k, 3), in: k => k * k * k,
  inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  sine: k => .5 - .5 * Math.cos(Math.PI * k),
};
// Camera rig helper: position, look-at target, roll, handheld shake amplitude, focal length.
export function placeCamera(cam, { pos, look, fov = 35, roll = 0, shake = 0, t = 0, seed = 3 }) {
  const p = new THREE.Vector3(...pos), l = new THREE.Vector3(...look);
  if (shake) {
    p.x += (noise1(t * 1.1, seed) * .03 + noise1(t * 4.3, seed + 9) * .008) * shake;
    p.y += (noise1(t * .9, seed + 2) * .025 + noise1(t * 3.7, seed + 4) * .007) * shake;
    l.x += noise1(t * 1.3, seed + 5) * .04 * shake; l.y += noise1(t * 1.2, seed + 6) * .03 * shake;
  }
  cam.position.copy(p); cam.up.set(Math.sin(roll), Math.cos(roll), 0); cam.lookAt(l); cam.fov = fov;
  return p.distanceTo(l);
}
// Canvas → texture.
export function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
export function loadTex(url) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
}
