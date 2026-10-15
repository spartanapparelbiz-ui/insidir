import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import manifest from "../../public/screens/manifest.json";
import { CopyBlock } from "../brand/Brand";
import { C, SAFE } from "../brand/tokens";
import { cue, lerp, sineInOut } from "../engine/motion";
import { Night, SceneChrome, type Of, type SceneProps } from "./common";

type Shot = { width: number; height: number };
const shots = manifest as Record<string, Shot>;

export const shotSize = (src: string): Shot => {
  const id = src.replace(/^screens\//, "").replace(/\.png$/, "");
  const shot = shots[id];
  if (!shot) throw new Error(`No screenshot "${id}" in public/screens/manifest.json; run npm run screens`);
  return shot;
};

/** A real page of the Insidir site. phone: the page scrolls under a 1080px-wide phone viewport.
 *  card: the camera travels across a desktop section, from one region to another. */
export const ScreenScene: React.FC<SceneProps<Of<"screen">>> = p => {
  const { scene, frame, span, fpb } = p;
  const { width: W, height: H } = shotSize(scene.src);
  const e = sineInOut(Math.min(1, frame / span));
  let transform: string, s: number;
  if (scene.mode === "phone") {
    s = 1080 / W;
    const travel = Math.max(0, H * s - 1920);
    transform = `translate(0px, ${-lerp(scene.from[0], scene.to[0], e) * travel}px) scale(${s})`;
  } else {
    const [fx, fy, fw = 1] = scene.from, [tx, ty, tw = 1] = scene.to;
    s = 1080 / (Math.exp(lerp(Math.log(fw), Math.log(tw), e)) * W);
    const cx = lerp(fx, tx, e) * W, cy = lerp(fy, ty, e) * H;
    const anchorY = !scene.copy ? 960 : scene.copy.position === "top" ? 1130 : 760;
    transform = `translate(${540 - cx * s}px, ${anchorY - cy * s}px) scale(${s})`;
  }
  const hl = scene.highlight;
  const hlIn = hl ? cue(frame, hl.at * fpb, 10) : 0;
  const pos = scene.copy?.position ?? "bottom";
  return (
    <Night>
      <AbsoluteFill style={{ perspective: 2400 }}>
        <AbsoluteFill style={{ transform: `rotateX(${scene.tilt}deg)`, transformOrigin: "50% 50%" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform }}>
            <Img src={staticFile(scene.src)} style={{ width: W, height: H, display: "block" }} />
            {hl && (
              <div style={{
                position: "absolute", left: hl.rect[0] * W, top: hl.rect[1] * H, width: hl.rect[2] * W, height: hl.rect[3] * H,
                outline: `${4 / s}px solid ${C.ink}`, outlineOffset: 6 / s, clipPath: `inset(-${20 / s}px ${(1 - hlIn) * 100}% -${20 / s}px -${20 / s}px)`
              }} />
            )}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      {scene.copy && (
        <>
          <AbsoluteFill style={{ background: pos === "top" ? "linear-gradient(180deg, rgba(12,12,11,.96) 0%, rgba(12,12,11,.9) 34%, rgba(12,12,11,0) 52%)" : "linear-gradient(0deg, rgba(12,12,11,.97) 0%, rgba(12,12,11,.92) 30%, rgba(12,12,11,0) 50%)" }} />
          <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, ...(pos === "top" ? { top: SAFE.top + 110 } : { bottom: 1920 - SAFE.bottom }) }}>
            <CopyBlock frame={frame} fpb={fpb} copy={scene.copy} kickerColor={C.soft} />
          </div>
        </>
      )}
      {/* A phone page carries the site's own header, so the video's masthead stays off it. */}
      {!scene.copy && scene.mode === "card" && <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(12,12,11,.85) 0%, rgba(12,12,11,0) 20%)" }} />}
      {scene.mode === "card" && <SceneChrome p={p} theme="night" />}
    </Night>
  );
};
