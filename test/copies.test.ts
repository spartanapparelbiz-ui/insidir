/* Copy the winners, the pure parts: P&L at your size counting only moves shown after the copy began; signed dollars
 * and returns; where Open goes (US → the matched Kalshi market at Kalshi's price on the same-paying side, else view
 * only; elsewhere Polymarket); the copy size setting; the one-line note. */
import { describe, expect, it } from "vitest";
import { cents, copyResult, kalshiSide, oneLine, returnText, signedDollars, sidePrice } from "@/lib/copies/math";
import { copySizeOf, DEFAULT_COPY_SIZE } from "@/lib/copies/size";
import { openFor } from "@/lib/copies/store";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import { parseSettings } from "@/app/api/settings/validate";

const H = 3_600_000;
describe("copy P&L", () => {
  const start = 100 * H;
  const rows = [
    { seenPrice: 0.49, seenAt: start - H, result: "won" as const, settledAt: start + H }, // shown before the copy began: left out
    { seenPrice: 0.49, seenAt: start + H, result: "won" as const, settledAt: start + 5 * H }, // followed at 50¢
    { seenPrice: 0.24, seenAt: start + 2 * H, result: "lost" as const, settledAt: start + 6 * H },
    { seenPrice: 0.3, seenAt: start + 3 * H, result: null, settledAt: null }, // still open
    { seenPrice: null, seenAt: start + 3 * H, result: "won" as const, settledAt: start + 7 * H }, // no price to follow at
    { seenPrice: 0.5, seenAt: start + 3 * H, result: "void" as const, settledAt: start + 7 * H },
  ];
  it("counts only moves after the copy began, at seen price + 1 point, at your size", () => {
    const r = copyResult(rows, 50, start);
    // won at 0.50: 50 / 0.5 − 50 = +50; lost: −50.
    expect(r).toEqual({ n: 2, won: 1, lost: 1, staked: 100, net: 0 });
    const r10 = copyResult(rows.slice(0, 2), 10, start);
    expect(r10.net).toBeCloseTo(10, 6);
    expect(copyResult(rows, 100, start, start + 6 * H)).toEqual({ n: 1, won: 0, lost: 1, staked: 100, net: -100 });
  });
  it("shows it down when it's down", () => {
    expect(signedDollars(212.4)).toBe("+$212");
    expect(signedDollars(-40)).toBe("−$40");
    expect(signedDollars(0.2)).toBe("$0");
    expect(returnText({ net: -5, staked: 100 })).toBe("−5.0%");
    expect(returnText({ net: 0, staked: 0 })).toBeNull();
  });
});

describe("where Open goes", () => {
  const poly = { source: "polymarket" as const, url: "https://polymarket.com/event/x", marketId: "0xpoly", outcomeSide: "yes" as const };
  const polyYes = new Map([["0xpoly", 0.6]]);
  const kalshiYes = new Map([["KXNBA-LAL", 0.35]]);
  const match = { kalshiId: "KXNBA-LAL", url: "https://kalshi.com/markets/kxnba/lal", inverted: true };
  it("a US member copying a Polymarket wallet gets the matched Kalshi market at Kalshi's price, never Polymarket", () => {
    const o = openFor(poly, "us", match, polyYes, kalshiYes);
    expect(o.open).toEqual({ venue: "kalshi", href: "https://kalshi.com/markets/kxnba/lal" });
    // Inverted pair: YES on Polymarket pays like NO on Kalshi: 1 − 0.35.
    expect(o.yourPrice).toBeCloseTo(0.65, 6);
    expect(openFor(poly, null, match, polyYes, kalshiYes).open?.venue).toBe("kalshi");
  });
  it("no Kalshi match in the US: view only, no link", () => {
    expect(openFor(poly, "us", undefined, polyYes, kalshiYes)).toEqual({ open: null, yourPrice: null });
  });
  it("outside the US: Polymarket at Polymarket's price; Kalshi moves open on Kalshi for everyone", () => {
    expect(openFor(poly, "non_us", match, polyYes, kalshiYes)).toEqual({ open: { venue: "polymarket", href: poly.url }, yourPrice: 0.6 });
    const k = { source: "kalshi" as const, url: "https://kalshi.com/markets/kxnba/lal", marketId: "KXNBA-LAL", outcomeSide: "no" as const };
    expect(openFor(k, "us", undefined, polyYes, kalshiYes)).toEqual({ open: { venue: "kalshi", href: k.url }, yourPrice: 0.65 });
  });
  it("side and price helpers", () => {
    expect(kalshiSide("yes", false)).toBe("yes");
    expect(kalshiSide("no", true)).toBe("yes");
    expect(sidePrice(0.2, "no")).toBeCloseTo(0.8, 6);
    expect(sidePrice(null, "yes")).toBeNull();
    expect(cents(0.414)).toBe("41¢");
    expect(cents(null)).toBe("—");
  });
});

describe("copy size and note", () => {
  it("is $10, $50 or $100 a move; $10 until set", () => {
    expect(DEFAULT_COPY_SIZE).toBe(10);
    expect(copySizeOf(DEFAULT_SETTINGS)).toBe(10);
    expect(copySizeOf({ copySize: 50 })).toBe(50);
    expect(copySizeOf({ copySize: 25 })).toBe(10);
    expect(parseSettings({ copySize: "100" }, DEFAULT_SETTINGS, "us").settings.copySize).toBe(100);
    expect(parseSettings({ copySize: "25" }, DEFAULT_SETTINGS, "us").errors).toEqual(["Pick $10, $50 or $100 per move."]);
    // Kept when other settings change.
    expect(parseSettings({ showYellow: false }, { ...DEFAULT_SETTINGS, copySize: 50 }, "us").settings.copySize).toBe(50);
  });
  it("the note is one line", () => {
    expect(oneLine("Bought 49¢ Lakers. The wallet is 41–20 on NBA. More text.")).toBe("Bought 49¢ Lakers.");
    expect(oneLine("  ")).toBeNull();
    expect(oneLine("x".repeat(300))!.length).toBe(160);
  });
});

describe("notes on My copies", () => {
  it("name the wallet by its short address, never its account name", async () => {
    const { byAddress } = await import("@/lib/copies/store");
    const m = { wallet: "0xe2e00000000000000000000000000000000000dd", walletName: "E2E-Follow" };
    expect(byAddress("E2E-Follow's largest position this month.", m)).toBe("0xe2…dd's largest position this month.");
    expect(byAddress(null, m)).toBeNull();
    expect(byAddress("No name here.", { wallet: null, walletName: null })).toBe("No name here.");
  });
});
