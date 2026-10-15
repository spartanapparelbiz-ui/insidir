// Where to find the browser and FFmpeg binaries. Every value can be overridden from the
// environment so the pipeline runs the same on a laptop, in CI or in this container.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const firstExisting = paths => paths.find(p => p && existsSync(p));

/** Full Chromium for page screenshots (Playwright). */
export function chromiumExecutable() {
  return firstExisting([
    process.env.INSIDIR_CHROMIUM,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome"
  ]);
}

/** Chrome headless shell for Remotion frame rendering; undefined lets Remotion download its own. */
export function headlessShellExecutable() {
  return firstExisting([
    process.env.REMOTION_BROWSER_EXECUTABLE,
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"
  ]);
}

function which(name) {
  try { return execFileSync("which", [name], { encoding: "utf8" }).trim() || null; } catch { return null; }
}

/** System FFmpeg / FFprobe (used for audio mastering, final encode and verification). */
export const ffmpegPath = () => process.env.FFMPEG || which("ffmpeg") || "ffmpeg";
export const ffprobePath = () => process.env.FFPROBE || which("ffprobe") || "ffprobe";
