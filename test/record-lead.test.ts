/* lib/autopilot/lead.ts: /go, the paywall and the landing lead only with a rule positive over 100+ settled bets on
 * Kalshi; none qualifies → nothing (Nov 4: "$50 on every millionaire bet: −$722 over 233 settled" was on /go). */
import { describe, expect, it } from "vitest";
import { leadLine, leadOf } from "@/lib/autopilot/lead";
import type { ReportRow, RulesReport } from "@/lib/autopilot/report";

const row = (key: string, group: string, won: number, lost: number, net: number): ReportRow => {
  const settled = won + lost;
  return { key, group, name: key, settled, leads: settled >= 100 && net > 0,
    result: { days: 180, from: 0, to: 0, bets: settled, won, lost, void: 0, open: 0, staked: settled * 25, net, roi: net / (settled * 25), winRate: won / settled, tooLate: 0, capped: 0, maxDrawdown: 0, offKalshi: 0 } as ReportRow["result"] };
};
const report = (rows: ReportRow[]): RulesReport => ({ at: 0, days: 180, rows, bets: 0, onKalshi: 0, note: "" });

describe("the record pages lead with", () => {
  it("nothing when no rule is positive over 100+ settled: losing, or too few", () => {
    expect(leadOf(report([row("all", "Baseline", 133, 144, -907), row("big", "Variants", 35, 30, 35)]))).toBeNull();
    expect(leadOf(null)).toBeNull();
  });

  it("the best qualifying rule by net, never a category or a price band picked after the fact", () => {
    const l = leadOf(report([row("all", "Baseline", 133, 144, -907), row("big", "Variants", 64, 54, 412), row("first", "Variants", 70, 60, 120),
      row("cat:golf", "Category", 90, 30, 2000), row("band:0.3", "Entry price on Kalshi", 80, 40, 1500)]))!;
    expect(l).toMatchObject({ key: "big", settled: 118, won: 64, net: 412, perBet: 25, days: 180 });
    expect(leadLine({ ...l, name: "Bets of $50K+" })).toBe("“Bets of $50K+”: +$412 on $25 a bet, 64 won of 118 settled on Kalshi in 180 days, at the ask + 1¢.");
  });
});
