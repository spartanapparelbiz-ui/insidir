// A license-free score for each ad, synthesized from the script itself so music and edit share one clock:
// sub pulses on the beat, a ticker of 16th-note clicks (the tape), a minor-ninth pad that opens up over the
// spot, a whoosh and a cascade of tile clicks on every tiled transition, a thump on hard cuts, a riser into
// the end card and an impact with a long tail under the wordmark. Mastered with FFmpeg loudnorm (two pass)
// to -14 LUFS integrated, -1.5 dBTP.
// Usage: node tools/score.mjs ads/<script>.json out.wav
import { writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseScript } from "../src/engine/schema.mjs";
import { cues, layout } from "../src/engine/timeline.mjs";
import { ffmpegPath } from "./lib/env.mjs";

const SR = 48000;
const ROOTS = { C: 65.41, D: 73.42, E: 82.41, F: 87.31, G: 98.0, A: 110.0 };

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s ^= s << 13, s >>>= 0, s ^= s >>> 17, s ^= s << 5, s >>>= 0) / 4294967296);
}

class Bus {
  constructor(seconds) { this.n = Math.ceil(seconds * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  add(i, l, r = l) { if (i >= 0 && i < this.n) { this.L[i] += l; this.R[i] += r; } }
}

/** One-pole low-pass, stateful. */
const lowpass = () => { let y = 0; return (x, fc) => { const a = 1 - Math.exp((-2 * Math.PI * fc) / SR); y += a * (x - y); return y; }; };
/** One-pole high-pass. */
const highpass = () => { let y = 0, px = 0; return (x, fc) => { const a = 1 / (1 + (2 * Math.PI * fc) / SR); y = a * (y + x - px); px = x; return y; }; };

function kick(bus, t, gain, pan = 0) {
  const start = Math.round(t * SR), len = Math.round(0.42 * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const f = 42 + 88 * Math.exp(-s * 34);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-s * 7.5) * Math.min(1, s * 800);
    const click = i < 96 ? (1 - i / 96) * 0.25 : 0;
    const v = (Math.tanh(Math.sin(phase) * 1.6) * env + click * Math.sin(phase * 7)) * gain;
    bus.add(start + i, v * (1 - pan * 0.3), v * (1 + pan * 0.3));
  }
}

function tick(bus, t, gain, rand, bright = 6000, pan = 0) {
  const start = Math.round(t * SR), len = Math.round(0.03 * SR);
  const hp = highpass(), lp = lowpass();
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-(i / SR) * 260);
    const v = lp(hp(rand() * 2 - 1, 2500), bright) * env * gain;
    bus.add(start + i, v * (1 - pan), v * (1 + pan));
  }
}

function whoosh(bus, t0, t1, gain, rand) {
  // Noise swell that peaks at t1 (the cut), band moving up as it builds.
  const start = Math.round((t0 - 0.05) * SR), end = Math.round((t1 + 0.18) * SR);
  const hp = highpass(), lpL = lowpass(), lpR = lowpass();
  for (let i = start; i < end; i++) {
    const s = i / SR;
    const k = s < t1 ? Math.pow(Math.max(0, (s - (t0 - 0.05)) / (t1 - t0 + 0.05)), 2.2) : Math.exp(-(s - t1) * 22);
    const fc = 500 + 5200 * Math.min(1, Math.max(0, (s - t0) / (t1 - t0 + 1e-6)));
    const n = hp(rand() * 2 - 1, 180);
    bus.add(i, lpL(n, fc) * k * gain, lpR(n * 0.9 + (rand() * 2 - 1) * 0.1, fc * 0.92) * k * gain);
  }
}

function impact(bus, t, gain, rand) {
  kick(bus, t, gain * 1.2);
  const start = Math.round(t * SR), len = Math.round(1.8 * SR);
  const lp = lowpass();
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const v = lp(rand() * 2 - 1, 900 * Math.exp(-s * 1.6) + 120) * Math.exp(-s * 2.2) * gain * 0.7;
    bus.add(start + i, v, -v * 0.6 + v * 0.4);
  }
}

