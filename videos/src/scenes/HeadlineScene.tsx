import React from "react";
import { AbsoluteFill } from "remotion";
import { CopyBlock } from "../brand/Brand";
import { C, SAFE, label } from "../brand/tokens";
import { cue, lerp, sineInOut } from "../engine/motion";
import { Cover, Night, SceneChrome, type Of, type SceneProps } from "./common";

/** A front page: double rule, section line, a photograph above the fold with its caption, and the
 *  headline set in the display cut of Source Serif 4. */
export const HeadlineScene: React.FC<SceneProps<Of<"headline">>> = p => {
  const { scene, frame, span, fpb } = p;
  const paper = scene.theme === "paper";
  const ink = paper ? C.night : C.ink;
  const muted = paper ? C.paperMuted : C.muted;
  const rule = cue(frame, 0, 12);
  const photoIn = cue(frame, 2, 16);
  const drift = sineInOut(Math.min(1, frame / span));
  return (
    <Night paper={paper}>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 268 }}>
        <div style={{ height: 7, background: ink, transformOrigin: "left", transform: `scaleX(${rule})` }} />
        <div style={{ height: 2, background: ink, marginTop: 6, transformOrigin: "right", transform: `scaleX(${rule})` }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0 0", ...label(21, muted), opacity: rule }}>
          <span>{scene.section}</span><span>Public records</span>
        </div>
      </div>
      {scene.photo && (
        <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 372, height: 600, overflow: "hidden", clipPath: `inset(0 0 ${100 - photoIn * 100}% 0)` }}>
          <AbsoluteFill style={{ transform: `scale(${lerp(1.18, 1.05, drift)}) translateY(${lerp(-2, 2, drift)}%)` }}>
            <Cover src={scene.photo.src} focus={scene.photo.focus} />
          </AbsoluteFill>
        </div>
      )}
      {scene.photo?.caption && (
        <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 990, ...label(19, muted), letterSpacing: "0.12em", opacity: photoIn }}>{scene.photo.caption}</div>
      )}
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: scene.photo ? 1060 : 420 }}>
        <CopyBlock frame={frame} fpb={fpb} copy={scene.copy} theme={paper ? "paper" : "night"} />
      </div>
      <SceneChrome p={p} theme={paper ? "paper" : "night"} />
    </Night>
  );
};
