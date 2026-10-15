import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { InsidirAd, type AdProps } from "./InsidirAd";
import { parseScript } from "./engine/schema.mjs";
import { layout } from "./engine/timeline.mjs";

// Every script in ads/ shows up in Remotion Studio as its own composition; the render CLI uses the
// generic "InsidirAd" composition and passes the script as input props.
declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys(): string[]; (key: string): unknown } };
const adContext = require.context("../ads", false, /\.json$/);
const ads = adContext.keys().filter(k => k.startsWith("./")).map(k => parseScript(adContext(k)));

const calculateMetadata: CalculateMetadataFunction<AdProps> = ({ props }) => {
  const script = parseScript(props.script);
  return { durationInFrames: layout(script).totalFrames, fps: script.fps, width: script.width, height: script.height, props: { ...props, script } };
};

export const Root: React.FC = () => (
  <>
    <Composition id="InsidirAd" component={InsidirAd} width={1080} height={1920} fps={30} durationInFrames={450} defaultProps={{ script: ads[0] } as AdProps} calculateMetadata={calculateMetadata} />
    {ads.map(script => (
      <Composition key={script.id} id={script.id} component={InsidirAd} width={1080} height={1920} fps={30} durationInFrames={450}
        defaultProps={{ script, audio: `audio/${script.id}.wav` } as AdProps} calculateMetadata={calculateMetadata} />
    ))}
  </>
);
