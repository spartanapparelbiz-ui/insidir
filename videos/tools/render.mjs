// Script + assets -> finished MP4.
//   node tools/render.mjs ads/sec-filings.json          one ad
//   node tools/render.mjs --all                          every script in ads/
//   node tools/render.mjs ads/x.json --stills 0,45,90    QA frames as PNGs in output/qa/
//   node tools/render.mjs --all --audio-only             regenerate the scores and remux (picture copied)
// Pipeline: validate the script (beats must add up to its length) -> synthesize its score on the same
// beat grid -> Remotion renders a ProRes 422 HQ master -> FFmpeg encodes H.264 High / yuv420p / BT.709
// at 30 fps with AAC audio and faststart -> FFprobe verification (tools/verify.mjs).
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { parseScript } from "../src/engine/schema.mjs";
import { assertLength } from "../src/engine/timeline.mjs";
import { headlessShellExecutable, ffmpegPath } from "./lib/env.mjs";
import { writeScore } from "./score.mjs";
import { verify } from "./verify.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(root, "output");
const workDir = join(root, ".work");

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

async function scriptsFromArgs() {
  if (process.argv.includes("--all")) {
    return (await readdir(join(root, "ads"))).filter(f => f.endsWith(".json")).sort().map(f => join(root, "ads", f));
  }
  const files = process.argv.slice(2).filter((a, i, all) => a.endsWith(".json") && all[i - 1] !== "--stills");
  if (!files.length) throw new Error("usage: node tools/render.mjs ads/<script>.json [--stills 0,30] | --all");
  return files.map(f => resolve(f));
}

let serveUrl;
async function getBundle() {
  serveUrl ??= await bundle({ entryPoint: join(root, "src/index.ts"), publicDir: join(root, "public"), onProgress: () => {} });
  return serveUrl;
}

const chromiumOptions = { gl: "swangle" };

export async function renderAd(file, { stills, audioOnly } = {}) {
  const script = parseScript(JSON.parse(await readFile(file, "utf8")));
  const frames = assertLength(script);
  const inputProps = { script };
  const url = await getBundle();
  const browserExecutable = headlessShellExecutable();
  const composition = await selectComposition({ serveUrl: url, id: "InsidirAd", inputProps, browserExecutable, chromiumOptions });
  await mkdir(outDir, { recursive: true });

  if (stills) {
    await mkdir(join(outDir, "qa"), { recursive: true });
    for (const frame of stills) {
      const output = join(outDir, "qa", `${script.id}-${String(frame).padStart(3, "0")}.png`);
      await renderStill({ composition, serveUrl: url, output, frame, inputProps, browserExecutable, chromiumOptions });
      console.log("still", output);
    }
    return null;
  }

  await mkdir(workDir, { recursive: true });
  const t0 = Date.now();
  const mp4 = join(outDir, `insidir-${script.id}.mp4`);

  if (audioOnly) {
    // New score, same picture: the video stream is copied bit for bit.
    const wav = join(workDir, `${script.id}.wav`), tmp = join(workDir, `${script.id}.remux.mp4`);
    await writeScore(script, wav);
    execFileSync(ffmpegPath(), ["-y", "-v", "error", "-i", mp4, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", String(frames / script.fps), "-movflags", "+faststart",
      "-metadata", `title=${script.title}`, "-metadata", "artist=Insidir", "-metadata", "copyright=Aethric LLC", tmp], { stdio: "inherit" });
    await rename(tmp, mp4);
    return { mp4, report: await verify(mp4, { frames, fps: script.fps, width: script.width, height: script.height }) };
  }
  const wav = join(workDir, `${script.id}.wav`);
  await writeScore(script, wav);
  console.log(`${script.id}: score written (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const master = join(workDir, `${script.id}.mov`);
  let last = -1;
  await renderMedia({
    composition, serveUrl: url, codec: "prores", proResProfile: "hq", outputLocation: master, inputProps,
    browserExecutable, chromiumOptions, concurrency: Math.max(1, Math.min(os.cpus().length, 4)), muted: true,
    onProgress: ({ progress }) => { const pct = Math.floor(progress * 10) * 10; if (pct !== last) { last = pct; process.stdout.write(`${script.id}: ${pct}% `); } }
  });
  console.log(`\n${script.id}: master rendered (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  execFileSync(ffmpegPath(), [
    "-y", "-v", "error",
    "-i", master, "-i", wav,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-tune", "film",
    "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
    "-maxrate", "24M", "-bufsize", "48M", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(script.fps), "-frames:v", String(frames),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", String(frames / script.fps),
    "-movflags", "+faststart",
    "-metadata", `title=${script.title}`, "-metadata", "artist=Insidir", "-metadata", "copyright=Aethric LLC",
    mp4
  ], { stdio: "inherit" });
  console.log(`${script.id}: encoded ${mp4} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (!process.argv.includes("--keep-master")) await rm(master, { force: true });
  const report = await verify(mp4, { frames, fps: script.fps, width: script.width, height: script.height });
  return { mp4, report };
}

async function main() {
  const stillsArg = arg("--stills");
  const stills = stillsArg ? stillsArg.split(",").map(Number) : null;
  let failed = false;
  for (const file of await scriptsFromArgs()) {
    const result = await renderAd(file, { stills, audioOnly: process.argv.includes("--audio-only") });
    if (result && !result.report.ok) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
