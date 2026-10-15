// The ad script format. One JSON file in ads/ describes one finished video: its beat grid, its
// scenes in order (each with a transition in) and the copy. Shared by the Remotion composition and
// the Node tools (render, score), so a script is validated once, the same way everywhere.
import { z } from "zod";

const asset = z.string().regex(/^(photos|screens|brand)\/[\w.-]+\.(jpg|jpeg|png|svg)$/, "assets live under public/photos, public/screens or public/brand");
const frac = z.number().min(0).max(1);
const point = z.tuple([frac, frac]);
const lines = z.array(z.string()).min(1).max(6);

/** A camera move: from one framing to another over the scene (scale >= 1 crops in; x/y are fractions of the frame to pan by). */
const framing = z.object({ scale: z.number().min(0.5).max(4).default(1), x: z.number().min(-0.5).max(0.5).default(0), y: z.number().min(-0.5).max(0.5).default(0) });
const camera = z.object({ from: framing.default({}), to: framing.default({}), ease: z.enum(["linear", "inOut", "out"]).default("inOut") });

const copy = z.object({
  kicker: z.string().optional(),
  headline: lines.optional(),
  deck: z.string().optional(),
  /** Index of the headline line set in the softer ink, like the site's two-tone headings. */
  soft: z.array(z.number().int()).default([]),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  /** Beat (within the scene) at which the copy starts to set. */
  at: z.number().min(0).default(0.25),
  size: z.number().min(40).max(220).default(128),
  face: z.enum(["serif", "mono"]).default("serif")
});

const transition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cut") }),
  z.object({
    type: z.literal("tiles"), beats: z.number().positive().default(1),
    cols: z.number().int().min(1).max(12).default(4), rows: z.number().int().min(1).max(20).default(7),
    order: z.enum(["diagonal", "antidiagonal", "center", "edges", "random", "rows", "columns"]).default("diagonal"),
    motion: z.enum(["flip", "flipX", "scale", "rise", "drop", "cut"]).default("flip"),
    spread: z.number().min(0).max(0.95).default(0.6), seed: z.number().int().default(7)
  }),
  z.object({
    type: z.literal("shutter"), beats: z.number().positive().default(1),
    cols: z.number().int().min(2).max(12).default(5), spread: z.number().min(0).max(0.9).default(0.45),
    direction: z.enum(["alternate", "up", "down"]).default("alternate")
  }),
  z.object({
    type: z.literal("halftone"), beats: z.number().positive().default(1),
    cell: z.number().min(24).max(160).default(60), ink: z.enum(["night", "paper"]).default("night"),
    from: z.enum(["bottom", "top", "center", "left"]).default("bottom")
  })
]);

const base = { beats: z.number().positive(), transition: transition.default({ type: "cut" }), chrome: z.boolean().default(true), label: z.string().optional() };

const mosaicCell = z.union([
  z.object({ src: asset, focus: point.default([0.5, 0.5]) }),
  z.object({ text: z.string().max(24), sub: z.string().max(40).optional(), theme: z.enum(["night", "paper", "ink"]).default("paper") })
]);

export const sceneSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("photo"), ...base, src: asset, focus: point.default([0.5, 0.5]), camera: camera.default({ from: { scale: 1.04 }, to: { scale: 1.16 } }), copy: copy.optional(), shade: z.number().min(0).max(1).default(0.55), halftone: z.boolean().default(false) }),
  z.object({
    type: z.literal("headline"), ...base, theme: z.enum(["paper", "night"]).default("paper"),
    section: z.string().default("The public record"), copy, photo: z.object({ src: asset, focus: point.default([0.5, 0.5]), caption: z.string().optional() }).optional()
  }),
  z.object({
    type: z.literal("document"), ...base, form: z.enum(["form4", "10k", "8k"]), highlight: z.number().int().min(0).default(0),
    camera: camera.default({ from: { scale: 1.25, y: 0.06 }, to: { scale: 1.45, y: -0.02 } }), caption: z.string().optional(), tilt: z.number().min(0).max(30).default(14)
  }),
  z.object({
    type: z.literal("screen"), ...base, src: asset, mode: z.enum(["phone", "card"]).default("card"),
    /** phone: vertical scroll from/to (fraction of the scrollable height). card: the screenshot region in view (x, y, width as fractions). */
    from: z.array(z.number()).min(1).max(3), to: z.array(z.number()).min(1).max(3),
    copy: copy.optional(), highlight: z.object({ rect: z.tuple([frac, frac, frac, frac]), at: z.number().min(0).default(1) }).optional(),
    tilt: z.number().min(-20).max(20).default(0)
  }),
  z.object({
    type: z.literal("mosaic"), ...base, cols: z.number().int().min(2).max(5).default(3), rows: z.number().int().min(2).max(5).default(3),
    cells: z.array(mosaicCell).min(4).max(25), order: z.enum(["diagonal", "center", "random", "rows"]).default("center"),
    /** Camera stops in beats: "all" frames the whole wall, a number frames that cell full screen (seamless into a photo scene of the same image). */
    path: z.array(z.object({ at: z.number().min(0), view: z.union([z.literal("all"), z.number().int().min(0)]) })).min(1),
    reveal: z.number().min(0).default(1.5), copy: copy.optional()
  }),
  z.object({ type: z.literal("statement"), ...base, theme: z.enum(["night", "paper"]).default("night"), words: z.array(z.string()).min(1).max(16), soft: z.array(z.number().int()).default([]), kicker: z.string().optional(), size: z.number().min(60).max(260).default(150), face: z.enum(["serif", "mono"]).default("serif") }),
  z.object({ type: z.literal("endcard"), ...base, kicker: z.string(), tagline: lines, cta: z.string(), url: z.string(), fineprint: z.string() })
]);

export const scriptSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  /** What the spot is for and where every claim in it comes from (kept with the script, not rendered). */
  notes: z.string().optional(),
  width: z.literal(1080).default(1080),
  height: z.literal(1920).default(1920),
  fps: z.literal(30).default(30),
  bpm: z.number().min(60).max(180).default(120),
  /** Target length; the scenes' beats must add up to exactly this. */
  seconds: z.number().positive().default(15),
  score: z.object({ key: z.enum(["D", "E", "F", "G", "A", "C"]).default("D"), mood: z.enum(["pulse", "ticker", "drive"]).default("pulse"), seed: z.number().int().default(1) }).default({}),
  scenes: z.array(sceneSchema).min(2)
});

export const parseScript = json => scriptSchema.parse(json);