function riser(bus, t0, t1, gain, rand) {
  const start = Math.round(t0 * SR), end = Math.round(t1 * SR);
  const lp = lowpass(), hp = highpass();
  let ph = 0;
  for (let i = start; i < end; i++) {
    const k = (i - start) / (end - start);
    ph += (2 * Math.PI * (220 + 660 * k * k)) / SR;
    const v = (lp(hp(rand() * 2 - 1, 300), 900 + 7000 * k * k) * 0.8 + Math.sin(ph) * 0.12) * Math.pow(k, 2.4) * gain;
    bus.add(i, v, v * 0.92);
  }
}

function pad(bus, t0, t1, root, gainAt, cutoffAt) {
  // Minor-ninth voicing: root, fifth, minor tenth, minor seventh, ninth; three detuned saws per voice.
  const notes = [root * 2, root * 3, root * 4 * Math.pow(2, 3 / 12), root * 4 * Math.pow(2, 10 / 12), root * 8 * Math.pow(2, 2 / 12)];
  const voices = notes.flatMap((f, n) => [-7, 0, 6].map(c => ({ f: f * Math.pow(2, c / 1200), ph: (n * 0.37 + c) % 1, pan: ((n % 2) * 2 - 1) * 0.35 + c / 30 })));
  const lpL = lowpass(), lpR = lowpass(), lp2L = lowpass(), lp2R = lowpass();
  const start = Math.round(t0 * SR), end = Math.round(t1 * SR);
  for (let i = start; i < end; i++) {
    const s = i / SR;
    let l = 0, r = 0;
    for (const v of voices) {
      v.ph += v.f / SR; if (v.ph >= 1) v.ph -= 1;
      const saw = 2 * v.ph - 1;
      l += saw * (1 - v.pan); r += saw * (1 + v.pan);
    }
    const g = gainAt(s) / voices.length, fc = cutoffAt(s);
    bus.add(i, lp2L(lpL(l, fc), fc) * g, lp2R(lpR(r, fc), fc) * g);
  }
}

function bass(bus, t, len, f, gain) {
  const start = Math.round(t * SR), n = Math.round(len * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, s * 60) * Math.exp(-s * 2.2);
    bus.add(start + i, Math.tanh(Math.sin(ph) * 1.4 + Math.sin(ph * 2) * 0.15) * env * gain);
  }
}

/** Small Schroeder reverb (4 combs, 2 all-passes) per channel. */
function reverb(input, seconds = 2.2, mix = 0.25) {
  const out = new Float32Array(input.length);
  const combs = [1557, 1617, 1491, 1422].map(d => ({ buf: new Float32Array(d), i: 0, fb: Math.pow(0.001, d / SR / seconds), lp: 0 }));
  const aps = [225, 556].map(d => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < input.length; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = input[n] + c.lp * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    acc *= 0.25;
    for (const a of aps) {
      const b = a.buf[a.i];
      const y = -acc + b;
      a.buf[a.i] = acc + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      acc = y;
    }
    out[n] = input[n] * (1 - mix) + acc * mix;
  }
  return out;
}

