// Verifies a finished ad with FFprobe/FFmpeg:
//   container MP4, H.264 High, 1080x1920, square pixels, 30 fps constant, yuv420p, BT.709 tags,
//   exactly the expected frame count and duration, AAC stereo 48 kHz audio of the same length,
//   faststart (moov before mdat), a clean full decode (no errors), and no letterboxing: every frame's
//   detected active picture is the full 1080x1920 and the outer rows/columns are never black bars.
// Usage: node tools/verify.mjs output/insidir-*.mp4   (writes output/<name>.verify.json beside each)
import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ffmpegPath, ffprobePath } from "./lib/env.mjs";

const probe = file => JSON.parse(execFileSync(ffprobePath(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-count_frames", file], { encoding: "utf8" }));

function moovFirst(file) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(16);
    let pos = 0;
    for (let i = 0; i < 16; i++) {
      if (readSync(fd, buf, 0, 16, pos) < 8) return false;
      let size = buf.readUInt32BE(0);
      const type = buf.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (size === 1) size = Number(buf.readBigUInt64BE(8));
      if (size < 8) return false;
      pos += size;
    }
    return false;
  } finally { closeSync(fd); }
}

/** Per-frame luma of the outermost 4px bands; a letterbox/pillarbox shows up as bands that stay black. */
function edgeBands(file) {
  // Convert to full-range gray first, then average to 8 samples (a 1x1 scale of 4:2:0 video is unreliable).
  const run = (crop, size) => {
    const out = execFileSync(ffmpegPath(), ["-v", "error", "-i", file, "-vf", `${crop},scale=in_range=tv:out_range=pc,format=gray,scale=${size}:flags=area`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
    const values = [];
    for (let i = 0; i + 8 <= out.length; i += 8) values.push(out.subarray(i, i + 8).reduce((a, b) => a + b, 0) / 8);
    return values;
  };
  return {
    top: run("crop=iw:4:0:0", "8:1"), bottom: run("crop=iw:4:0:ih-4", "8:1"), left: run("crop=4:ih:0:0", "1:8"), right: run("crop=4:ih:iw-4:0", "1:8")
  };
}

export async function verify(file, want = { frames: 450, fps: 30, width: 1080, height: 1920 }) {
  const info = probe(file);
  const v = info.streams.find(s => s.codec_type === "video");
  const a = info.streams.find(s => s.codec_type === "audio");
  const [num, den] = v.r_frame_rate.split("/").map(Number);
  const [anum, aden] = v.avg_frame_rate.split("/").map(Number);
  const decodeErrors = execFileSync(ffmpegPath(), ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const crops = execFileSync(ffmpegPath(), ["-v", "info", "-i", file, "-vf", "cropdetect=limit=0.06:round=2:reset=1", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const bands = edgeBands(file);
  // Full-range luma of a black bar is 0-2; Insidir's night paper (#0c0c0b) measures about 12, so it is content.
  const BLACK = 6;
  const darkRun = arr => { let best = 0, run = 0; for (const y of arr) { run = y < BLACK ? run + 1 : 0; best = Math.max(best, run); } return best; };
  // A bar is an edge band that is near-black for the whole video; a few dark frames on a night scene are fine.
  const barFrames = Object.fromEntries(Object.entries(bands).map(([k, arr]) => [k, arr.filter(y => y < BLACK).length]));
  const duration = Number(info.format.duration);
  const checks = {
    container: /mp4/.test(info.format.format_name),
    codec: v.codec_name === "h264",
    profile: v.profile === "High",
    resolution: v.width === want.width && v.height === want.height,
    squarePixels: !v.sample_aspect_ratio || v.sample_aspect_ratio === "1:1" || v.sample_aspect_ratio === "0:1",
    aspect9x16: Math.abs(v.width / v.height - 9 / 16) < 1e-9,
    fps: num / den === want.fps && anum / aden === want.fps,
    pixelFormat: v.pix_fmt === "yuv420p",
    bt709: v.color_space === "bt709" && v.color_primaries === "bt709" && v.color_transfer === "bt709",
    frameCount: Number(v.nb_read_frames) === want.frames,
    duration: Math.abs(duration - want.frames / want.fps) <= 0.05,
    audio: !!a && a.codec_name === "aac" && a.channels === 2 && Number(a.sample_rate) === 48000 && Math.abs(Number(a.duration) - want.frames / want.fps) <= 0.05,
    faststart: moovFirst(file),
    cleanDecode: decodeErrors === "",
    noBars: Object.values(bands).every(arr => darkRun(arr) < want.fps) && Object.values(barFrames).every(n => n < want.frames * 0.1)
  };
  const report = {
    file, ok: Object.values(checks).every(Boolean), checks,
    measured: {
      format: info.format.format_name, duration, bitRate: Number(info.format.bit_rate), size: Number(info.format.size),
      video: { codec: v.codec_name, profile: v.profile, level: v.level, width: v.width, height: v.height, sar: v.sample_aspect_ratio, dar: v.display_aspect_ratio, r_frame_rate: v.r_frame_rate, avg_frame_rate: v.avg_frame_rate, pix_fmt: v.pix_fmt, color: [v.color_space, v.color_primaries, v.color_transfer, v.color_range], frames: Number(v.nb_read_frames), duration: Number(v.duration) },
      audio: a ? { codec: a.codec_name, channels: a.channels, sample_rate: Number(a.sample_rate), duration: Number(a.duration), bit_rate: Number(a.bit_rate) } : null,
      cropdetectLast: (crops.match(/crop=\d+:\d+:\d+:\d+/g) || []).slice(-1)[0] ?? null,
      edgeBandsNearBlackFrames: barFrames
    }
  };
  await writeFile(file.replace(/\.mp4$/, ".verify.json"), JSON.stringify(report, null, 2) + "\n");
  const flag = ok => (ok ? "ok  " : "FAIL");
  console.log(`\n${file}`);
  for (const [k, ok] of Object.entries(checks)) console.log(`  ${flag(ok)} ${k}`);
  console.log(`  ${v.width}x${v.height} ${v.codec_name} ${v.profile}@L${v.level / 10} ${v.pix_fmt} ${v.r_frame_rate} fps, ${v.nb_read_frames} frames, ${duration.toFixed(3)} s, ${(Number(info.format.bit_rate) / 1e6).toFixed(1)} Mb/s, ${(Number(info.format.size) / 1048576).toFixed(1)} MB; audio ${a ? `${a.codec_name} ${a.channels}ch ${a.sample_rate} Hz ${Number(a.duration).toFixed(3)} s` : "none"}`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true;
  for (const f of process.argv.slice(2)) ok = (await verify(f)).ok && ok;
  if (!ok) process.exitCode = 1;
}
