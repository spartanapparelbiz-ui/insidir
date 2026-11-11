/* lib/verified/checks.ts: the four checks and their numbers, months as 30-day blocks, hedging as both sides of a
 * market, concentration against all-time profit, the bankroll as the most held at once; lib/copies/sizing.ts and the
 * copy pushes' words (lib/copies/alerts.ts); My copies' totals (lib/copies/mine.ts). */
import { describe, expect, it } from "vitest";
import { peakExposure, verdict, type ClosedPos, type WalletRead } from "@/lib/verified/checks";
import { matchedSize, pctText, sizeLine, validCopySettings } from "@/lib/copies/sizing";
import { cheaper, dropDue, dropMessage, entryMessage, exitMessage } from "@/lib/copies/alerts";
import { copyValue, periodStarts, totals, type MyCopy } from "@/lib/copies/mine";

const NOW = Date.UTC(2026, 10, 11, 18), DAY = 86_400_000;
const pos = (i: number, daysAgo: number, pnl: number, o: Partial<ClosedPos> = {}): ClosedPos => ({ marketId: `m${i}`, outcomeIndex: 0, pnl, moneyIn: 1_000, at: NOW - daysAgo * DAY, start: NOW - (daysAgo + 1) * DAY, title: `Market ${i}`, category: "football", outcome: "Yes", ...o });
const read = (o: Partial<WalletRead> = {}): WalletRead => ({
  wallet: "0x" + "a".repeat(40), name: null, pnl: 2_000_000, settled: 60, windowComplete: true, open: [], biggestWin: 300_000, openValue: 10_000, cash: 0,
  recent: [...Array.from({ length: 20 }, (_, i) => pos(i, 5 + i, 100)), ...Array.from({ length: 20 }, (_, i) => pos(20 + i, 40 + i, 50)), ...Array.from({ length: 20 }, (_, i) => pos(40 + i, 70 + i, -10))],
  ...o,
});

describe("Verified checks", () => {
  it("a wallet passing all four is Verified, with each check's numbers", () => {
    const v = verdict(read(), NOW);
    expect(v.verified).toBe(true);
    expect(v.checks.map(c => [c.key, c.pass])).toEqual([["settled", true], ["months", true], ["concentration", true], ["hedging", true]]);
    expect(v.months).toEqual([2000, 1000, -200]);
    expect(v.checks[1]!.detail).toContain("2 of 3 profitable");
    expect(v.checks[2]!.detail).toContain("15%");
    expect([v.won, v.lost, v.pnl30, v.pnl90]).toEqual([40, 20, 2000, 2800]);
  });
  it("each failure on its own: under 50 settled; 1 good month of 3; one trade over 40%; hedging; history unreadable", () => {
    expect(verdict(read({ settled: 49 }), NOW).checks.find(c => c.key === "settled")).toMatchObject({ pass: false, detail: "49 settled." });
    const bad = read({ recent: [...Array.from({ length: 30 }, (_, i) => pos(i, 5, 100)), ...Array.from({ length: 30 }, (_, i) => pos(30 + i, 45, -100))] });
    expect(verdict(bad, NOW).checks.find(c => c.key === "months")!.pass).toBe(false);
    expect(verdict(read({ biggestWin: 900_000 }), NOW).checks.find(c => c.key === "concentration")!.pass).toBe(false);
    const hedged = read({ open: Array.from({ length: 15 }, (_, i) => ({ marketId: `m${i}`, outcomeIndex: 1, value: 1, moneyIn: 1, start: NOW - DAY })) });
    expect(verdict(hedged, NOW).checks.find(c => c.key === "hedging")).toMatchObject({ pass: false });
    expect(verdict(read({ windowComplete: false }), NOW).checks.find(c => c.key === "months")).toMatchObject({ pass: false, detail: "Too many trades to read 90 days of history." });
    expect(verdict(read({ settled: 10 }), NOW).verified).toBe(false);
  });
  it("bankroll: the most in open positions at once, or holdings now when more; the average position as a share", () => {
    expect(peakExposure([{ start: 1, end: 10, money: 5 }, { start: 5, end: 20, money: 7 }, { start: 15, end: 30, money: 1 }])).toBe(12);
    const v = verdict(read({ recent: [pos(1, 5, 10, { moneyIn: 2_000 }), pos(2, 5, 10, { moneyIn: 2_000 })], openValue: 100 }), NOW);
    expect(v.bankroll).toBe(4_000); // both open at once
    expect(v.avgSizePct).toBe(0.5);
  });
});

