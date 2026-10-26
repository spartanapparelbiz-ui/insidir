/* The Price gaps matcher (lib/gaps/matcher.ts) as a one-shot job: Railway runs it on a cron schedule every 6 hours
 * (railway.match.json), it writes terminal.gap_targets and exits. Exits at once, doing nothing, unless GAPS_ENABLED=1.
 *   DATABASE_URL=... GAPS_ENABLED=1 npm run match */
import { appUrl } from "@/lib/auth/whop";
import { closeDb, getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient, PolymarketUsClient } from "@/lib/exchanges";
import { activityFloorFromEnv } from "@/lib/exchanges/venue";
import { gapsEnabled } from "@/lib/flags";
import { runMatcher } from "@/lib/gaps/matcher";
import { createLayeredCache, createOpenRouterConfirm, llmEnv, matchConfigFromEnv } from "@/lib/matching";
import { dbMatchCache, dbUsageStore, loadOverrides } from "@/lib/worker/store";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function main(): Promise<void> {
  if (!gapsEnabled()) { log("GAPS_ENABLED is not 1: Price gaps is off, nothing to match"); return; }
  const db = getDb();
  const env = llmEnv(process.env);
  const us = process.env.POLYMARKET_US_ENABLED === "0" ? null : new PolymarketUsClient();
  const stats = await runMatcher({
    db, clients: { kalshi: new KalshiClient(), polymarket: new PolymarketClient(), polymarketUs: us },
    floor: activityFloorFromEnv(process.env), config: matchConfigFromEnv(process.env),
    cache: createLayeredCache(dbMatchCache(db)), overrides: await loadOverrides(db), now: Date.now(),
    llm: env.apiKey ? createOpenRouterConfirm({ apiKey: env.apiKey, model: env.model, monthlyCapUsd: env.monthlyCapUsd, usage: dbUsageStore(db), now: () => Date.now(), appUrl: appUrl() }) : undefined,
    log: m => log(m),
  });
  log(`match run ${stats.runId}: ${(stats.ms / 1000).toFixed(1)}s, peak ${stats.peakRssMb} MB, ${stats.rescored} re-scored, ${stats.candidates} candidates, ` +
    `${stats.llmAsked} LLM questions ($${stats.llmCostUsd.toFixed(4)}), ${stats.pairs} pairs + ${stats.multi} multi-outcome sets = ${stats.targets} targets`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
