import React from "react";
import { AbsoluteFill } from "remotion";
import { CopyBlock, headlineFont } from "../brand/Brand";
import { C, SAFE, label } from "../brand/tokens";
import { clamp01, cue, expoOut, hash, lerp, sineInOut } from "../engine/motion";
import { Cover, Night, SceneChrome, type Of, type SceneProps } from "./common";

const W = 1080, H = 1920, GUTTER = 64;

/** Order in which cells reveal, as a 0..1 rank per cell. */
function ranks(cols: number, rows: number, order: string, first: number | null): number[] {
  const n = cols * rows;
  const key = (i: number) => {
    const c = i % cols, r = Math.floor(i / cols);
    if (order === "rows") return r * cols + c;
    if (order === "diagonal") return c + r;
    if (order === "random") return hash(i, 11);
    const fc = first === null ? (cols - 1) / 2 : first % cols, fr = first === null ? (rows - 1) / 2 : Math.floor(first / cols);
    return Math.hypot(c - fc, r - fr) + hash(i, 4) * 0.35;
  };
  const sorted = [...Array(n).keys()].sort((a, b) => key(a) - key(b));
  const out = new Array(n).fill(0);
  sorted.forEach((cell, k) => { out[cell] = n > 1 ? k / (n - 1) : 0; });
  return out;
}

/** A wall of full-frame cells. The camera can start inside one cell (matching the previous scene), pull
 *  back to the whole wall while the other cells land one after another, and push into another cell,
 *  which then fills the frame exactly, for a seamless cut to that image. */
export const MosaicScene: React.FC<SceneProps<Of<"mosaic">>> = p => {
  const { scene, frame, fpb } = p;
  const { cols, rows } = scene;
  const wallW = cols * W + (cols - 1) * GUTTER, wallH = rows * H + (rows - 1) * GUTTER;
  const allScale = Math.min(W / wallW, H / wallH) * 0.94;
  const view = (v: "all" | number) => {
    if (v === "all") return { cx: wallW / 2, cy: wallH / 2, s: allScale };
    const c = v % cols, r = Math.floor(v / cols);
    return { cx: c * (W + GUTTER) + W / 2, cy: r * (H + GUTTER) + H / 2, s: 1 };
  };
  // Camera along the path: hold at each stop, ease between consecutive stops.
  const t = frame / fpb;
  const path = scene.path;
  let cam = view(path[0].view);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (t >= a.at) {
      const k = sineInOut(clamp01((t - a.at) / Math.max(0.001, b.at - a.at)));
      const va = view(a.view), vb = view(b.view);
      cam = { cx: lerp(va.cx, vb.cx, k), cy: lerp(va.cy, vb.cy, k), s: Math.exp(lerp(Math.log(va.s), Math.log(vb.s), k)) };
    }
  }
  const startCell = typeof path[0].view === "number" ? path[0].view : null;
  const rank = ranks(cols, rows, scene.order, startCell);
  const revealFrames = scene.reveal * fpb;
  return (
    <Night>
      <div style={{ position: "absolute", left: 0, top: 0, width: wallW, height: wallH, transformOrigin: "0 0", transform: `translate(${540 - cam.cx * cam.s}px, ${960 - cam.cy * cam.s}px) scale(${cam.s})` }}>
        {scene.cells.slice(0, cols * rows).map((cell, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          const q = i === startCell ? 1 : expoOut(clamp01((frame - rank[i] * revealFrames * 0.75) / (revealFrames * 0.25 + 1)));
          const inner = "src" in cell
            ? <Cover src={cell.src} focus={cell.focus} />
            : (
              <AbsoluteFill style={{ background: cell.theme === "paper" ? C.ink : cell.theme === "ink" ? C.surface2 : C.night, padding: 90, justifyContent: "flex-end", border: cell.theme === "night" ? `4px solid ${C.line2}` : undefined }}>
                <div style={{ ...headlineFont("serif", 300), color: cell.theme === "paper" ? C.night : C.ink }}>{cell.text}</div>
                {cell.sub && <div style={{ ...label(48, cell.theme === "paper" ? C.paperMuted : C.muted), marginTop: 40 }}>{cell.sub}</div>}
              </AbsoluteFill>
            );
          return (
            <div key={i} style={{ position: "absolute", left: c * (W + GUTTER), top: r * (H + GUTTER), width: W, height: H, overflow: "hidden", clipPath: `inset(${(1 - q) * 100}% 0 0 0)` }}>
              <div style={{ position: "absolute", inset: 0, transform: `scale(${lerp(1.25, 1, q)})` }}>{inner}</div>
            </div>
          );
        })}
      </div>
      {scene.copy && (
        <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, ...(scene.copy.position === "top" ? { top: SAFE.top + 110 } : { bottom: 1920 - SAFE.bottom }) }}>
          <div style={{ background: C.night, padding: "34px 36px 40px", display: "inline-block", opacity: cue(frame, scene.copy.at * fpb - 2, 6) }}>
            <CopyBlock frame={frame} fpb={fpb} copy={scene.copy} width={1080 - SAFE.side * 2 - 72} />
          </div>
        </div>
      )}
      <SceneChrome p={p} theme="night" />
    </Night>
  );
};
