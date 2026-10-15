import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, MONO, SERIF, SAFE, label } from "./tokens";
import { cue, lerp } from "../engine/motion";

/** The logo: `insidir.` in JetBrains Mono 800, tracked -0.04em, lowercase, full stop in ink (.v6-logo). */
export const Wordmark: React.FC<{ size: number; color?: string; style?: React.CSSProperties }> = ({ size, color = C.ink, style }) => (
  <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", lineHeight: 1, color, whiteSpace: "nowrap", ...style }}>
    insidir<span>.</span>
  </span>
);

/** Print grain over everything, like the site's fractal-noise overlay; it changes every other frame. */
export const Grain: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 0.085 }) => (
  <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
    <Img src={staticFile(`brand/grain-${Math.floor(frame / 2) % 4}.png`)} style={{ width: "100%", height: "100%" }} />
  </AbsoluteFill>
);

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 120% 90% at 50% 45%, rgba(12,12,11,0) 55%, rgba(12,12,11,${strength}) 100%)` }} />
);

/** Masthead strip kept on screen across scenes: wordmark, a section label and a folio, over a hairline. */
export const Chrome: React.FC<{ frame: number; section: string; folio: string; theme: "night" | "paper"; opacity: number }> = ({ frame, section, folio, theme, opacity }) => {
  const ink = theme === "paper" ? C.night : C.ink;
  const muted = theme === "paper" ? C.paperMuted : C.muted;
  const line = theme === "paper" ? "rgba(12,12,11,.28)" : "rgba(233,228,218,.22)";
  const enter = cue(frame, 0, 14);
  return (
    <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 150, opacity, pointerEvents: "none" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 18 }}>
        <Wordmark size={46} color={ink} />
        <span style={{ ...label(21, muted) }}>{section}<span style={{ marginLeft: 26, color: ink }}>{folio}</span></span>
      </div>
      <div style={{ height: 2, background: line, transformOrigin: "left", transform: `scaleX(${lerp(0, 1, enter)})` }} />
    </div>
  );
};

type CopyProps = {
  kickerColor?: string;
  frame: number;
  fpb: number;
  copy: { kicker?: string; headline?: string[]; deck?: string; soft: number[]; position: "top" | "center" | "bottom"; at: number; size: number; face: "serif" | "mono" };
  theme?: "night" | "paper";
  width?: number;
  align?: "left" | "center";
};

export const headlineFont = (face: "serif" | "mono", size: number): React.CSSProperties =>
  face === "serif"
    ? { fontFamily: SERIF, fontWeight: 650, fontSize: size, lineHeight: 0.96, letterSpacing: "-0.022em", fontVariationSettings: "'opsz' 60" }
    : { fontFamily: MONO, fontWeight: 700, fontSize: size * 0.82, lineHeight: 1.04, letterSpacing: "-0.03em" };

/** Kicker, headline and deck, set line by line out of a mask on the beat (each line 2 frames apart). */
export const CopyBlock: React.FC<CopyProps> = ({ frame, fpb, copy, theme = "night", width = 1080 - SAFE.side * 2, align = "left", kickerColor }) => {
  const start = copy.at * fpb;
  const ink = theme === "paper" ? C.night : C.ink;
  const soft = theme === "paper" ? "#57544e" : C.soft;
  const muted = theme === "paper" ? C.paperMuted : C.muted;
  const lines = copy.headline ?? [];
  const kickerIn = cue(frame, start, 10);
  const deckIn = cue(frame, start + 6 + lines.length * 2, 14);
  return (
    <div style={{ width, textAlign: align, display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start" }}>
      {copy.kicker && (
        <div style={{ ...label(25, kickerColor ?? muted), marginBottom: 30, clipPath: `inset(0 ${100 - kickerIn * 100}% 0 0)` }}>{copy.kicker}</div>
      )}
      {lines.map((line, i) => {
        const p = cue(frame, start + 3 + i * 2, 13);
        return (
          <div key={i} style={{ overflow: "hidden", paddingBottom: copy.size * 0.08, marginBottom: -copy.size * 0.08 }}>
            <div style={{ ...headlineFont(copy.face, copy.size), color: copy.soft.includes(i) ? soft : ink, transform: `translateY(${(1 - p) * 105}%)`, whiteSpace: "nowrap" }}>{line}</div>
          </div>
        );
      })}
      {copy.deck && (
        <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 31, lineHeight: 1.5, color: soft, marginTop: 34, maxWidth: width, opacity: deckIn, transform: `translateY(${(1 - deckIn) * 12}px)` }}>{copy.deck}</div>
      )}
    </div>
  );
};
