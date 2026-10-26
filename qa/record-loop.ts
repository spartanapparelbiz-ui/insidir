/* Records the landing page's product loop from the live app (against a running e2e server, qa/e2e/serve.ts): the
 * real Terminal on a phone, signed in as Pro; a new deal arrives (written the way the worker writes one: an
 * opportunity row, a receipt and a deal_found event), slides in at the top, gets tapped, and the drawer opens.
 * Then ffmpeg trims it to ~12s and encodes WebM (VP9) + MP4 (H.264) + a poster frame into public/media/, each
 * checked to be under 1.5MB.
 *   npx tsx qa/record-loop.ts */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { chromium } from "playwright";
import { closeDb, getDb } from "@/lib/db";
import { opportunities, receipts } from "@/lib/db/schema";
import { dealFound, publish } from "@/lib/live/publish";
import type { Opportunity } from "@/lib/types";
import { APP_URL, E2E_DB } from "./e2e/env";
import { and, eq, sql } from "drizzle-orm";

const OUT = "public/media";
const TMP = "qa/.loop";

async function main() {
  process.env.DATABASE_URL = E2E_DB;
  mkdirSync(OUT, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  const db = getDb();
  // A copy of a seeded live deal under a new id and title, as the worker would find it.
  // (The Jets deal: Kalshi + Polymarket US, so the US Pro member sees it.)
  const base = (await db.select().from(opportunities).where(and(eq(opportunities.active, true), sql`${opportunities.data}->>'title' like '%Jets%'`)).limit(1))[0]!;
  const o: Opportunity = { ...base.data, id: `${base.data.id}-loop`, title: "Will the Lakers win on Nov 12?" };
  await db.delete(opportunities).where(eq(opportunities.id, o.id));
  await db.delete(receipts).where(eq(receipts.oppId, o.id));

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    recordVideo: { dir: TMP, size: { width: 390, height: 844 } } });
  await ctx.addCookies([{ name: "insidir_session", value: "e2e-pro-session-token-0000000000000000", url: APP_URL }]);
  await ctx.addInitScript(() => { try { localStorage.setItem("insidir_tips_done", "1"); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(APP_URL + "/terminal", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const lead = (Date.now() - t0) / 1000 - 1.2;
  // The new deal arrives.
  const now = new Date();
  await db.insert(opportunities).values({ id: o.id, kind: o.kind, data: o, venues: [...new Set(o.legs.map(l => l.venue))], safety: o.safety, roi: o.roi,
    profitPerDay: o.profitPerDay + 10, firstSeenAt: now, lastSeenAt: now, active: true });
  await db.insert(receipts).values({ oppId: o.id, kind: o.kind, safety: o.safety, detectedAt: now, snapshot: o });
  await publish(db, [dealFound(o, now)]);
  const row = page.locator(`tr[data-deal="${o.id}"]`);
  await row.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(2200);
  await row.tap();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(2500);
  await page.getByRole("dialog").evaluate(d => d.querySelector(".dsheet__panel")?.scrollBy({ top: 360, behavior: "smooth" }));
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  await ctx.close();
  await browser.close();
  // Clean up the demo deal.
  await db.delete(opportunities).where(eq(opportunities.id, o.id));
  await db.delete(receipts).where(eq(receipts.oppId, o.id));
  await closeDb();

  const raw = `${TMP}/${readdirSync(TMP).find(f => f.endsWith(".webm"))}`;
  const ss = Math.max(0, lead).toFixed(2);
  const vf = "fps=24,scale=390:-2";
  execFileSync("ffmpeg", ["-y", "-ss", ss, "-i", raw, "-t", "12.5", "-an", "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", `${OUT}/terminal-loop.webm`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-ss", ss, "-i", raw, "-t", "12.5", "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/terminal-loop.mp4`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-ss", (Number(ss) + 5).toFixed(2), "-i", raw, "-frames:v", "1", "-vf", "scale=390:-2", "-q:v", "6", `${OUT}/terminal-loop-poster.jpg`], { stdio: "ignore" });
  rmSync(TMP, { recursive: true, force: true });
  for (const f of ["terminal-loop.webm", "terminal-loop.mp4", "terminal-loop-poster.jpg"]) {
    const kb = statSync(`${OUT}/${f}`).size / 1024;
    console.log(`${f}: ${kb.toFixed(0)} KB`);
    if (kb > 1536) throw new Error(`${f} is over 1.5MB`);
  }
}
void main().catch(e => { console.error(e); process.exit(1); });
