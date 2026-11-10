/* lib/markets/depth.ts readDepth: a Polymarket /book reply → best bid and ask, the spread, five levels each way with
 * dollars (price × shares) and running totals; nothing usable → null. */
import { describe, expect, it } from "vitest";
import { readDepth } from "@/lib/markets/depth";

describe("readDepth", () => {
  it("sorts each side best first, keeps five levels, adds dollars and totals", () => {
    const d = readDepth({
      bids: [{ price: "0.40", size: "100" }, { price: "0.48", size: "50" }, { price: "0.45", size: "200" }],
      asks: [{ price: "0.55", size: "10" }, { price: "0.51", size: "100" }, ...Array.from({ length: 6 }, (_, i) => ({ price: String(0.6 + i / 100), size: "1" }))],
    }, 1)!;
    expect([d.bid, d.ask]).toEqual([0.48, 0.51]);
    expect(d.spread).toBeCloseTo(0.03);
    expect(d.bids.map(l => l.price)).toEqual([0.48, 0.45, 0.4]);
    expect(d.bids.map(l => l.dollars)).toEqual([24, 90, 40]);
    expect(d.bids.at(-1)!.total).toBe(154);
    expect(d.asks).toHaveLength(5);
  });
  it("an empty or broken book → null; one side only → no spread", () => {
    expect(readDepth(null, 1)).toBeNull();
    expect(readDepth({ bids: [], asks: [] }, 1)).toBeNull();
    expect(readDepth({ bids: [{ price: "0.3", size: "5" }] }, 1)).toMatchObject({ bid: 0.3, ask: null, spread: null });
  });
});
