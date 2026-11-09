import { describe, expect, it } from "vitest";
import { betExplain, pingExplain, usualText, winsIf } from "@/lib/brief/explain";
import { briefSince, itemLines, watchedLines, type BriefGroup } from "@/lib/brief/build";
import { BRIEF_HOUR_ET, briefDue, briefEmail } from "@/lib/brief/email";
import { askAnswerOk, askSummary, NOT_HAVE } from "@/lib/ask/run";
import { categoryFromWords, planAsk, subjectOf } from "@/lib/ask/tools";
import { pingMessage, pingMessageExplained, type PingBet } from "@/lib/millionaires/pings";
import type { Table } from "@/lib/research/tools";

const NOW = Date.UTC(2026, 10, 9, 14); // 9 a.m. ET, Monday Nov 9

describe("the explanation line", () => {
  const bet = { outcome: "Yes", side: "yes" as const, amount: 48_000, priceThen: 0.5, priceNow: 0.52, result: null, usual: 15_000 };
  it("a member's open bet: what $100 pays now, and how big it is for this wallet", () => {
    expect(betExplain(bet)).toBe("At 52¢ now: $100 pays $192 if Yes wins. 3.2× this wallet's usual bet.");
    expect(betExplain({ ...bet, outcome: "Lakers", usual: null })).toBe("At 52¢ now: $100 pays $192 if Lakers win.");
    expect(winsIf("Player A")).toBe("if Player A wins");
    expect(betExplain({ ...bet, priceNow: null })).toBe("At 50¢: $100 pays $200 if Yes wins. 3.2× this wallet's usual bet.");
  });
  it("a settled bet says what it paid, losses included", () => {
    expect(betExplain({ ...bet, result: "won" })).toBe("It won: $100 at 50¢ paid $200.");
    expect(betExplain({ ...bet, result: "lost" })).toBe("It lost: $100 at 50¢ paid $0.");
  });
  it("a visitor's line never carries the side or the side's price", () => {
    const v = betExplain({ ...bet, outcome: null, side: null, priceThen: null, priceNow: null })!;
    expect(v).toBe("A $48K bet, 3.2× this wallet's usual.");
    expect(v).not.toMatch(/Yes|No|¢/);
    expect(betExplain({ outcome: null, side: null, amount: 48_000, priceThen: null, priceNow: null, result: null, pnl: 2_400_000 })).toBe("A $48K bet from a wallet up $2.4M.");
    expect(betExplain({ outcome: null, side: null, amount: 48_000, priceThen: null, priceNow: null, result: null })).toBeNull();
  });
  it("usual size and wins-if words", () => {
    expect(usualText(30_000, 30_000)).toBe("about this wallet's usual bet");
    expect(usualText(5_000, 30_000)).toBe("smaller than this wallet's usual bet");
    expect(usualText(5_000, null)).toBeNull();
    expect(winsIf("no")).toBe("if No wins");
  });
  it("pings keep their words and add what it means", () => {
    const b: PingBet = { id: "b1", tier: "millionaire", amount: 120_000, category: "politics", title: "the Iowa Senate race", outcome: "Republicans", price: 0.6, pnl: 3_100_000, usual: 40_000 };
    const plain = pingMessage(b, 0.61, "https://insidir.com");
    const explained = pingMessageExplained(b, 0.61, "https://insidir.com");
    expect(explained.body.startsWith(plain.body)).toBe(true);
    expect(explained.body.slice(plain.body.length)).toBe(" What it means: at 61¢, $100 pays $163 if Republicans win; 3× this wallet's usual bet.");
    expect(pingExplain({ ...b, kind: "exit" }, null)).toBe("What it means: money that was on Republicans is leaving at 60¢.");
  });
});

