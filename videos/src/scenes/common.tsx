import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import type { z } from "zod";
import type { sceneSchema, scriptSchema } from "../engine/schema.mjs";
import { Chrome } from "../brand/Brand";

export type Script = z.infer<typeof scriptSchema>;
export type SceneSpec = z.infer<typeof sceneSchema>;
export type Of<T extends SceneSpec["type"]> = Extract<SceneSpec, { type: T }>;

export type SceneProps<S extends SceneSpec = SceneSpec> = {
  scene: S;
  /** Frame within the scene (keeps counting past `duration` while the next scene transitions in). */
  frame: number;
  duration: number;
  /** duration + the next scene's transition: the span the camera moves over, so motion never stops at a cut. */
  span: number;
  fpb: number;
  folio: string;
  firstScene: boolean;
};

/** Full-frame image, cover-fitted around a focus point. */
export const Cover: React.FC<{ src: string; focus: [number, number]; style?: React.CSSProperties }> = ({ src, focus, style }) => (
  <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus[0] * 100}% ${focus[1] * 100}%`, ...style }} />
);

export const defaultSection: Record<SceneSpec["type"], string> = {
  photo: "Wall Street", headline: "The public record", document: "SEC EDGAR", screen: "Insidir", mosaic: "The record", statement: "Insidir", endcard: ""
};

export const SceneChrome: React.FC<{ p: SceneProps; theme: "night" | "paper" }> = ({ p, theme }) =>
  p.scene.chrome ? <Chrome frame={p.firstScene ? p.frame : 999} section={p.scene.label ?? defaultSection[p.scene.type]} folio={p.folio} theme={theme} opacity={1} /> : null;

export const Night: React.FC<{ children: React.ReactNode; paper?: boolean }> = ({ children, paper }) => (
  <AbsoluteFill style={{ background: paper ? "#e9e4da" : "#0c0c0b", overflow: "hidden" }}>{children}</AbsoluteFill>
);
