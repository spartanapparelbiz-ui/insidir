import { describe, expect, it } from "vitest";
import { deadlineAlert, exitAlert, moveAlert, MOVE_MIN, oppositeAlert, positionLine, settledResult, shareSold, shortSpan, upFloor, type Held } from "@/lib/watch/alerts";
import { hundredPays, whatHappened } from "@/lib/watch/happened";
import { isAddress, readV2Positions } from "@/lib/watch/store";

const H = 3_600_000;
const held: Held = { title: "Will the Chiefs win?", side: "yes", sideLabel: "Yes", price: 0.62, amount: 100, shares: 100 / 0.62 };
const W1 = "0x000d257d2dc7616feaef4ae0f14600fdf50a758e", W2 = "0x7c3db723f1d4d8cb9c55009520aa11bb22cc5c6b";

describe("Polymarket v2 positions", () => {
  const page = {
    data: [
      { proxy_wallet: W1, condition_id: "0x19D2FF72E389D190C183E6B114817301D29EBA651D67D75A38EE201A05188FD9", current_size: 67560.7, avg_price: 0.7658, total_cost_usdc: 52220.57,
        current_price: 0.984, current_value: 66479.73, total_pnl: 19310.5, status: "OPEN", title: "Will Mary Peltola win?", slug: "peltola", event_slug: "ak-sen", outcome: "Yes", outcome_index: 0,
        end_date: "2026-11-04", name: "someone", profile_image: "https://x/y.jpg" },
      { condition_id: "0xf036481613a53faafdc7638824e5dfab03b4dda5b9bf13fbdfa2075e2d4a8bea", current_size: "56422.7", avg_price: "0.9577", entry_cost_usdc: 54040.08, outcome: "No", outcome_index: 1, status: "OPEN", title: "Blockade?" },
      { condition_id: "bad", current_size: 1, avg_price: 0.5 },
    ],
    pagination: { limit: 2, offset: 0, has_more: true, next_cursor: "abc123" },
  };
  it("reads positions (lower-cased ids, the side from the outcome index, cost, value and profit) and the next cursor", () => {
    const r = readV2Positions(page);
    expect(r.next).toBe("abc123");
    expect(r.positions).toHaveLength(2);
    expect(r.positions[0]).toMatchObject({ conditionId: "0x19d2ff72e389d190c183e6b114817301d29eba651d67d75a38ee201a05188fd9", side: "yes", size: 67560.7, avgPrice: 0.7658, cost: 52220.57, currentPrice: 0.984, value: 66479.73, pnl: 19310.5, outcome: "Yes" });
    expect(r.positions[1]).toMatchObject({ side: "no", size: 56422.7, avgPrice: 0.9577, cost: 54040.08, currentPrice: null });
    // Never a name or a picture.
    expect(JSON.stringify(r.positions)).not.toMatch(/someone|profile|jpg/);
  });
  it("stops paging on the last page and survives junk", () => {
    expect(readV2Positions({ ...page, pagination: { has_more: false, next_cursor: null } }).next).toBeNull();
    expect(readV2Positions(null)).toEqual({ positions: [], next: null });
    expect(readV2Positions({ data: "x" }).positions).toEqual([]);
  });
  it("only takes a 0x address", () => {
    expect(isAddress(W1)).toBe(true);
    expect(isAddress("polymarket.com/@someone")).toBe(false);
    expect(isAddress("0x123")).toBe(false);
  });
});