describe("the Daily Brief", () => {
  const g: BriefGroup = { wallet: "0x7c3db723f1d4d8cb9c55009520aaaaaaaaaa5c6b", marketId: "m1", side: "no", outcome: "No", title: "Fed cuts in December?", category: "markets",
    amount: 412_000, price: 0.31, n: 3, at: NOW - 3_600_000, priceNow: 0.34, closed: false, pnl: 1_600_000 };
  const f = { tier: "millionaire" as const, short: "0x7c3d…5c6b", usualBet: 100_000, record: { n: 20, won: 14, lost: 6, net: 880, line: "14–6, $100 on each: +$880" } };
  it("starts at 8 p.m. ET the evening before", () => {
    expect(new Date(briefSince(NOW)).toISOString()).toBe("2026-11-09T01:00:00.000Z");
  });
  it("a member's item: what happened, then what it means, with the side", () => {
    const [l1, l2] = itemLines(g, f, true);
    expect(l1).toBe("Millionaire 0x7c3d…5c6b put $412K on No in “Fed cuts in December?” at 31¢ over 3 bets.");
    expect(l2).toBe("At 34¢ now, $100 pays $294 if No wins (up 3¢ since they bought); 4.1× this wallet's usual bet. Its settled Markets record: 14–6, $100 on each: +$880.");
  });
  it("a visitor's item has no side and no price", () => {
    const lines = itemLines(g, f, false);
    expect(lines[0]).toBe("Millionaire 0x7c3d…5c6b put $412K on “Fed cuts in December?” over 3 bets. Members see the side.");
    expect(lines.join(" ")).not.toMatch(/\bNo\b|¢/);
    expect(itemLines(g, { ...f, usualBet: null, record: null }, false)[1]).toBe("This wallet is up $1.6M all-time.");
  });
  it("a watched bet: its value now and the $1M+ money with and against it", () => {
    expect(watchedLines({ id: "w", marketId: "m", title: "Chargers win?", side: "yes", outcome: "Yes", price: 0.5, amount: 100, shares: 200, priceNow: 0.6, against: 48_000, with: 0 }))
      .toEqual(["Your $100 on Yes in “Chargers win?”: in at 50¢, now 60¢.", "It's worth $120 (+$20). Overnight, $1M+ wallets put $48K against you."]);
  });
  it("the email goes at 8 a.m. ET, once a day, with the brief and an unsubscribe link", () => {
    expect(BRIEF_HOUR_ET).toBe(8);
    expect(briefDue(Date.UTC(2026, 10, 9, 12, 59), null).due).toBe(false); // 7:59 a.m. ET
    expect(briefDue(NOW, null)).toEqual({ due: true, day: "2026-11-09" });
    expect(briefDue(NOW, "2026-11-09").due).toBe(false);
    const e = briefEmail({ since: 0, now: NOW, member: true, origin: "template", watched: [],
      items: [{ key: "k", marketId: "m1", title: "t", href: "/market/t", category: "markets", tier: "millionaire", short: "0x7c3d…5c6b", amount: 1, n: 1, at: 0, side: "no", outcome: "No", price: 0.3, priceNow: 0.3, lines: ["Line one.", "Line two."] }] },
      "https://insidir.com", "https://insidir.com/api/email/unsubscribe?u=x&s=y");
    expect(e.subject).toBe("The 8 AM brief: Line one.");
    expect(e.text).toContain("https://insidir.com/brief?via=email");
    expect(e.text).toContain("Information, not advice.");
    expect(e.html).toContain("unsubscribe?u=x&amp;s=y");
  });
});

describe("Ask Insidir", () => {
  const t = (rows: string[][]): Table => ({ tool: "x", title: "Best $1M+ wallets", columns: ["Wallet", "Settled W–L", "$100 on each"], numeric: [], rows: rows.map(r => r.map(text => ({ text }))), sources: [], at: 0, live: true });
  it("routes the example questions to its tools", () => {
    expect(planAsk("Who's the best NFL wallet this month and what's he on today?")).toEqual({ tool: "best_wallets", args: { category: "football", days: 30 } });
    expect(planAsk("Is anyone big against my Chargers bet?")).toEqual({ tool: "against_my_bet", args: { market: "chargers" } });
    expect(planAsk("Why did the Hegseth odds move?")).toEqual({ tool: "price_moves", args: { market: "hegseth" } });
    expect(planAsk("What's the weather like?")).toBeNull();
    expect(categoryFromWords("best NBA wallet")).toBe("basketball");
    expect(subjectOf("Why did the Hegseth odds move?")).toBe("hegseth");
  });
  it("says exactly “I don't have that.” when nothing answers", () => {
    expect(NOT_HAVE).toBe("I don't have that.");
    expect(askSummary([])).toBe(NOT_HAVE);
    expect(askSummary([t([])])).toBe(NOT_HAVE);
    expect(askAnswerOk(NOT_HAVE, [])).toBe(true);
  });
  it("holds the answer to the rows' numbers and bans causes, advice and forecasts", () => {
    const rows = [t([["Millionaire 0x7c3d…5c6b", "14–6", "+$880"]])];
    expect(askAnswerOk("Millionaire 0x7c3d…5c6b is 14–6, +$880 on $100 each.", rows)).toBe(true);
    expect(askAnswerOk("It is 15–6.", rows)).toBe(false);
    expect(askAnswerOk("You should bet on it.", rows)).toBe(false);
    expect(askAnswerOk("It will likely win.", rows)).toBe(false);
  });
});