export function synthesize(script) {
  const rand = rng(script.score.seed);
  const plan = layout(script);
  const beat = 60 / script.bpm;
  const total = plan.totalFrames / script.fps;
  const list = cues(script);
  const end = list.find(c => c.type === "endcard");
  const endAt = end ? end.start : total;
  const root = ROOTS[script.score.key];
  const mood = script.score.mood;

  const dry = new Bus(total + 0.5), wet = new Bus(total + 0.5);

  // Pad under everything; opens up toward the end card, then rings out under the wordmark.
  pad(wet, 0, total, root,
    s => (0.16 * Math.min(1, s / 1.2) + (s > endAt ? 0.07 * Math.exp(-(s - endAt) * 0.35) : 0)) * (s > total - 0.5 ? Math.max(0, (total - s) / 0.5) : 1),
    s => (s < endAt ? 380 + 1500 * Math.pow(s / endAt, 1.6) : 2400 * Math.exp(-(s - endAt) * 0.25) + 600));

  // Beat grid until the end card.
  const beats = Math.round(endAt / beat);
  for (let b = 0; b < beats; b++) {
    const t = b * beat, bar = b % 4;
    if (mood === "drive" || bar === 0 || bar === 2 || b === 0) kick(dry, t, bar === 0 ? 0.5 : 0.36);
    else if (mood === "pulse") kick(dry, t, 0.22);
    if (bar === 0) bass(dry, t, beat * 2, root, 0.15);
    if (bar === 2) bass(dry, t, beat * 1.5, root * Math.pow(2, (b % 8 === 2 ? 7 : 3) / 12), 0.11);
    for (let s = 0; s < 4; s++) {
      if (mood === "pulse" && s % 2) continue;
      const accent = s === 2 ? 1 : s === 0 ? 0.55 : 0.35;
      tick(dry, t + (s * beat) / 4, (mood === "ticker" ? 0.2 : 0.13) * accent, rand, s === 2 ? 9000 : 6500, (s % 2 ? 0.25 : -0.25));
    }
  }

  // Transitions and cuts, from the edit.
  list.forEach((c, i) => {
    if (i === 0) return;
    if (c.type === "endcard") return;
    if (c.transition === "cut") { kick(dry, c.start, 0.35); tick(dry, c.start, 0.25, rand, 4000); return; }
    const t1 = c.start + (c.transitionEnd - c.start) * 0.55;
    whoosh(wet, c.start - beat * 0.5, t1, 0.16, rand);
    if (c.transition === "tiles" || c.transition === "shutter") {
      const n = c.transition === "tiles" ? 14 : 6;
      for (let k = 0; k < n; k++) tick(dry, c.start + (k / n) * (c.transitionEnd - c.start) * 0.9, 0.09 + 0.05 * rand(), rand, 5000 + 4000 * rand(), rand() * 1.2 - 0.6);
    }
  });

  if (end) {
    riser(wet, Math.max(0, endAt - beat * 2), endAt, 0.2, rand);
    impact(wet, endAt, 0.75, rand);
    bass(dry, endAt, 3, root / 2, 0.18);
  }

  const L = new Float32Array(dry.n), R = new Float32Array(dry.n);
  const wl = reverb(wet.L, 2.4, 0.32), wr = reverb(wet.R, 2.6, 0.32);
  const dl = reverb(dry.L, 0.8, 0.08), dr = reverb(dry.R, 0.9, 0.08);
  for (let i = 0; i < dry.n; i++) {
    const fade = i / SR > total - 0.25 ? Math.max(0, (total - i / SR) / 0.25) : 1;
    L[i] = Math.tanh((dl[i] + wl[i]) * 1.1) * fade;
    R[i] = Math.tanh((dr[i] + wr[i]) * 1.1) * fade;
  }
  return { L: L.subarray(0, Math.round(total * SR)), R: R.subarray(0, Math.round(total * SR)) };
}

function wav16(L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

/** Synthesize, then master to -14 LUFS / -1.5 dBTP with two-pass loudnorm. */
export async function writeScore(script, out) {
  const { L, R } = synthesize(script);
  const raw = out.replace(/\.wav$/, ".raw.wav");
  await writeFile(raw, wav16(L, R));
  const target = "I=-14:TP=-1.5:LRA=11";
  // Pass 1 measures (loudnorm reports on stderr); pass 2 applies a linear gain from the measurement.
  const report = spawnSync(ffmpegPath(), ["-hide_banner", "-i", raw, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const measured = JSON.parse(report.slice(report.lastIndexOf("{"), report.lastIndexOf("}") + 1));
  const af = `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  execFileSync(ffmpegPath(), ["-y", "-v", "error", "-i", raw, "-af", `${af},alimiter=limit=0.84:attack=1:release=40:level=false,aresample=48000`, "-ar", "48000", "-c:a", "pcm_s16le", out]);
  await rm(raw, { force: true });
  return { input: measured };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, out] = process.argv.slice(2);
  const script = parseScript(JSON.parse(await readFile(file, "utf8")));
  const r = await writeScore(script, out);
  console.log(`score ${out}: input ${r.input.input_i} LUFS, ${r.input.input_tp} dBTP -> -14 LUFS`);
}
