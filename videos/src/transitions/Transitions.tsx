import React from "react";
import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { sceneSchema } from "../engine/schema.mjs";
import { C } from "../brand/tokens";
import { clamp01, expoInOut, hash, inOut } from "../engine/motion";

type Spec = z.infer<typeof sceneSchema>["transition"];
export type TransitionProps<T extends Spec["type"]> = { spec: Extract<Spec, { type: T }>; t: number; from: () => React.ReactNode; to: () => React.ReactNode };

const W = 1080, H = 1920;

/** One rectangle of a full frame: the frame is rendered whole and offset inside a clipping box. */
const Slice: React.FC<{ x: number; y: number; w: number; h: number; children: React.ReactNode; style?: React.CSSProperties; inner?: React.CSSProperties }> = ({ x, y, w, h, children, style, inner }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", ...style }}>
    <div style={{ position: "absolute", left: -x, top: -y, width: W, height: H, ...inner }}>{children}</div>
  </div>
);

/** Stagger rank in [0, 1] for each tile of a cols x rows grid. */
export function tileRanks(cols: number, rows: number, order: string, seed: number): number[] {
  const n = cols * rows;
  const key = (i: number) => {
    const c = i % cols, r = Math.floor(i / cols), cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    switch (order) {
      case "diagonal": return (c / Math.max(1, cols - 1)) * 0.45 + (r / Math.max(1, rows - 1)) + hash(i, seed) * 0.08;
      case "antidiagonal": return ((cols - 1 - c) / Math.max(1, cols - 1)) * 0.45 + ((rows - 1 - r) / Math.max(1, rows - 1)) + hash(i, seed) * 0.08;
      case "center": return Math.hypot((c - cx) / cols, (r - cy) / rows) + hash(i, seed) * 0.05;
      case "edges": return -Math.hypot((c - cx) / cols, (r - cy) / rows) + hash(i, seed) * 0.05;
      case "rows": return r + c * 0.15;
      case "columns": return c + r * 0.06;
      default: return hash(i, seed);
    }
  };
  const keys = [...Array(n).keys()].map(key);
  const lo = Math.min(...keys), hi = Math.max(...keys);
  return keys.map(k => (hi > lo ? (k - lo) / (hi - lo) : 0));
}

export const Tiles: React.FC<TransitionProps<"tiles">> = ({ spec, t, from, to }) => {
  const { cols, rows, motion, spread } = spec;
  const tw = W / cols, th = H / rows;
  const ranks = tileRanks(cols, rows, spec.order, spec.seed);
  const tiles = ranks.map((rank, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = Math.round(c * tw), y = Math.round(r * th), w = Math.round((c + 1) * tw) - x, h = Math.round((r + 1) * th) - y;
    const local = clamp01((t - rank * spread) / (1 - spread));
    return { i, x, y, w, h, local };
  });
  if (motion === "flip" || motion === "flipX") {
    const axis = motion === "flip" ? "rotateY" : "rotateX";
    return (
      <AbsoluteFill style={{ background: C.night }}>
        {tiles.map(({ i, x, y, w, h, local }) => {
          const a = expoInOut(local) * 180;
          const face: React.CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
          return (
            <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: h, transformStyle: "preserve-3d", transform: `perspective(1600px) ${axis}(${a}deg) scale(${1 - Math.sin((a / 180) * Math.PI) * 0.06})` }}>
              <Slice x={x} y={y} w={w} h={h} style={{ left: 0, top: 0, ...face }}>{from()}</Slice>
              <Slice x={x} y={y} w={w} h={h} style={{ left: 0, top: 0, ...face, transform: `${axis}(180deg)` }}>{to()}</Slice>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {from()}
      {tiles.map(({ i, x, y, w, h, local }) => {
        if (local <= 0) return null;
        const e = expoInOut(local);
        if (motion === "cut") return local < 0.5 ? null : <Slice key={i} x={x} y={y} w={w} h={h}>{to()}</Slice>;
        if (motion === "scale") {
          return <Slice key={i} x={x} y={y} w={w} h={h} style={{ transform: `scale(${e})`, background: C.night }}>{to()}</Slice>;
        }
        const dir = motion === "rise" ? 1 : -1;
        return <Slice key={i} x={x} y={y} w={w} h={h} inner={{ transform: `translateY(${(1 - e) * h * dir}px)` }} style={{ clipPath: `inset(${motion === "rise" ? (1 - e) * 100 : 0}% 0 ${motion === "drop" ? (1 - e) * 100 : 0}% 0)` }}>{to()}</Slice>;
      })}
    </AbsoluteFill>
  );
};

export const Shutter: React.FC<TransitionProps<"shutter">> = ({ spec, t, from, to }) => {
  const { cols, spread } = spec;
  const cw = W / cols;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {[...Array(cols).keys()].map(c => {
        const x = Math.round(c * cw), w = Math.round((c + 1) * cw) - x;
        const local = clamp01((t - (c / Math.max(1, cols - 1)) * spread) / (1 - spread));
        const e = expoInOut(local);
        const dir = spec.direction === "up" ? -1 : spec.direction === "down" ? 1 : c % 2 === 0 ? -1 : 1;
        return (
          <div key={c} style={{ position: "absolute", left: x, top: 0, width: w, height: H, overflow: "hidden" }}>
            <Slice x={x} y={0} w={w} h={H} style={{ left: 0, top: 0, transform: `translateY(${e * H * dir}px)` }}>{from()}</Slice>
            <Slice x={x} y={0} w={w} h={H} style={{ left: 0, top: 0, transform: `translateY(${(e - 1) * H * dir}px)` }}>{to()}</Slice>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** The brand's dots as a wipe: a screen of dots grows until it covers the frame, then shrinks away
 *  in the same order over the next scene. */
export const Halftone: React.FC<TransitionProps<"halftone">> = ({ spec, t, from, to }) => {
  const cell = spec.cell;
  const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
  const maxR = cell * 0.74;
  const band = 0.55;
  const half = t < 0.5;
  const phase = half ? inOut(t * 2) : inOut((t - 0.5) * 2);
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cell + (r % 2 ? cell / 2 : 0), y = r * cell;
    const d = spec.from === "bottom" ? 1 - y / H : spec.from === "top" ? y / H : spec.from === "left" ? x / W : Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2);
    const k = clamp01((phase * (1 + band) - d) / band);
    const radius = (half ? k : 1 - k) * maxR;
    if (radius > 0.3) dots.push(<circle key={r * cols + c} cx={x} cy={y} r={radius} />);
  }
  return (
    <AbsoluteFill>
      {half ? from() : to()}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <g fill={spec.ink === "paper" ? C.ink : C.night}>{dots}</g>
      </svg>
    </AbsoluteFill>
  );
};
