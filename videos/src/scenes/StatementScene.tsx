import React from "react";
import { headlineFont } from "../brand/Brand";
import { C, SAFE, label } from "../brand/tokens";
import { cue } from "../engine/motion";
import { Night, SceneChrome, type Of, type SceneProps } from "./common";

/** Typographic beat: words rise out of their masks one after another, on a two-frame stagger. */
export const StatementScene: React.FC<SceneProps<Of<"statement">>> = p => {
  const { scene, frame, fpb } = p;
  const paper = scene.theme === "paper";
  const ink = paper ? C.night : C.ink;
  const soft = paper ? "#6f6b64" : C.muted;
  const start = 0.2 * fpb;
  return (
    <Night paper={paper}>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: SAFE.top + 120, bottom: 1920 - SAFE.bottom, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {scene.kicker && <div style={{ ...label(25, paper ? C.paperMuted : C.muted), marginBottom: 40, opacity: cue(frame, start, 8) }}>{scene.kicker}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: scene.size * 0.26, rowGap: 0 }}>
          {scene.words.map((word, i) => {
            const q = cue(frame, start + 2 + i * 3, 12);
            return (
              <div key={i} style={{ overflow: "hidden", paddingBottom: scene.size * 0.1, marginBottom: -scene.size * 0.06 }}>
                <div style={{ ...headlineFont(scene.face, scene.size), color: scene.soft.includes(i) ? soft : ink, transform: `translateY(${(1 - q) * 108}%)` }}>{word}</div>
              </div>
            );
          })}
        </div>
      </div>
      <SceneChrome p={p} theme={paper ? "paper" : "night"} />
    </Night>
  );
};
