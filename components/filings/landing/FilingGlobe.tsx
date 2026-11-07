"use client";
/* The /edgar hero's 3D visual, in raw WebGL (no library): a globe of points with a tilted orbit ring, where each recent
 * filing on the page lights one point in its record type's colour (code P emerald, code S crimson, 8-K cyan), pulsing,
 * with a spike whose height follows the dollars filed (log scale). It turns slowly and leans toward the pointer.
 * Costs nothing when unseen: it stops drawing offscreen and in background tabs, draws one still frame for readers who
 * ask for reduced motion, and falls back to a CSS sphere where WebGL is unavailable. Decorative: the same filings
 * are in the table below, in words. */
import { useEffect, useRef, useState } from "react";

export interface GlobeMark { id: number; kind: "P" | "S" | "K"; v: number }

const N = 2600, RING = 420;
const SKY = [0.62, 0.72, 1.0], BLUE = [0.36, 0.49, 0.98];
const TONE: Record<GlobeMark["kind"], [number, number, number]> = { P: [0.06, 0.73, 0.51], S: [0.9, 0.28, 0.3], K: [0.13, 0.72, 0.81] };
const hash = (n: number) => { let x = n | 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

const VERT = `
attribute vec3 a_pos; attribute vec3 a_col; attribute float a_size; attribute float a_phase;
uniform float u_time; uniform vec2 u_rot; uniform float u_aspect; uniform float u_dpr;
varying vec3 v_col; varying float v_alpha;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void main() {
  vec3 p = rotX(u_rot.x) * rotY(u_rot.y + u_time * 0.07) * a_pos;
  float z = p.z + 3.4;
  vec2 xy = p.xy * 2.3 / z;
  gl_Position = vec4(xy.x / u_aspect, xy.y, 0.0, 1.0);
  float front = clamp(0.5 - p.z * 0.45, 0.0, 1.0);
  float pulse = a_phase < 0.0 ? 0.0 : 0.5 + 0.5 * sin(u_time * 2.0 + a_phase);
  gl_PointSize = a_size * u_dpr * (3.4 / z) * (1.0 + pulse * 0.7);
  v_col = a_col;
  v_alpha = mix(0.16, 1.0, front * front) * (a_phase < 0.0 ? 1.0 : 0.75 + pulse * 0.25);
}`;
const FRAG = `
precision mediump float;
varying vec3 v_col; varying float v_alpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  a *= a * v_alpha;
  gl_FragColor = vec4(v_col * a, a);
}`;

/** Point positions, colours, sizes and pulse phases: the globe, its ring, then each mark and its spike. */
function geometry(marks: readonly GlobeMark[]) {
  const pos: number[] = [], col: number[] = [], size: number[] = [], phase: number[] = [];
  const push = (x: number, y: number, z: number, c: readonly number[], s: number, ph: number) => { pos.push(x, y, z); col.push(c[0]!, c[1]!, c[2]!); size.push(s); phase.push(ph); };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const sphere: Array<[number, number, number]> = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const p: [number, number, number] = [Math.cos(th) * r, y, Math.sin(th) * r];
    sphere.push(p);
    const m = hash(i) * 0.35;
    push(p[0], p[1], p[2], [SKY[0]! * (1 - m) + BLUE[0]! * m, SKY[1]! * (1 - m) + BLUE[1]! * m, SKY[2]!], 2.0 + hash(i + 7) * 1.3, -1);
  }
  // The orbit ring, tilted 18°.
  const tilt = 0.31;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2, x = Math.cos(a) * 1.42, z = Math.sin(a) * 1.42;
    push(x, -Math.sin(tilt) * z, Math.cos(tilt) * z, BLUE, 1.5, -1);
  }
  // Marks: a point per filing, and a spike rising from it (taller for more dollars).
  for (const mk of marks) {
    const [x, y, z] = sphere[Math.floor(hash(mk.id * 2654435761) * N)]!;
    const c = TONE[mk.kind];
    push(x, y, z, c, 7.5, hash(mk.id) * 6.28);
    const len = mk.kind === "K" ? 0.12 : 0.06 + 0.3 * Math.min(1, Math.max(0, (Math.log10(Math.max(mk.v, 1)) - 3) / 4));
    for (let k = 1; k <= 8; k++) {
      const f = 1 + (len * k) / 8, fade = 1 - k / 9;
      push(x * f, y * f, z * f, [c[0] * fade, c[1] * fade, c[2] * fade], 2.6 * fade + 0.8, -1);
    }
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), size: new Float32Array(size), phase: new Float32Array(phase), count: size.length };
}

export function FilingGlobe({ marks }: { marks: readonly GlobeMark[] }) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const key = marks.map(m => m.id).join(",");

  useEffect(() => {
    const el = canvas.current, wrap = box.current;
    if (!el || !wrap) return;
    const gl = el.getContext("webgl", { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) { setFallback(true); return; }
    const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFallback(true); return; }
    gl.useProgram(prog);
    const g = geometry(marks);
    const attr = (name: string, data: Float32Array, n: number) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
      return b;
    };
    const bufs = [attr("a_pos", g.pos, 3), attr("a_col", g.col, 3), attr("a_size", g.size, 1), attr("a_phase", g.phase, 1)];
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uTime = u("u_time"), uRot = u("u_rot"), uAspect = u("u_aspect"), uDpr = u("u_dpr");
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(2, window.devicePixelRatio || 1), raf = 0, visible = true, t0 = performance.now();
    const target = { x: 0.32, y: 0 }, rot = { x: 0.32, y: 0 };
    const size = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(w * dpr)); el.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform1f(uAspect, w / Math.max(1, h)); gl.uniform1f(uDpr, dpr);
    };
    const draw = (t: number) => {
      rot.x += (target.x - rot.x) * 0.05; rot.y += (target.y - rot.y) * 0.05;
      gl.uniform1f(uTime, t); gl.uniform2f(uRot, rot.x, rot.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, g.count);
    };
    const loop = () => { draw((performance.now() - t0) / 1000); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; };
    const resume = () => { if (!raf && visible && !document.hidden && !still) raf = requestAnimationFrame(loop); };
    size();
    if (still) draw(4); else resume();

    const ro = new ResizeObserver(() => { size(); if (still) draw(4); });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); resume(); });
    io.observe(wrap);
    const onVis = () => resume();
    document.addEventListener("visibilitychange", onVis);
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      target.y = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
      target.x = 0.32 + ((e.clientY - r.top) / r.height - 0.5) * 0.5;
    };
    const onLeave = () => { target.x = 0.32; target.y = 0; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave);
      bufs.forEach(b => gl.deleteBuffer(b)); gl.deleteProgram(prog);
    };
    // Rebuild only when the set of filings changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div ref={box} className={`lp-globe${fallback ? " is-fallback" : ""}`} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
