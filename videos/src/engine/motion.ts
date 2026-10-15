import { Easing } from "remotion";
import { BRAND_EASE } from "../brand/tokens";

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const brandEase = Easing.bezier(...BRAND_EASE);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const expoInOut = Easing.bezier(0.87, 0, 0.13, 1);
export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const sineInOut = Easing.bezier(0.37, 0, 0.63, 1);

/** Progress of a cue that starts at `start` frames and lasts `length` frames, eased. */
export const cue = (frame: number, start: number, length: number, ease = brandEase) =>
  ease(clamp01(length <= 0 ? (frame >= start ? 1 : 0) : (frame - start) / length));

/** Deterministic hash in [0, 1) for stagger jitter. */
export const hash = (n: number, seed = 1) => {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export type Framing = { scale: number; x: number; y: number };
export type Camera = { from: Framing; to: Framing; ease: "linear" | "inOut" | "out" };

/** Camera transform for progress p (may run past 1 while the scene plays under the next transition). */
export function cameraTransform(cam: Camera, p: number) {
  const e = cam.ease === "linear" ? p : cam.ease === "out" ? expoOut(clamp01(p)) + Math.max(0, p - 1) * 0.15 : sineInOut(clamp01(p)) + Math.max(0, p - 1) * 0.6;
  const s = Math.exp(lerp(Math.log(cam.from.scale), Math.log(cam.to.scale), e));
  const x = lerp(cam.from.x, cam.to.x, e) * 100;
  const y = lerp(cam.from.y, cam.to.y, e) * 100;
  return `translate(${x}%, ${y}%) scale(${s})`;
}
