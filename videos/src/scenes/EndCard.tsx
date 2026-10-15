import React from "react";
import { headlineFont } from "../brand/Brand";
import { HalftoneWord } from "../brand/HalftoneWord";
import { C, MONO, SAFE, label } from "../brand/tokens";
import { clamp01, cue } from "../engine/motion";
import { Night, type Of, type SceneProps } from "./common";

/** The landing page's first screen, as an end card: kicker, tagline, the halftone wordmark standing on a
 *  hairline (cropped by it, as on the site), then the call to action and the plain-spoken fine print. */
export const EndCard: React.FC<SceneProps<Of<"endcard">>> = p => {
  const { scene, frame, fpb } = p;
  const word = clamp01((frame - fpb * 0.15) / (fpb * 2.2));
  const k = cue(frame, 0, 10);
  const cta = cue(frame, fpb * 1.7, 12);
  const fine = cue(frame, fpb * 2.3, 12);
  return (
    <Night>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 360 }}>
        <div style={{ ...label(25), opacity: k, marginBottom: 34 }}>{scene.kicker}</div>
        {scene.tagline.map((line, i) => {
          const q = cue(frame, 3 + i * 3, 13);
          return (
            <div key={i} style={{ overflow: "hidden", paddingBottom: 12, marginBottom: -12 }}>
              <div style={{ ...headlineFont("serif", 120), color: i === scene.tagline.length - 1 ? C.soft : C.ink, transform: `translateY(${(1 - q) * 105}%)` }}>{line}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 780, height: 330, borderBottom: `2px solid rgba(233,228,218,.3)` }}>
        <HalftoneWord width={1080} height={330} gap={13} crop={0.22} progress={word} />
      </div>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 1180, opacity: cta, transform: `translateY(${(1 - cta) * 12}px)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.ink, color: C.night, padding: "30px 34px", ...label(28, C.night), fontWeight: 600 }}>
          <span>{scene.cta}</span><span style={{ fontFamily: '"JetBrains Mono Symbols", monospace', letterSpacing: 0 }}>↗</span>
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 52, letterSpacing: "-0.03em", color: C.ink, marginTop: 40 }}>{scene.url}</div>
      </div>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 1400, fontFamily: MONO, fontSize: 25, lineHeight: 1.6, color: C.muted, opacity: fine }}>{scene.fineprint}</div>
    </Night>
  );
};
