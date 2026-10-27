/* Screenshots of the landing hero in each of its states, against a running e2e server (qa/e2e/serve.ts), as a
 * signed-out visitor (free: 30 minutes late) at 390x844 and 1440x900, first screen and full page:
 *   a-live    a live green deal (the seed as is)
 *   b-last    no live deal: the last real deal from the receipts ("Last deal: …, closed … ago.")
 *   c-near    no deal in 7 days: the closest matched market ("Not a deal yet: 101¢ in."); the stat block hides
 *   d-paused  live data paused: the last known prices greyed out, "Last updated … ago.", notice in the header
 *   e-week    a live deal, but none found yet today: the stat block says "Deals this week" instead
 * Each state is made in the e2e database, checked (data-hero), shot, and the database is re-seeded after.
 *   E2E_APP_DIR=… npx tsx qa/e2e/serve.ts &   then   npx tsx qa/e2e/hero-states.ts [out-dir] */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { Pool } from "pg";
import { closeDb } from "@/lib/db";
import { APP_URL, E2E_DB } from "./env";
import { seed } from "./seed";

const out = process.argv[2] ?? "qa/screenshots/empty-states";
const STATES: Array<{ name: string; mode: string; sql: string[] }> = [
  { name: "a-live", mode: "live", sql: [] },
  { name: "b-last", mode: "last", sql: [
    // Every deal has stopped being found 40 minutes ago (after the free clock saw it open, so it's history for them).
    "update terminal.opportunities set active = false, last_seen_at = greatest(first_seen_at, now() - interval '40 minutes') where last_seen_at > now() - interval '1 day'",
  ] },
  { name: "c-near", mode: "near", sql: [
    "update terminal.opportunities set active = false, last_seen_at = greatest(first_seen_at, now() - interval '40 minutes') where last_seen_at > now() - interval '1 day'",
    "delete from terminal.receipts where detected_at > now() - interval '7 days'",
    "delete from terminal.live_events",
  ] },
  { name: "d-paused", mode: "live", sql: [
    "insert into terminal.worker_heartbeats (job, last_run_at, ok) values ('e2e:pause', now(), true) on conflict do nothing",
    "update terminal.worker_heartbeats set last_run_at = now() - interval '10 minutes' where job like 'scan:%'",
    "update terminal.opportunities set last_seen_at = now() - interval '10 minutes' where active",
  ] },
  { name: "e-week", mode: "live", sql: [
    "update terminal.receipts set detected_at = date_trunc('day', now() - interval '30 minutes') - interval '3 hours' where detected_at >= date_trunc('day', now() - interval '30 minutes')",
  ] },
];

async function main() {
  process.env.DATABASE_URL = E2E_DB;
  mkdirSync(out, { recursive: true });
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  try {
    for (const st of STATES) {
      await seed();
      for (const s of st.sql) await pool.query(s);
      for (const [w, h] of [[390, 844], [1440, 900]] as const) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1 });
        const p = await ctx.newPage();
        await p.goto(APP_URL + "/", { waitUntil: "load" });
        await p.waitForTimeout(2500);
        // A live toast (a real event) can slide over the headline for 5s; dismiss it so the shot shows the hero.
        for (const x of await p.locator(".toast__x").all()) await x.click().catch(() => undefined);
        const mode = await p.locator("[data-section=hero]").getAttribute("data-hero");
        if (mode !== st.mode) throw new Error(`${st.name}: hero shows "${mode}", expected "${st.mode}"`);
        if (await p.locator(".split__side").count() !== 2) throw new Error(`${st.name}: the split is missing`);
        await p.screenshot({ path: `${out}/${st.name}-${w}.png` });
        await p.screenshot({ path: `${out}/${st.name}-${w}-full.png`, fullPage: true });
        console.log(`${st.name} ${w}: ${(await p.locator(".hero__deal").innerText()).replace(/\s+/g, " ")} | header: ${await p.locator(".hbeat").innerText()} | stats: ${await p.locator(".strip__num").count()} ${(await p.locator(".strip__num dt").first().innerText().catch(() => "hidden"))}`);
        await ctx.close();
      }
    }
  } finally {
    await pool.query("delete from terminal.worker_heartbeats where job = 'e2e:pause'");
    await seed();
    await browser.close();
    await pool.end();
    await closeDb();
  }
}
void main().catch(e => { console.error(e); process.exit(1); });
