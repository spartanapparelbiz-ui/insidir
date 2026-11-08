/* Records the landing's demo videos ("See it work", components/brand/landing/Why.tsx) from the live site
 * (https://insidir.com, or SITE_URL) as a visitor: real pages, real data, nothing staged. Three complete flows:
 *   board    the board's live bets, a tap into one market: its Kalshi price, money per side, the chart, every bet
 *   markets  every market people bet on, a tap into a category, a tap into its top market
 *   record   how the millionaires' bets settled, by category, losses included, and every rule we tested
 * Each flow is recorded twice: desktop (1280×800 at 1.5x, shown on wide screens) and phone (390×844 at 2x), with
 * Chrome's screencast (Playwright's recordVideo draws a 2x page at 1x in one corner), then encoded as WebM (VP9) +
 * MP4 (H.264) + a poster into public/media/site-<flow>-<desk|phone>.*, each under 4MB. Needs ffmpeg and network.
 *   npx tsx qa/record-site.ts [board|markets|record ...] */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const SITE = process.env.SITE_URL ?? "https://insidir.com";
const OUT = "public/media", TMP = "qa/.site-rec", LEN = 22;

type Device = "desk" | "phone";
const DEVICES: Record<Device, { w: number; h: number; dpr: number; mobile: boolean; outW: number; crf: [number, number] }> = {
  desk: { w: 1280, h: 800, dpr: 1.5, mobile: false, outW: 1920, crf: [38, 28] },
  phone: { w: 390, h: 844, dpr: 2, mobile: true, outW: 780, crf: [36, 26] },
};

/** Scrolls by `px` over `ms` like a hand on a trackpad or a thumb (eased, in small steps). */
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

/** A click on a phone is a tap; on desktop the pointer travels to it first. */
async function press(p: Page, sel: string, d: Device) {
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  if (d === "phone") return el.tap();
  const b = (await el.boundingBox())!;
  await p.mouse.move(b.x + Math.min(120, b.width / 2), b.y + b.height / 2, { steps: 24 });
  await p.waitForTimeout(250);
  await el.click();
}

/** Each flow calls `start()` once the first view is ready: the clip begins there. `k` scales scroll distances. */
const FLOWS: Record<string, (p: Page, start: () => void, d: Device, k: number) => Promise<void>> = {
  async board(p, start, d, k) {
    await p.goto(`${SITE}/board`, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    start();
    await p.waitForTimeout(1800);
    await glide(p, 520 * k, 1700);
    await p.waitForTimeout(1200);
    await glide(p, 360 * k, 1300);
    await p.waitForTimeout(800);
    await press(p, 'a[href^="/market/"]:visible', d);
    await p.waitForURL(/\/market\//);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(2200);
    await glide(p, 420 * k, 1600);
    await p.waitForTimeout(1600);
    await glide(p, 560 * k, 1900);
    await p.waitForTimeout(1600);
    await glide(p, 560 * k, 1900);
    await p.waitForTimeout(2000);
  },
  async markets(p, start, d, k) {
    await p.goto(`${SITE}/markets`, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    start();
    await p.waitForTimeout(1600);
    await glide(p, 380 * k, 1400);
    await p.waitForTimeout(900);
    await press(p, 'a[href="/markets/football"]:visible', d);
    await p.waitForURL(/\/markets\/football/);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1800);
    await glide(p, 420 * k, 1600);
    await p.waitForTimeout(1200);
    await press(p, 'main a[href^="/market/"]:visible', d);
    await p.waitForURL(/\/market\//);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(2200);
    await glide(p, 420 * k, 1600);
    await p.waitForTimeout(2200);
  },
  async record(p, start, _d, k) {
    await p.goto(`${SITE}/results`, { waitUntil: "networkidle" });
    // Straight to how the millionaires' bets did (the section, not the page's top).
    await p.getByText(/actually did/).first().evaluate(el => el.scrollIntoView({ block: "start" }));
    await p.evaluate(() => window.scrollBy(0, -70));
    await p.waitForTimeout(900);
    start();
    await p.waitForTimeout(2600);
    await glide(p, 360 * k, 1600);
    await p.waitForTimeout(1800);
    await glide(p, 520 * k, 1900);
    await p.waitForTimeout(2200);
    await glide(p, 560 * k, 1900);
    await p.waitForTimeout(2600);
  },
};

async function record(name: string, d: Device) {
  const dev = DEVICES[d], dir = join(TMP, `${name}-${d}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile, reducedMotion: "no-preference" });
  // A returning visitor: no first-visit prompts over the page.
  await ctx.addInitScript(() => { try { localStorage.setItem("insidir_tips_done", "1"); } catch { /* ignore */ } });
  await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: SITE }]);
  const page = await ctx.newPage();
  // Chrome's screencast at device pixels: every frame is a JPEG with its time; ffmpeg holds each until the next.
  const cdp = await ctx.newCDPSession(page);
  const frames: Array<{ file: string; t: number }> = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const pw = Math.round(dev.w * dev.dpr), ph = Math.round(dev.h * dev.dpr);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: pw, maxHeight: ph, everyNthFrame: 1 });
  let lead = 0;
  await FLOWS[name]!(page, () => { lead = Date.now() / 1000; }, d, d === "desk" ? 1.1 : 1);
  await page.waitForTimeout(300);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();
  await browser.close();
  const kept = frames.filter((f, i) => f.t >= lead || (frames[i + 1]?.t ?? Infinity) > lead);
  const name1 = (f: { file: string }) => f.file.split("/").pop();
  const list = kept.map((f, i) => `file '${name1(f)}'\nduration ${Math.max(0.001, (kept[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(4)}`).join("\n");
  writeFileSync(join(dir, "frames.txt"), `ffconcat version 1.0\n${list}\nfile '${name1(kept.at(-1)!)}'\n`);
  const raw = join(dir, "frames.txt"), base = `${OUT}/site-${name}-${d}`;
  const vf = `fps=30,scale=${dev.outW}:-2:flags=lanczos`;
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-i", raw, "-t", String(LEN), "-an", "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(dev.crf[0]), "-row-mt", "1", `${base}.webm`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-i", raw, "-t", String(LEN), "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", String(dev.crf[1]), "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${base}.mp4`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-ss", "0.3", "-i", `${base}.mp4`, "-frames:v", "1", "-q:v", "4", `${base}-poster.jpg`], { stdio: "ignore" });
  for (const f of [`${base}.webm`, `${base}.mp4`, `${base}-poster.jpg`]) {
    const kb = Math.round(statSync(f).size / 1024);
    if (kb > 4096) throw new Error(`${f} is ${kb}KB, over 4MB`);
    console.log(`${f} ${kb}KB`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FLOWS);
  for (const n of names) {
    if (!FLOWS[n]) throw new Error(`unknown flow: ${n}`);
    for (const d of ["desk", "phone"] as const) await record(n, d);
  }
  rmSync(TMP, { recursive: true, force: true });
}

main().catch(e => { console.error(e); process.exit(1); });
