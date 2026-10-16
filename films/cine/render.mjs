// Renders a cine film (3D) frame by frame in headless Chromium (WebGL via SwiftShader) → FFmpeg.
// Usage: node render.mjs <film> <out.mp4|dir/%04d.jpg> [from] [to] [step] [scale] [sub]
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
const [film, out, fromArg, toArg, stepArg, scale = "1", sub = "3"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("console", m => { if (["error", "warning"].includes(m.type())) console.error("page:", m.text().slice(0, 300)); });
page.on("pageerror", e => console.error("pageerror:", e.message));
page.on("crash", () => { console.error("PAGE CRASHED"); process.exit(3); });
browser.on("disconnected", () => { console.error("BROWSER GONE"); process.exit(4); });
await page.goto(`http://127.0.0.1:5300/films/cine/index.html?film=${film}&scale=${scale}&sub=${sub}${process.env.QS ? "&" + process.env.QS : ""}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
const total = await page.evaluate(() => window.FRAMES);
const from = Number(fromArg || 0), to = Math.min(Number(toArg || total), total), step = Number(stepArg || 1);
const still = out.includes("%");
let ff;
if (!still) ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-", "-vf", "scale=1920:1080:flags=lanczos,format=gray,noise=c0s=8:c0f=t+u,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-r", "30", out], { stdio: ["pipe", "inherit", "inherit"] });
const t0 = Date.now();
for (let f = from; f < to; f += step) {
  await Promise.race([page.evaluate(f => window.renderFrame(f), f), new Promise((_, rej) => setTimeout(() => rej(new Error('frame timeout ' + f)), 120000))]);
  const buf = await page.screenshot({ type: "jpeg", quality: 95 });
  if (still) { const fs = await import("node:fs"); fs.writeFileSync(out.replace(/%0?(\d)d/, (m, n) => String(f).padStart(Number(n), "0")), buf); }
  else if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if ((f - from) % (step * 10) === 0) console.log(`${film}: ${f}/${to} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
if (ff) { ff.stdin.end(); await new Promise(r => ff.on("close", r)); }
console.log(`done ${film} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close();