describe("alerts", () => {
  it("$1M+ wallets on the other side: how many, how much, how far up, their record; tier + short address only", () => {
    const a = oppositeAlert(held, "No", [
      { wallet: W1, short: "0x000d…758e", amount: 30_000, price: 0.4, pnl: 3_400_000 },
      { wallet: W2, short: "0x7c3d…5c6b", amount: 18_000, price: 0.41, pnl: 5_100_000 },
    ], { won: 14, lost: 6 }, "Politics", 0.6)!;
    expect(a.headline).toBe("2 wallets up $3M+ just bet No, $48K total. They're 14–6 on politics this month.");
    expect(a.meaning).toBe("That's money against your Yes. You're down $3 on your $100 on Yes at 62¢, with Yes at 60¢ now.");
    const one = oppositeAlert(held, "No", [{ wallet: W1, short: "0x000d…758e", amount: 25_000, price: 0.4, pnl: 1_200_000 }], null, null, null)!;
    expect(one.headline).toBe("A wallet up $1M+ (0x000d…758e) just bet No, $25K total.");
    expect(one.meaning).toContain("You hold $100 on Yes at 62¢: 161 shares that pay $161 if Yes wins.");
    expect(oppositeAlert(held, "No", [], null, null, 0.6)).toBeNull();
  });
  it("a wallet on their side sold: how much of it, at what price, how long after buying", () => {
    const a = exitAlert(held, { wallet: W1, walletName: "Millionaire 0x000d…758e", kind: "trim", shares: 5000, heldBefore: 10_000, amount: 3550, price: 0.71, at: 10 * H, firstBuyAt: 8 * H }, 0.7);
    expect(a.headline).toBe("Millionaire 0x000d…758e sold half at 71¢, 2h after buying: $3.5K of Yes out.");
    expect(a.meaning).toBe("That wallet was on your side. You're up $13 on your $100 on Yes at 62¢, with Yes at 70¢ now.");
    expect(shareSold(9500, 10_000)).toBe("all");
    expect(shareSold(3300, 10_000)).toBe("a third");
    expect(shareSold(1000, 10_000)).toBe("10%");
    expect(shareSold(5, 0)).toBe("part");
  });
  it("a move of 5¢ or more, with their profit or loss now", () => {
    expect(moveAlert(held, 0.62, 0.66, null)).toBeNull();
    const a = moveAlert(held, 0.62, 0.81, 3 * H)!;
    expect(a.headline).toBe(`Yes rose 19¢ in 3h: 62¢ → 81¢ on "Will the Chiefs win?".`);
    expect(a.meaning).toBe("You're up $31 on your $100 on Yes at 62¢, with Yes at 81¢ now. That's +$31 on the bet so far.");
    expect(moveAlert(held, 0.62, 0.62 - MOVE_MIN, null)!.headline).toContain("fell 5¢");
  });
  it("closing within 24 hours, never earlier", () => {
    const now = 1_800_000_000_000;
    expect(deadlineAlert(held, now + 25 * H, now, 0.6)).toBeNull();
    expect(deadlineAlert(held, now - H, now, 0.6)).toBeNull();
    const a = deadlineAlert(held, now + 5 * H, now, null)!;
    expect(a.headline).toBe(`"Will the Chiefs win?" closes in 5h.`);
    expect(a.meaning).toBe("If Yes wins, your 161 shares pay $161; if not, $0.");
  });
  it("small helpers", () => {
    expect(shortSpan(40 * 60_000)).toBe("40m");
    expect(shortSpan(50 * H)).toBe("2d");
    expect(upFloor(3_400_000)).toBe(3_000_000);
    expect(upFloor(450_000)).toBe(400_000);
    expect(positionLine(held, 0.62)).toBe("You're even on your $100 on Yes at 62¢, with Yes at 62¢ now.");
  });
});

describe("settling and what happened", () => {
  it("maps the market's result to the watched side", () => {
    expect(settledResult("yes", "yes")).toBe("won");
    expect(settledResult("no", "yes")).toBe("lost");
    expect(settledResult("no", "void")).toBe("void");
    expect(settledResult("yes", null)).toBeNull();
  });
  it("who was right, what following each top wallet paid, the member's own bet and record", () => {
    expect(hundredPays(0.25, "won")).toBe(400);
    expect(hundredPays(0.25, "lost")).toBe(0);
    expect(hundredPays(0.25, "void")).toBe(100);
    const h = whatHappened({
      title: "Will the Chiefs win?", result: "no", yesLabel: "Chiefs", noLabel: "Bills",
      money: { yes: { dollars: 120_000, wallets: 2 }, no: { dollars: 400_000, wallets: 3 } },
      top: [
        { wallet: W1, tier: "millionaire", side: "no", price: 0.4, amount: 300_000 },
        { wallet: W2, tier: "pro", side: "yes", price: 0.6, amount: 100_000 },
      ],
      mine: { side: "yes", price: 0.62, amount: 100, shares: 100 / 0.62 },
      record: [{ category: "nfl", won: 3, lost: 1, net: 120 }, { category: "world", won: 0, lost: 0, net: 0 }],
    });
    expect(h.result).toBe(`"Will the Chiefs win?" settled Bills.`);
    expect(h.right).toBe("$400K of the $1M+ money (3 wallets) was on Bills, and right; $120K (2 wallets) was on Chiefs, and wrong.");
    expect(h.following).toEqual([
      "$100 following Millionaire 0x000d…758e on Bills at 40¢ paid $250 (+$150).",
      "$100 following Pro 0x7c3d…5c6b on Chiefs at 60¢ paid $0 (−$100).",
    ]);
    expect(h.mine).toBe("Your $100 on Chiefs at 62¢ lost: $0 back (−$100).");
    expect(h.record).toHaveLength(1);
    expect(h.record[0]).toMatch(/: 3–1, \+\$120\.$/);
  });
  it("a voided market gives the money back", () => {
    const h = whatHappened({ title: "T", result: "void", yesLabel: "Yes", noLabel: "No", money: { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } }, top: [], mine: { side: "no", price: 0.3, amount: 50, shares: 50 / 0.3 }, record: [] });
    expect(h.result).toBe(`"T" was voided: every bet got its money back.`);
    expect(h.right).toBeNull();
    expect(h.mine).toBe("Your $50 on No at 30¢ came back: $50 back ($0).");
  });
});