describe("Your size", () => {
  const mine = validCopySettings({ bankroll: 2000, maxTrade: 100, dropCents: 10 })!;
  it("the same share of your bankroll, never over your max, whole dollars", () => {
    expect(matchedSize(2_000, 100_000, mine)).toEqual({ theirPct: 0.02, yours: 40, capped: false });
    expect(matchedSize(10_000, 100_000, mine)).toEqual({ theirPct: 0.1, yours: 100, capped: true });
    expect(matchedSize(10, 1_000_000, mine)!.yours).toBe(1);
    expect(matchedSize(1_000, null, mine)).toBeNull();
    expect(matchedSize(1_000, 50_000, null)).toBeNull();
    expect(sizeLine(matchedSize(2_000, 100_000, mine)!)).toBe("They put in 2%. Sizing: $40.");
    expect([pctText(0.0004), pctText(0.004), pctText(0.25)]).toEqual(["<0.1%", "0.4%", "25%"]);
  });
  it("settings: a bankroll, a max no bigger than it, a drop of 1–99¢ or none", () => {
    expect(validCopySettings({ bankroll: "500", maxTrade: "50", dropCents: "" })).toEqual({ bankroll: 500, maxTrade: 50, dropCents: null });
    expect(validCopySettings({ bankroll: 500, maxTrade: 600 })).toBeNull();
    expect(validCopySettings({ bankroll: 5, maxTrade: 1 })).toBeNull();
    expect(validCopySettings({ bankroll: 500, maxTrade: 50, dropCents: 150 })).toBeNull();
  });
});

describe("Copy pushes", () => {
  it("entry: wallet, market, side, their size, your size, price, and the cheaper venue", () => {
    const m = entryMessage({ id: "pm:1", wallet: "0x" + "b".repeat(40), pnl: 2.4e6, verified: true, title: "Heat vs. Jazz", outcome: "Heat", amount: 12_000, price: 0.55 },
      { theirPct: 0.02, yours: 40, capped: false }, { polymarket: 0.55, kalshi: 0.53 }, "https://insidir.com");
    expect(m.title).toBe("Signal");
    expect(m.body).toBe("Verified 0xbbbb…bbbb, up $2.4M, opened $12K on Heat in “Heat vs. Jazz” at 55¢. Sizing: $40, 2% of your bankroll, as they put in 2% of theirs (matched size, not advice). Kalshi 53¢, Polymarket 55¢: Kalshi is cheaper.");
    expect(m.url).toBe("https://insidir.com/copy/pm%3A1");
    expect([cheaper({ polymarket: 0.5, kalshi: null }), cheaper({ polymarket: 0.5, kalshi: 0.51 }), cheaper({ polymarket: null, kalshi: null })]).toEqual(["polymarket", "polymarket", null]);
  });
  it("exit: how much it sold and at what, next to your entry; one tap to the market", () => {
    const m = exitMessage({ id: "ps:1", kind: "trim", sold: 0.6, price: 0.84 }, { id: 7, outcome: "Heat", title: "Heat vs. Jazz", entry: 0.77 }, "https://insidir.com", "0x" + "b".repeat(40));
    expect(m.title).toBe("Exit signal");
    expect(m.body).toBe("0xbbbb…bbbb sold 60% of Heat in “Heat vs. Jazz” at 84¢. Result: +9%. You entered at 77¢.");
    expect(m.url).toBe("https://insidir.com/api/copies/open?id=7");
    expect(exitMessage({ id: "x", kind: "exit", sold: 1, price: 0.6 }, { id: 7, outcome: "Heat", title: "T", entry: 0.77 }, "", "0x" + "b".repeat(40)).body).toBe("0xbbbb…bbbb closed Heat in “T” at 60¢. Result: −22%. You entered at 77¢.");
  });
  it("price drop: due at the set cents under entry, never when off", () => {
    expect([dropDue(0.77, 0.67, 10), dropDue(0.77, 0.68, 10), dropDue(0.77, 0.5, null), dropDue(0.77, null, 10)]).toEqual([true, false, false, false]);
    expect(dropMessage({ id: 1, outcome: "Heat", title: "T", entry: 0.77 }, 0.62, "").body).toBe("Heat (“T”) is at 62¢, 15¢ under your 77¢ entry.");
  });
});

describe("My copies", () => {
  const c = (o: Partial<MyCopy>): MyCopy => ({ id: 1, betId: "b", title: "T", outcome: "Heat", side: "yes", venue: "kalshi", at: NOW, status: "placed", amount: 100, entry: 0.5, theirPrice: 0.5, now: 0.6, wallet: null, short: null, stillIn: true, result: null, pnl: null, value: null, ...o });
  it("values: settled at P&L, open at today's price", () => {
    expect(copyValue(c({}))).toBe(20);
    expect(copyValue(c({ result: "lost", pnl: -100 }))).toBe(-100);
    expect(copyValue(c({ now: null }))).toBeNull();
  });
  it("totals count placed copies only, by week, month and all time (ET)", () => {
    const { week, month } = periodStarts(NOW);
    expect(new Date(week).toISOString()).toBe("2026-11-09T05:00:00.000Z"); // Monday 00:00 ET
    expect(new Date(month).toISOString()).toBe("2026-11-01T04:00:00.000Z"); // Nov 1 00:00 EDT
    const list = [c({ value: 20 }), c({ value: -5, at: NOW - 5 * DAY }), c({ value: 50, at: NOW - 30 * DAY }), c({ value: 999, status: "skipped" }), c({ value: 999, status: "copied" })];
    expect(totals(list, NOW)).toEqual({ week: 20, month: 15, all: 65, placed: 3, open: 3 });
  });
});
