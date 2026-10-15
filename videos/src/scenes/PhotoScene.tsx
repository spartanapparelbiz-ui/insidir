import React from "react";
import { AbsoluteFill } from "remotion";
import { CopyBlock } from "../brand/Brand";
import { C, SAFE } from "../brand/tokens";
import { cameraTransform } from "../engine/motion";
import { Cover, Night, SceneChrome, type Of, type SceneProps } from "./common";

/** Full-bleed photograph with a continuous camera move, a shade for legibility and optional copy. */
export const PhotoScene: React.FC<SceneProps<Of<"photo">>> = p => {
  const { scene, frame, span, fpb } = p;
  const pos = scene.copy?.position ?? "bottom";
  const shade = scene.shade;
  const gradient = pos === "top"
    ? `linear-gradient(180deg, rgba(12,12,11,${shade + 0.25}) 0%, rgba(12,12,11,${shade}) 38%, rgba(12,12,11,0) 62%)`
    : pos === "center"
      ? `rgba(12,12,11,${shade * 0.75})`
      : `linear-gradient(0deg, rgba(12,12,11,${Math.min(1, shade + 0.35)}) 0%, rgba(12,12,11,${shade}) 36%, rgba(12,12,11,0) 64%)`;
  return (
    <Night>
      <AbsoluteFill style={{ transform: cameraTransform(scene.camera, frame / span), transformOrigin: `${scene.focus[0] * 100}% ${scene.focus[1] * 100}%` }}>
        <Cover src={scene.src} focus={scene.focus} />
      </AbsoluteFill>
      {scene.halftone && (
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(circle, rgba(12,12,11,.6) 1.7px, transparent 2.4px)", backgroundSize: "10px 10px", WebkitMaskImage: "linear-gradient(0deg, #000 0%, #000 30%, transparent 70%)" }} />
      )}
      <AbsoluteFill style={{ background: gradient }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(12,12,11,.55) 0%, rgba(12,12,11,0) 22%)" }} />
      {scene.copy && (
        <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, ...(pos === "top" ? { top: SAFE.top + 110 } : pos === "center" ? { top: 0, bottom: 0, display: "flex", alignItems: "center" } : { bottom: 1920 - SAFE.bottom }) }}>
          <CopyBlock frame={frame} fpb={fpb} copy={scene.copy} kickerColor={C.soft} />
        </div>
      )}
      <SceneChrome p={p} theme="night" />
    </Night>
  );
};
