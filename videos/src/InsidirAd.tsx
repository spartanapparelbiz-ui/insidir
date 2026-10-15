import React, { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { layout } from "./engine/timeline.mjs";
import { Grain } from "./brand/Brand";
import "./brand/fonts";
import type { SceneProps, SceneSpec, Script } from "./scenes/common";
import { PhotoScene } from "./scenes/PhotoScene";
import { HeadlineScene } from "./scenes/HeadlineScene";
import { DocumentScene } from "./scenes/DocumentScene";
import { ScreenScene } from "./scenes/ScreenScene";
import { MosaicScene } from "./scenes/MosaicScene";
import { StatementScene } from "./scenes/StatementScene";
import { EndCard } from "./scenes/EndCard";
import { Halftone, Shutter, Tiles } from "./transitions/Transitions";

export type AdProps = { script: Script; audio?: string };

type Entry = ReturnType<typeof layout>["scenes"][number];

function renderScene(entry: Entry, frame: number, fpb: number, folio: string) {
  const p = { scene: entry.scene as SceneSpec, frame, duration: entry.duration, span: entry.duration + entry.tail, fpb, folio, firstScene: entry.index === 0 };
  switch (p.scene.type) {
    case "photo": return <PhotoScene {...(p as SceneProps<typeof p.scene>)} />;
    case "headline": return <HeadlineScene {...(p as SceneProps<typeof p.scene>)} />;
    case "document": return <DocumentScene {...(p as SceneProps<typeof p.scene>)} />;
    case "screen": return <ScreenScene {...(p as SceneProps<typeof p.scene>)} />;
    case "mosaic": return <MosaicScene {...(p as SceneProps<typeof p.scene>)} />;
    case "statement": return <StatementScene {...(p as SceneProps<typeof p.scene>)} />;
    case "endcard": return <EndCard {...(p as SceneProps<typeof p.scene>)} />;
  }
}

/** One ad from one script: the scene under the playhead, and while a transition runs, the outgoing scene
 *  (still moving) handed to the transition alongside the incoming one. Print grain sits on top; there is
 *  no global vignette, so night scenes run the brand's night paper to every edge (no dark border). */
export const InsidirAd: React.FC<AdProps> = ({ script, audio }) => {
  const frame = useCurrentFrame();
  const plan = useMemo(() => layout(script), [script]);
  const fpb = plan.framesPerBeat;
  const numbered = plan.scenes.filter(s => s.scene.type !== "endcard").length;
  const folio = (e: Entry) => `${String(Math.min(e.index + 1, numbered)).padStart(2, "0")} / ${String(numbered).padStart(2, "0")}`;
  let idx = plan.scenes.findIndex(s => frame >= s.start && frame < s.start + s.duration);
  if (idx < 0) idx = plan.scenes.length - 1;
  const cur = plan.scenes[idx];
  const local = frame - cur.start;
  let body: React.ReactNode;
  if (idx > 0 && local < cur.transitionFrames) {
    const prev = plan.scenes[idx - 1];
    const t = (local + 1) / (cur.transitionFrames + 1);
    const from = () => renderScene(prev, frame - prev.start, fpb, folio(prev));
    const to = () => renderScene(cur, local, fpb, folio(cur));
    const spec = cur.scene.transition;
    body = spec.type === "tiles" ? <Tiles spec={spec} t={t} from={from} to={to} />
      : spec.type === "shutter" ? <Shutter spec={spec} t={t} from={from} to={to} />
      : spec.type === "halftone" ? <Halftone spec={spec} t={t} from={from} to={to} />
      : to();
  } else {
    body = renderScene(cur, local, fpb, folio(cur));
  }
  return (
    <AbsoluteFill style={{ background: "#0c0c0b" }}>
      {body}
      <Grain frame={frame} />
      {audio && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
