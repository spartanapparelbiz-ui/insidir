/* The Price gaps matcher (lib/gaps/matcher.ts) as a one-shot job: Railway runs it on a cron schedule every 6 hours
 * (railway.match.json), it writes terminal.gap_targets and exits. Exits at once, doing nothing, unless GAPS_ENABLED=1.
 *   DATABASE_URL=... GAPS_ENABLED=1 npm run match */
import { appUrl } from "@/lib/app-url";
import { closeDb, getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient, PolymarketUsClient } from "@/lib/exchanges";
import { activityFloorFromEnv } from "@/lib/exchanges/venue";
import { gapsEnabled } from "@/lib/flags";
import { runMatcher } from "@/lib/gaps/matcher";
import { buildTwins } from "@/lib/twins/store";
import { createLayeredCache, createOpenRouterConfirm, llmEnv, matchConfigFromEnv } from "@/lib/matching";
import { dbMatchCache, dbUsageStore, loadOverrides } from "@/lib/worker/store";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function main(): Promise<void> {
  const db = getDb();
  if (!gapsEnabled()) {
    log("GAPS_ENABLED is not 1: Price gaps is off; twins from the stored markets only");
    const t = await buildTwins(db, Date.now());
    log(`twins: ${t.candidate} exact candidates, ${t.review} for review (all wait for /admin/twins)`);
    return;
  }
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
  // Market twins (lib/twins) from the markets this run just swept: strict, and nothing is used until approved.
  const t = await buildTwins(db, Date.now());
  log(`twins: ${t.candidate} exact candidates, ${t.review} for review (all wait for /admin/twins)`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
