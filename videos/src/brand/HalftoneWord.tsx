// The landing page's halftone wordmark (web/assets/js/v13-halftone.js), for video: the word set to fill
// the width, cropped by the bottom edge, printed as dots sized by how much of the letter covers each cell
// (area-true radius sqrt(coverage) * gap * 0.56). Instead of answering a pointer, it assembles over time:
// each dot travels home from the scatter direction the site uses and grows to size, left to right.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { fontsReady } from "./fonts";
import { MONO, C } from "./tokens";
import { clamp01, expoOut, hash } from "../engine/motion";

type Dot = { hx: number; hy: number; r: number; dx: number; dy: number; delay: number };

const radius = (coverage: number, gap: number) => Math.sqrt(clamp01(coverage)) * gap * 0.56;

function layoutDots(word: string, w: number, h: number, gap: number, crop: number, letterSpacing: string): Dot[] {
  const mask = document.createElement("canvas");
  mask.width = w; mask.height = h;
  const m = mask.getContext("2d", { willReadFrequently: true })!;
  (m as unknown as { letterSpacing: string }).letterSpacing = letterSpacing;
  m.font = `800 100px ${MONO}`;
  const fit = (w * 1.02 / m.measureText(word).width) * 100;
  m.font = `800 ${fit}px ${MONO}`;
  const box = m.measureText(word);
  const cap = box.actualBoundingBoxAscent || fit * 0.72;
  m.fillStyle = "#000";
  m.textBaseline = "alphabetic";
  m.fillText(word, (w - box.width) / 2, h + cap * crop);
  const img = m.getImageData(0, 0, w, h).data;
  const dots: Dot[] = [];
  const cols = Math.ceil(w / gap), rows = Math.ceil(h / gap);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    let sum = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const x = Math.min(w - 1, Math.floor(gx * gap + ((sx + 0.5) * gap) / 3));
      const y = Math.min(h - 1, Math.floor(gy * gap + ((sy + 0.5) * gap) / 3));
      sum += img[(y * w + x) * 4 + 3];
    }
    const cov = sum / (9 * 255);
    if (cov < 0.06) continue;
    const hx = gx * gap + gap / 2, hy = gy * gap + gap / 2, i = dots.length;
    // Away from the bottom centre the word stands on, turned a little and lengthened by a fixed hash.
    const a = Math.atan2(hy - h * 1.1, hx - w / 2) + (hash(i, 3) - 0.5) * 0.9;
    const dist = 60 + hash(i, 5) * 260;
    dots.push({ hx, hy, r: radius(cov, gap), dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, delay: (hx / w) * 0.55 + hash(i, 9) * 0.22 });
  }
  return dots;
}

export const HalftoneWord: React.FC<{ word?: string; width: number; height: number; gap: number; crop?: number; letterSpacing?: string; progress: number; color?: string }> = ({ word = "insidir", width, height, gap, crop = 0.22, letterSpacing = "-0.02em", progress, color = C.ink }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("halftone wordmark font"));
  useEffect(() => { fontsReady.then(() => { setReady(true); continueRender(handle); }); }, [handle]);
  const dots = useMemo(() => (ready ? layoutDots(word, width, height, gap, crop, letterSpacing) : []), [ready, word, width, height, gap, crop, letterSpacing]);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const d of dots) {
      const q = expoOut(clamp01((progress - d.delay) / 0.24));
      if (q <= 0) continue;
      const x = d.hx + d.dx * (1 - q), y = d.hy + d.dy * (1 - q), r = d.r * (0.35 + 0.65 * q);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }, [dots, progress, width, height, color]);
  return <canvas ref={canvas} width={width} height={height} style={{ display: "block", width, height }} />;
};
