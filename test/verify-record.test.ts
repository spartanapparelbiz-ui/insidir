/* Verify links and the public record (lib/millionaires/queries.ts redact, lib/record/query.ts, lib/record/job.ts,
 * lib/moves/sources.ts slimTrade). The house rules: a visitor never gets an open position's side, by any field or link
 * (a Polygonscan transaction or address page shows which outcome was bought); a wallet is only its tier and short
 * address, so the stored raw trade never keeps a Polymarket name, pseudonym or picture. */
import { describe, expect, it } from "vitest";
import { lockVerify, redact, type BoardBet } from "@/lib/millionaires/queries";
import { recordView, toCsv, readFilter, filterQuery, type RecordRow } from "@/lib/record/query";
import { nightlyDue } from "@/lib/record/job";
import { slimTrade } from "@/lib/moves/sources";

const TX = "0x" + "ab".repeat(32), ADDR = "0x" + "cd".repeat(20);
const bet = (over: Partial<BoardBet> = {}): BoardBet => ({
  id: "pm:x", short: "0xcdcd…cdcd", wallet: ADDR, tier: "millionaire", category: "football", marketId: "0xm", title: "Bills vs. Jets", event: "Bills vs. Jets",
  pnl: 2_000_000, outcome: "Bills", side: "yes", amount: 50_000, priceThen: 0.4, priceNow: 0.45, closed: false, result: null, at: 0, url: null, teams: null,
  verify: { tx: TX, address: ADDR, kalshi: "https://kalshi.com/markets/x", polymarket: true, fetchedAt: 1, locked: false }, ...over,
});

describe("Verify's gating", () => {
  it("a visitor's open row has no transaction, no address and no side", () => {
    const v = redact(bet());
    expect(v.side).toBeNull(); expect(v.outcome).toBeNull(); expect(v.priceThen).toBeNull(); expect(v.priceNow).toBeNull();
    expect(v.verify).toMatchObject({ tx: null, address: null, locked: true, kalshi: "https://kalshi.com/markets/x" });
    expect(JSON.stringify(v)).not.toContain(TX);
    expect(JSON.stringify(v)).not.toContain(ADDR);
  });
  it("once the market settles, the transaction is public", () => {
    // …but never the wallet's address page: it lists the wallet's open trades too.
    expect(redact(bet({ result: "lost" })).verify).toMatchObject({ tx: TX, address: null, locked: false });
  });
  it("lockVerify keeps the market links and the fetch time", () => {
    expect(lockVerify(bet().verify)).toEqual({ tx: null, address: null, kalshi: "https://kalshi.com/markets/x", polymarket: true, fetchedAt: 1, locked: true });
  });
});

const row = (over: Partial<RecordRow> = {}): RecordRow => ({
  id: "pm:x", flaggedAt: Date.UTC(2026, 10, 8, 19, 5), flags: ["millionaire"], marketId: "0xm", market: "Bills vs. Jets", category: "football", categoryName: "Football",
  tier: "millionaire", wallet: ADDR, short: "0xcdcd…cdcd", outcome: "Bills", side: "yes", entryPrice: 0.4, size: 50_000, priceNow: 0.45, priceAt: 2, exitPrice: null,
  result: "open", moveCents: 5, verify: { tx: TX, address: ADDR, kalshi: null, polymarket: true, fetchedAt: 2, locked: false }, ...over,
});

describe("the record's gating", () => {
  it("a visitor's open position: no side, prices, move, wallet address or transaction", () => {
    const v = recordView(row(), false);
    expect(v).toMatchObject({ outcome: null, side: null, entryPrice: null, priceNow: null, moveCents: null, wallet: null, short: "0xcdcd…cdcd" });
    expect(v.verify).toMatchObject({ tx: null, address: null, locked: true });
    expect(JSON.stringify(v)).not.toMatch(/Bills"|0xabab|0xcdcdcdcd/);
  });
  it("settled and sold positions are public in full; members see open ones whole", () => {
    expect(recordView(row({ result: "lost", priceNow: 0, moveCents: -40 }), false)).toMatchObject({ outcome: "Bills", side: "yes", moveCents: -40, wallet: null, verify: { tx: TX, address: null } });
    expect(recordView(row({ result: "sold", exitPrice: 0.3, moveCents: -10 }), false)).toMatchObject({ outcome: "Bills", exitPrice: 0.3 });
    expect(recordView(row(), true)).toMatchObject({ outcome: "Bills", verify: { tx: TX } });
  });
});

describe("the record's filter and CSV", () => {
  it("defaults to the last 30 days, ET", () => {
    const f = readFilter({}, Date.UTC(2026, 10, 8, 17));
    expect(f).toMatchObject({ from: "2026-10-09", to: "2026-11-08", category: null, result: null });
    expect(readFilter({ category: "nope", result: "lost", tier: "pro" }, 0)).toMatchObject({ category: null, result: "lost", tier: "pro" });
    expect(filterQuery(readFilter({ result: "won" }, Date.UTC(2026, 10, 8, 17)))).toBe("result=won&from=2026-10-09&to=2026-11-08");
  });
  it("one line per position, losses and flat ones exactly like wins, with the sources", () => {
    const csv = toCsv([row({ result: "won", priceNow: 1, moveCents: 60 }), row({ id: "b", result: "lost", priceNow: 0, moveCents: -40 }), row({ id: "c", result: "open", moveCents: 0, verify: { tx: null, address: ADDR, kalshi: null, polymarket: false, fetchedAt: null, locked: false } })]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("flagged_et,market,category,tier,wallet");
    expect(lines[1]).toContain("2026-11-08 14:05 ET,Bills vs. Jets,Football,Millionaire,0xcdcd…cdcd");
    expect(lines[1]).toContain(",Won,https://polygonscan.com/tx/" + TX);
    expect(lines[2]).toContain(",-40,Lost,");
    expect(lines[3]).toContain(",0,Open,Source pending");
  });
});

describe("the record job's nightly pass", () => {
  it("runs once a day, from 3 AM ET", () => {
    expect(nightlyDue(Date.UTC(2026, 10, 8, 7, 30), null).due).toBe(false); // 2:30 AM ET
    expect(nightlyDue(Date.UTC(2026, 10, 8, 8, 5), null)).toEqual({ due: true, day: "2026-11-08" }); // 3:05 AM ET
    expect(nightlyDue(Date.UTC(2026, 10, 8, 20), "2026-11-08").due).toBe(false);
  });
});

describe("the stored source", () => {
  it("keeps the trade's provenance fields and never the account's name, pseudonym or picture", () => {
    const t = slimTrade({ proxyWallet: ADDR, side: "BUY", conditionId: "0xm", size: 100, price: 0.4, timestamp: 1, outcome: "Bills", outcomeIndex: 0, transactionHash: TX,
      name: "whale-king", pseudonym: "Brave-Otter", bio: "hi", profileImage: "https://x/y.png", profileImageOptimized: "https://x/z.png" });
    expect(t).toMatchObject({ proxyWallet: ADDR, transactionHash: TX, size: 100, price: 0.4, outcomeIndex: 0 });
    for (const k of ["name", "pseudonym", "bio", "profileImage", "profileImageOptimized"]) expect(t).not.toHaveProperty(k);
  });
});
