/* The worker's Autopilot jobs: the engine against Kalshi's live book and members' devices, and the backtests. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotBacktests, autopilotRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { KalshiClient } from "@/lib/exchanges";
import { sendPush } from "@/lib/alerts/send";
import { appUrl } from "@/lib/app-url";
import { claimAlert, dropPush, pushTargets } from "@/lib/worker/store";
import { backtest, backtestRows, specKey, type Backtest } from "./backtest";
import { runAutopilot, type Quote } from "./engine";
import { cleanSpec } from "./rules";
import { STARTERS } from "./starters";
import { REPORT_KEY, rulesReport } from "./report";

export async function autopilotOnce(db: Db, kalshi: KalshiClient, now: number, log: (s: string) => void): Promise<void> {
  const r = await runAutopilot(db, now, {
    appUrl: appUrl(),
    async quote(id): Promise<Quote | null> {
      const b = await kalshi.getOrderbook(id, "hot");
      if (!b) return null;
      return { yesAsk: b.yesAsks[0]?.price ?? null, noAsk: b.noAsks[0]?.price ?? null, yesBid: b.yesBids[0]?.price ?? null, noBid: b.noBids[0]?.price ?? null };
    },
    async push(userId, msg) { for (const t of await pushTargets(db, userId)) if ((await sendPush(t, msg)) === "gone") await dropPush(db, t.endpoint); },
    claim: (userId, key) => claimAlert(db, userId, key, "push"),
  });
  if (r.sent + r.skipped + r.capped + r.exits + r.quiet) log(`autopilot: ${r.sent} sent, ${r.quiet} quiet, ${r.skipped} too late, ${r.capped} capped, ${r.exits} exit signals`);
}

const STALE_MS = 6 * 3_600_000;

/** Backtests for the starters and every active rule whose result is missing or older than 6 hours. */
export async function autopilotBacktestsOnce(db: Db, now: number): Promise<number> {
  const specs = [...STARTERS.map(s => s.spec), ...(await db.select({ spec: autopilotRules.spec }).from(autopilotRules).where(eq(autopilotRules.active, true))).map(r => cleanSpec(r.spec))];
  const fresh = new Set((await db.execute(sql`select key from terminal.autopilot_backtests where computed_at > ${new Date(now - STALE_MS)}`)).rows.map(r => String((r as { key: string }).key)));
  const due = new Map(specs.map(s => [specKey(s), s]).filter(([k]) => !fresh.has(k as string)) as Array<[string, typeof specs[number]]>);
  // The report refreshes every 30 minutes: the Kalshi price history behind it is still filling in.
  const reportDue = !((await db.execute(sql`select 1 from terminal.autopilot_backtests where key = ${REPORT_KEY} and computed_at > ${new Date(now - 30 * 60_000)}`)).rowCount);
  if (!due.size && !reportDue) return 0;
  const rows = await backtestRows(db, now);
  if (reportDue) {
    // Stored next to the backtests (same table, its own key); read back as a RulesReport.
    const report = rulesReport(rows, now) as unknown as Backtest;
    await db.insert(autopilotBacktests).values({ key: REPORT_KEY, result: report, computedAt: new Date(now) }).onConflictDoUpdate({ target: autopilotBacktests.key, set: { result: report, computedAt: new Date(now) } });
  }
  for (const [key, spec] of due) {
    const result = backtest(spec, rows, now);
    await db.insert(autopilotBacktests).values({ key, result, computedAt: new Date(now) }).onConflictDoUpdate({ target: autopilotBacktests.key, set: { result, computedAt: new Date(now) } });
  }
  return due.size;
}
