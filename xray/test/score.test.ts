import { describe, expect, it } from "vitest";
import {
  aggregateBuys, flow, FLOW_QUIET_USD, INSIDER_NEW_WALLET_HOURS, insiderFlags, SHARP_MIN_DECIDED, sharpMoney, topBuyerWallets, walletRecord,
  type WalletRecord,
} from "@/lib/score";
import { flowHeadline, sharpDetail, sharpHeadline } from "@/lib/copy";
import type { ClosedPosition, Holder, Trade } from "@/lib/types";

const OUT = ["Yes", "No"];
const pos = (pnl: number, conditionId = "0xother"): ClosedPosition => ({ conditionId, realizedPnl: pnl });
const SHARP: WalletRecord = { wins: 12, losses: 4, winRate: 0.75, profit: 9_000, sharp: true };
const DULL: WalletRecord = { wins: 3, losses: 9, winRate: 0.25, profit: -500, sharp: false };
const holder = (wallet: string, outcomeIndex: number, shares: number): Holder => ({ wallet, name: null, shares, outcomeIndex });
const trade = (o: Partial<Trade>): Trade => ({ wallet: "0xa", name: null, side: "BUY", size: 10_000, price: 0.5, timestamp: 1_000_000, outcomeIndex: 0, outcome: null, txHash: null, ...o });

describe("walletRecord", () => {
  it("counts wins and losses, ignores break-even, and sums profit", () => {
    const r = walletRecord([...Array(8).fill(pos(500)), ...Array(3).fill(pos(-100)), pos(0)]);
    expect([r.wins, r.losses, r.profit]).toEqual([8, 3, 3_700]);
    expect(r.winRate).toBeCloseTo(8 / 11);
    expect(r.sharp).toBe(true);
  });
  it("needs enough decided positions, a win rate and a profit", () => {
    expect(walletRecord(Array(SHARP_MIN_DECIDED - 1).fill(pos(5_000))).sharp).toBe(false); // too few
    expect(walletRecord([...Array(5).fill(pos(1_000)), ...Array(5).fill(pos(-10))]).sharp).toBe(false); // 50% win rate
    expect(walletRecord([...Array(9).fill(pos(50)), ...Array(3).fill(pos(-10))]).sharp).toBe(false); // $420 profit
    expect(walletRecord([...Array(9).fill(pos(500)), ...Array(3).fill(pos(-10))]).sharp).toBe(true);
  });
  it("leaves the market being X-rayed out of the record, and has no win rate with no decided positions", () => {
    const r = walletRecord([pos(10_000, "0xthis"), pos(-1)], "0xthis");
    expect([r.wins, r.losses, r.profit]).toEqual([0, 1, -1]);
    expect(walletRecord([]).winRate).toBeNull();
  });
});

describe("sharpMoney", () => {
  it("no holders: no call", () => {
    const s = sharpMoney([], new Map(), [0.4, 0.6], 2);
    expect(s.call).toBe(false);
    expect(s.leaderIndex).toBeNull();
    expect(sharpHeadline(s, OUT)).toBe("Not enough proven wallets here yet");
    expect(sharpDetail(s, false)).toBe("None of the top holders has a proven record yet");
  });
  it("no sharp wallets: holders without proven records are ignored", () => {
    const records = new Map([["0xa", DULL], ["0xb", DULL]]);
    const s = sharpMoney([holder("0xA", 0, 50_000), holder("0xB", 1, 50_000)], records, [0.4, 0.6], 2);
    expect(s.walletCount).toBe(0);
    expect(s.call).toBe(false);
  });
  it("one side only: 100% of sharp money on the one outcome", () => {
    const records = new Map([["0xa", SHARP], ["0xb", SHARP], ["0xc", DULL]]);
    const s = sharpMoney([holder("0xa", 1, 10_000), holder("0xb", 1, 5_000), holder("0xc", 0, 99_000)], records, [0.22, 0.78], 2);
    expect(s.perOutcome[0]).toBe(0);
    expect(s.perOutcome[1]).toBeCloseTo(11_700);
    expect(s.leaderIndex).toBe(1);
    expect(s.leaderShare).toBe(1);
    expect(s.call).toBe(true);
    expect(sharpHeadline(s, OUT)).toBe("Sharp money: 100% NO");
    expect(sharpDetail(s, false)).toBe("2 wallets with proven records hold $11.7K");
  });
  it("splits by value at current prices and needs two wallets and $1,000", () => {
    const records = new Map([["0xa", SHARP], ["0xb", SHARP], ["0xc", SHARP]]);
    const s = sharpMoney([holder("0xa", 0, 1_000), holder("0xb", 1, 2_000), holder("0xc", 1, 2_000)], records, [0.5, 0.5], 2);
    expect(s.perOutcome).toEqual([500, 2_000]);
    expect(s.leaderShare).toBeCloseTo(0.8);
    expect(sharpHeadline(s, OUT)).toBe("Sharp money: 80% NO");
    // one wallet is not enough, however big
    expect(sharpMoney([holder("0xa", 0, 1e6)], records, [0.5, 0.5], 2).call).toBe(false);
    // two wallets under $1,000 is not enough either
    expect(sharpMoney([holder("0xa", 0, 100), holder("0xb", 0, 100)], records, [0.5, 0.5], 2).call).toBe(false);
  });
  it("counts a wallet holding both sides once", () => {
    const records = new Map([["0xa", SHARP], ["0xb", SHARP]]);
    const s = sharpMoney([holder("0xa", 0, 3_000), holder("0xa", 1, 1_000), holder("0xb", 0, 2_000)], records, [0.5, 0.5], 2);
    expect(s.walletCount).toBe(2);
    expect(s.wallets).toHaveLength(3);
  });
  it("by shares once resolved", () => {
    const records = new Map([["0xa", SHARP], ["0xb", SHARP]]);
    const s = sharpMoney([holder("0xa", 0, 3_000), holder("0xb", 1, 1_000)], records, [1, 0], 2, true);
    expect(s.perOutcome).toEqual([3_000, 1_000]);
    expect(sharpDetail(s, true)).toBe("2 wallets with proven records held 4K shares");
  });
});

