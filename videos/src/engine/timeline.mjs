// Beat grid -> frames. Every cut, transition and text cue is placed on the beat grid, so the edit and
// the generated score share one clock (at 120 bpm and 30 fps a beat is exactly 15 frames).

/** @typedef {import("zod").infer<typeof import("./schema.mjs").scriptSchema>} Script */
/** @typedef {{ index: number, scene: Script["scenes"][number], start: number, duration: number, transitionFrames: number, tail: number }} Entry */

/** @param {Script} script */
export const framesPerBeat = script => (script.fps * 60) / script.bpm;

/** Frame-exact layout: scene i occupies [start, start + duration); its transition in takes its first
 *  `transitionFrames`, during which scene i-1 keeps playing underneath (its `tail`). */
/** @param {Script} script @returns {{ scenes: Entry[], totalFrames: number, framesPerBeat: number }} */
export function layout(script) {
  const fpb = framesPerBeat(script);
  let start = 0;
  const scenes = script.scenes.map((scene, index) => {
    const duration = Math.round(scene.beats * fpb);
    const t = scene.transition.type === "cut" || index === 0 ? 0 : Math.round(scene.transition.beats * fpb);
    /** @type {Entry} */
    const entry = { index, scene, start, duration, transitionFrames: Math.min(t, duration), tail: 0 };
    start += duration;
    return entry;
  });
  scenes.forEach((entry, i) => { entry.tail = scenes[i + 1] ? scenes[i + 1].transitionFrames : 0; });
  return { scenes, totalFrames: start, framesPerBeat: fpb };
}

/** Throws when the beats do not add up to the script's length, so a 15-second spot is never 14.5. */
/** @param {Script} script */
export function assertLength(script) {
  const { totalFrames } = layout(script);
  const want = Math.round(script.seconds * script.fps);
  if (totalFrames !== want) {
    const beats = script.scenes.reduce((s, x) => s + x.beats, 0);
    throw new Error(`${script.id}: scenes add up to ${beats} beats = ${totalFrames} frames; ${script.seconds}s at ${script.fps} fps needs ${want} frames (${want / framesPerBeat(script)} beats)`);
  }
  return totalFrames;
}

/** Cue list for the score: where each cut and transition lands, in seconds. */
/** @param {Script} script */
export function cues(script) {
  const { scenes, framesPerBeat: fpb } = layout(script);
  return scenes.map(({ scene, start, duration, transitionFrames }) => ({
    type: scene.type,
    transition: scene.transition.type,
    start: start / script.fps,
    end: (start + duration) / script.fps,
    transitionEnd: (start + transitionFrames) / script.fps,
    beats: scene.beats,
    beatSeconds: fpb / script.fps
  }));
}
