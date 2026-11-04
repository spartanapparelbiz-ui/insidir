/* The landing's live value rules (lib/brand/pulse.ts): when millionaire money "disagrees with the price", the Election
 * Day window in ET, and outcome names that never put a bare Yes/No beside a named side. */
import { describe, expect, it } from "vitest";
import { disagreements, electionDay, majorRace } from "@/lib/brand/pulse";
import type { MarketMoney } from "@/lib/millionaires/queries";
import { outcomeNames } from "@/lib/millionaires/queries";

const mm = (o: { yes: number; no: number; wy?: number; wn?: number; price: number | null; id?: string }): MarketMoney => ({
  marketId: o.id ?? "m", title: "Chiefs vs. Bills", event: "", category: "football", yesLabel: "Chiefs", noLabel: "Bills", priceNow: o.price, last: 0,
  millionaire: { yes: { dollars: o.yes, wallets: o.wy ?? 2 }, no: { dollars: o.no, wallets: o.wn ?? 1 } }, pro: { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } },
});

describe("where millionaires disagree with the price", () => {
  it("70%+ of the money on a side priced 50¢ or less counts; the gap is share minus price", () => {
    const [d] = disagreements([mm({ yes: 82_000, no: 18_000, price: 0.46 })]);
    expect(d).toMatchObject({ side: "yes", outcome: "Chiefs", share: 0.82, price: 0.46 });
    expect(d!.gap).toBeCloseTo(0.36);
  });
  it("the NO side reads the NO price (1 − YES)", () => {
    const [d] = disagreements([mm({ yes: 10_000, no: 90_000, price: 0.7 })]);
    expect(d).toMatchObject({ side: "no", outcome: "Bills" });
    expect(d!.price).toBeCloseTo(0.3);
  });
  it("agreeing with the price, a thin split, too little money, one wallet or no price never counts", () => {
    expect(disagreements([
      mm({ yes: 82_000, no: 18_000, price: 0.6 }), // the price agrees
      mm({ yes: 60_000, no: 40_000, price: 0.3 }), // under 70%
      mm({ yes: 15_000, no: 0, price: 0.2 }), // under $20K
      mm({ yes: 50_000, no: 0, wy: 1, wn: 0, price: 0.2 }), // one wallet
      mm({ yes: 50_000, no: 0, price: null }), // no price
    ])).toEqual([]);
  });
  it("biggest gap first", () => {
    const got = disagreements([mm({ id: "a", yes: 80_000, no: 20_000, price: 0.5 }), mm({ id: "b", yes: 95_000, no: 5_000, price: 0.2 })]);
    expect(got.map(d => d.marketId)).toEqual(["b", "a"]);
  });
});

describe("the Election Day board's window", () => {
  const et = (iso: string) => Date.parse(iso);
  it("Nov 3 and Nov 4 in ET only", () => {
    expect(electionDay(et("2026-11-03T04:59:00Z"), undefined)).toBe(false); // 11:59 pm ET, Nov 2
    expect(electionDay(et("2026-11-03T05:00:00Z"), undefined)).toBe(true); // midnight ET, Nov 3
    expect(electionDay(et("2026-11-04T04:59:00Z"), undefined)).toBe(true); // 11:59 pm ET, Nov 3
    expect(electionDay(et("2026-11-04T05:00:00Z"), undefined)).toBe(false); // Nov 4: the election is over
    expect(electionDay(et("2026-11-04T20:00:00Z"), "on")).toBe(false); // a leftover "on" can't bring it back
  });
  it("ELECTION_BOARD=on / off overrides the dates", () => {
    expect(electionDay(et("2026-06-01T12:00:00Z"), "on")).toBe(true);
    expect(electionDay(et("2026-11-03T12:00:00Z"), "off")).toBe(false);
  });
});

describe("outcome names on the check", () => {
  it("never a bare No beside a player, never Yes beside a team", () => {
    expect(outcomeNames("Tennis match 100", "Player A", "No")).toEqual({ yesLabel: "Player A", noLabel: "Not Player A" });
    expect(outcomeNames("Chiefs vs. Bills", "Yes", "Bills")).toEqual({ yesLabel: "Chiefs", noLabel: "Bills" });
    expect(outcomeNames("Will it rain?", "Yes", "No")).toEqual({ yesLabel: "Yes", noLabel: "No" });
    // A multi-outcome market's group title is not an outcome: a "Will …?" question is Yes or No.
    expect(outcomeNames("Will Republicans win Iowa and Kansas, and lose Alaska?", "IA, KS", "No")).toEqual({ yesLabel: "Yes", noLabel: "No" });
    expect(outcomeNames("Will Republicans lose the Texas Senate seat?", "None", "No")).toEqual({ yesLabel: "Yes", noLabel: "No" });
    expect(outcomeNames("2026 Balance of Power: R Senate, R House", "Republicans Sweep", "No")).toEqual({ yesLabel: "Yes", noLabel: "No" });
  });
});

describe("major races on the Election Day board", () => {
  it("control of the Senate and House, single Senate and governor races; never combination bets", () => {
    expect(majorRace("Which party will control the Senate after the 2026 midterms?")).toBe("control");
    expect(majorRace("2026 Balance of Power: D Senate, D House")).toBe("control");
    expect(majorRace("Will the Republicans win the Texas Senate race in 2026?")).toBe("race");
    expect(majorRace("Will the Democrats win the Georgia governor race?")).toBe("race");
    expect(majorRace("Will Republicans win Iowa and Kansas, and lose Alaska, Maine, Michigan, Ohio, and Texas?")).toBeNull();
    expect(majorRace("Will Republicans lose the Alaska, Iowa, Kansas, Maine, Michigan, Ohio, and Texas Senate seats?")).toBeNull();
    expect(majorRace("Will Trump meet Lula by November 30?")).toBeNull();
  });
});
