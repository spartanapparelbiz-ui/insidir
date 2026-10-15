// Renders a film's frames from render/index.html?film=N in headless Chromium and pipes them to FFmpeg.
// Usage: node scripts/render-film.mjs <film> <out.mp4> [from] [to] [step]   (from/to/step in frames, for previews)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
const [film, out, fromArg, toArg, stepArg] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--disable-gpu-vsync"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("console", m => { if (m.type() === "error") console.error("page:", m.text()); });
page.on("pageerror", e => console.error("pageerror:", e.message));
await page.goto(`http://127.0.0.1:5300/films/render/index.html?film=${film}`);
const total = await page.evaluate(() => window.ready);
const from = Number(fromArg || 0), to = Math.min(Number(toArg || total), total), step = Number(stepArg || 1);
const preview = out.endsWith(".png") || out.endsWith("%03d.jpg");
let ff;
if (!preview) {
  // Grade: strict monochrome, then fine animated 35mm-style grain.
  ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-",
    "-vf", "format=gray,noise=c0s=9:c0f=t+u,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-r", "30", out], { stdio: ["pipe", "inherit", "inherit"] });
}
const canvas = await page.$("#c");
const t0 = Date.now();
for (let f = from; f < to; f += step) {
  await page.evaluate(f => window.renderFrame(f), f);
  if (preview) { await canvas.screenshot({ path: out.replace("%03d", String(f).padStart(3, "0")), type: out.endsWith(".png") ? "png" : "jpeg", quality: out.endsWith(".png") ? undefined : 90 }); continue; }
  const buf = await canvas.screenshot({ type: "jpeg", quality: 96 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if (f % 60 === 0) console.log(`film ${film}: frame ${f}/${to} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
if (ff) { ff.stdin.end(); await new Promise(r => ff.on("close", r)); }
await browser.close();
console.log("done", out, total, "frames");
