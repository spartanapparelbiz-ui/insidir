/* What /go, the paywall and the homepage may lead with: the best rule from the rules report (lib/autopilot/report.ts)
 * that is positive over LEAD_MIN_SETTLED+ settled bets at Kalshi's ask + 1¢, with its real numbers. None qualifies →
 * null, and those pages show no return figure at all (the full table, losses included, is on /results). Replaces the
 * old "$50 on every millionaire bet" line, which followed everything and lost money. Server only. */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotBacktests } from "@/lib/db/schema";
import { memo } from "@/lib/memo";
import { leaders, REPORT_KEY, type RulesReport } from "./report";

export interface Lead { key: string; name: string; settled: number; won: number; lost: number; net: number; roi: number; perBet: number; days: number }

/** The leading rule of a report, or null. Pure. */
export function leadOf(r: RulesReport | null): Lead | null {
  const x = leaders(r)[0];
  if (!x || x.result.roi === null) return null;
  return { key: x.key, name: x.name, settled: x.settled, won: x.result.won, lost: x.result.lost, net: x.result.net, roi: x.result.roi, perBet: 25, days: r!.days };
}

/** The stored report's leading rule, cached a minute. */
export function leadRule(db: Db): Promise<Lead | null> {
  return memo("record:lead", 60_000, async () => {
    const row = (await db.select().from(autopilotBacktests).where(eq(autopilotBacktests.key, REPORT_KEY)).limit(1))[0];
    return leadOf((row?.result ?? null) as unknown as RulesReport | null);
  });
}

/** "“Bets of $50K+”: +$412 on $25 a bet, 61 won of 118 settled on Kalshi in 180 days." Pure. */
export function leadLine(l: Lead): string {
  const net = `${l.net >= 0 ? "+" : "−"}$${Math.abs(Math.round(l.net)).toLocaleString("en-US")}`;
  return `“${l.name}”: ${net} on $${l.perBet} a bet, ${l.won} won of ${l.settled.toLocaleString("en-US")} settled on Kalshi in ${l.days} days, at the ask + 1¢.`;
}
