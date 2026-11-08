/* Records the landing's "See it work" videos from the live site (https://insidir.com, or SITE_URL), as a visitor on a
 * phone: real pages, real data, nothing staged. Three short flows:
 *   board    the board, scrolling the live bets, then a tap into a market (its Kalshi price and money per side)
 *   markets  every market people bet on, a tap into a category and its markets ranked by millionaire money
 *   record   the record: every rule we tested, losses included
 * Each is recorded at 2x (780×1688, Chrome's screencast), trimmed to ~12s and encoded as WebM (VP9) + MP4 (H.264) + a poster frame into
 * public/media/site-<name>.*, each checked to be under 2.5MB. Needs ffmpeg and network access to the site.
 *   npx tsx qa/record-site.ts [board|markets|record ...] */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const SITE = process.env.SITE_URL ?? "https://insidir.com";
const OUT = "public/media", TMP = "qa/.site-rec", LEN = 12;
const W = 390, H = 844;

/** Scrolls by `px` over `ms`, like a thumb (eased, in small steps). */
async function glide(p: Page, px: number, ms: number) {
  const steps = Math.max(1, Math.round(ms / 16));
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, to = Math.round(px * e);
    await p.evaluate(dy => window.scrollBy(0, dy), to - done);
    done = to;
    await p.waitForTimeout(16);
  }
}

/** Each flow calls `start()` once the first view is ready: the clip begins there. */
const FLOWS: Record<string, (p: Page, start: () => void) => Promise<void>> = {
  async board(p, start) {
    await p.goto(`${SITE}/board`, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    start();
    await p.waitForTimeout(1000);
    await glide(p, 560, 1600);
    await p.waitForTimeout(900);
    await glide(p, 380, 1100);
    await p.waitForTimeout(700);
    const row = p.locator('a[href^="/market/"]:visible').first();
    await row.tap();
    await p.waitForURL(/\/market\//);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1800);
    await glide(p, 300, 1200);
    await p.waitForTimeout(1500);
  },
  async markets(p, start) {
    await p.goto(`${SITE}/markets`, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    start();
    await p.waitForTimeout(1200);
    await glide(p, 420, 1400);
    await p.waitForTimeout(900);
    await p.locator('a[href="/markets/football"]:visible').first().tap();
    await p.waitForURL(/\/markets\/[a-z]/);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1500);
    await glide(p, 640, 2400);
    await p.waitForTimeout(3000);
  },
  async record(p, start) {
    await p.goto(`${SITE}/results`, { waitUntil: "networkidle" });
    // Straight to how the millionaires' bets did (the section, not the page's top).
    await p.getByText(/actually did/).first().evaluate(el => el.scrollIntoView({ block: "start" }));
    await p.evaluate(() => window.scrollBy(0, -70));
    await p.waitForTimeout(900);
    start();
    await p.waitForTimeout(2200);
    await glide(p, 360, 1600);
    await p.waitForTimeout(1600);
    await glide(p, 560, 2000);
    await p.waitForTimeout(3000);
  },
};

async function record(name: string) {
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "no-preference" });
  // A returning visitor: no first-visit prompts over the page.
  await ctx.addInitScript(() => { try { localStorage.setItem("insidir_tips_done", "1"); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  // Chrome's own screencast at device pixels (Playwright's recordVideo draws a 2x page at 1x): every frame is a JPEG
  // with its time; ffmpeg then holds each frame until the next one.
  const cdp = await ctx.newCDPSession(page);
  const frames: Array<{ file: string; t: number }> = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  // The first frames are a blank page loading: the clip starts where the flow says.
  let lead = 0;
  await FLOWS[name]!(page, () => { lead = Date.now() / 1000; });
  await page.waitForTimeout(300);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();
  await browser.close();
  const kept = frames.filter((f, i) => f.t >= lead || (frames[i + 1]?.t ?? Infinity) > lead);
  const list = kept.map((f, i) => `file '${f.file.split("/").pop()}'\nduration ${Math.max(0.001, (kept[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(4)}`).join("\n");
  writeFileSync(join(dir, "frames.txt"), `ffconcat version 1.0\n${list}\nfile '${kept.at(-1)!.file.split("/").pop()}'\n`);
  const raw = join(dir, "frames.txt");
  const ss = "0", base = `${OUT}/site-${name}`;
  const vf = "fps=30,scale=780:-2:flags=lanczos";
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-i", raw, "-t", String(LEN), "-an", "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", `${base}.webm`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-i", raw, "-t", String(LEN), "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${base}.mp4`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-ss", "0.3", "-i", `${base}.mp4`, "-frames:v", "1", "-vf", "scale=780:-2", "-q:v", "4", `${base}-poster.jpg`], { stdio: "ignore" });
  for (const f of [`${base}.webm`, `${base}.mp4`, `${base}-poster.jpg`]) {
    const kb = Math.round(statSync(f).size / 1024);
    if (kb > 2560) throw new Error(`${f} is ${kb}KB, over 2.5MB`);
    console.log(`${f} ${kb}KB`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FLOWS);
  for (const n of names) {
    if (!FLOWS[n]) throw new Error(`unknown flow: ${n}`);
    await record(n);
  }
  rmSync(TMP, { recursive: true, force: true });
}

main().catch(e => { console.error(e); process.exit(1); });