describe("aggregateBuys", () => {
  it("aggregates multiple fills per wallet and outcome: cash, average price, first fill", () => {
    const p = aggregateBuys([
      trade({ wallet: "0xA", size: 10_000, price: 0.1, timestamp: 300 }),
      trade({ wallet: "0xa", size: 30_000, price: 0.2, timestamp: 100 }),
      trade({ wallet: "0xa", size: 5_000, price: 0.9, outcomeIndex: 1, timestamp: 200 }),
      trade({ wallet: "0xa", side: "SELL", size: 99_999, price: 0.5 }),
      trade({ wallet: "0xb", size: 1_000, price: 0.5, timestamp: 50 }),
    ]);
    expect(p).toHaveLength(3);
    const yes = p.find(x => x.wallet.toLowerCase() === "0xa" && x.outcomeIndex === 0);
    expect(yes?.cash).toBeCloseTo(7_000);
    expect(yes?.shares).toBe(40_000);
    expect(yes?.avgPrice).toBeCloseTo(0.175);
    expect(yes?.firstBuyAt).toBe(100);
    expect(yes?.fills).toBe(2);
    expect(p[0]?.cash).toBeGreaterThanOrEqual(p[1]?.cash ?? 0); // biggest first
  });
  it("top buyer wallets are distinct", () => {
    const p = aggregateBuys([trade({ wallet: "0xa", outcomeIndex: 0 }), trade({ wallet: "0xa", outcomeIndex: 1 }), trade({ wallet: "0xb", size: 1 })]);
    expect(topBuyerWallets(p)).toEqual(["0xa", "0xb"]);
    expect(topBuyerWallets(p, 1)).toEqual(["0xa"]);
  });
});

describe("insiderFlags", () => {
  const buys = aggregateBuys([
    trade({ wallet: "0xnew", size: 100_000, price: 0.08, timestamp: 1_000_000 }),
    trade({ wallet: "0xmid", size: 20_000, price: 0.6, timestamp: 1_000_000 }),
    trade({ wallet: "0xold", size: 50_000, price: 0.1, timestamp: 1_000_000 }),
    trade({ wallet: "0xearly", size: 20_000, price: 0.5, timestamp: 1_000_000 }),
  ]);
  const ages = new Map([
    ["0xnew", { firstTradeAt: 1_000_000, marketsTraded: 1 }],
    ["0xmid", { firstTradeAt: 1_000_000 - 3 * 3600, marketsTraded: 7 }],
    ["0xold", { firstTradeAt: 1_000_000 - (INSIDER_NEW_WALLET_HOURS + 1) * 3600, marketsTraded: 2 }],
    // first-ever trade logged after the first buy here: the negative age clamps to 0
    ["0xearly", { firstTradeAt: 1_000_000 + 600, marketsTraded: null }],
  ]);
  const flags = insiderFlags(buys, ages);
  it("flags only wallets whose first-ever trade came within 72h before the buy", () => {
    expect(flags.map(f => f.wallet).sort()).toEqual(["0xearly", "0xmid", "0xnew"]);
  });
  it("strong on a long shot, with plain reasons", () => {
    const f = flags.find(x => x.wallet === "0xnew");
    expect(f?.level).toBe("strong");
    expect(f?.reasons).toEqual(["This was its first trade ever", "Has only traded 1 market", "Bought at 8¢, a long shot"]);
    expect(flags[0]?.wallet).toBe("0xnew"); // strong first
  });
  it("watch above 20¢, with the age in hours", () => {
    const f = flags.find(x => x.wallet === "0xmid");
    expect(f?.level).toBe("watch");
    expect(f?.reasons).toEqual(["First trade 3h before this bet"]);
  });
  it("clamps a negative age to 0", () => {
    const f = flags.find(x => x.wallet === "0xearly");
    expect(f?.ageAtBuy).toBe(0);
    expect(f?.reasons[0]).toBe("This was its first trade ever");
  });
  it("skips wallets with no known first trade", () => {
    expect(insiderFlags(buys, new Map([["0xnew", { firstTradeAt: null, marketsTraded: 1 }]]))).toEqual([]);
  });
});

describe("flow", () => {
  it("nets bought minus sold per outcome in cash, inside the window", () => {
    const f = flow([
      trade({ outcomeIndex: 1, size: 100_000, price: 0.5, timestamp: 200 }),
      trade({ outcomeIndex: 1, side: "SELL", size: 16_000, price: 0.5, timestamp: 200 }),
      trade({ outcomeIndex: 0, size: 10_000, price: 0.5, timestamp: 200 }),
      trade({ outcomeIndex: 0, size: 1e9, price: 0.5, timestamp: 50 }), // before the window
    ], 2, 100);
    expect(f.net).toEqual([5_000, 42_000]);
    expect(f.leaderIndex).toBe(1);
    expect(flowHeadline(f, OUT)).toBe("$42K net into NO in the last 24h");
  });
  it("is quiet with no trades or under the threshold", () => {
    expect(flowHeadline(flow([], 2, 0), OUT)).toBe("Quiet in the last 24h");
    const small = flow([trade({ size: (FLOW_QUIET_USD - 1) * 2, price: 0.5 })], 2, 0);
    expect(small.quiet).toBe(true);
    expect(flow([trade({ side: "SELL", size: 1e6 })], 2, 0).quiet).toBe(true); // only selling
  });
});
