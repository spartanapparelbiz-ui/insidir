/* "Explain this market" (lib/analyst/market.ts): it explains and never recommends. The fallback passes the validator;
 * the validator rejects advice, predictions and numbers that aren't in the facts; AI_EXPLAIN=off switches it off. */
import { describe, expect, it } from "vitest";
import { explainOn, marketTemplate } from "@/lib/analyst/market";
import { validateNote } from "@/lib/analyst/validate";
import type { Facts } from "@/lib/analyst/types";

const facts: Facts = { moveId: "market:x", kind: "bet", at: 0, names: ["Miami (FL)", "Notre Dame", "Miami (FL) vs. Notre Dame", "Football", "Polymarket", "Pro"], facts: [
  { key: "market", label: "Market", text: "Miami (FL) vs. Notre Dame" },
  { key: "mil_yes", label: "Millionaire money on Miami (FL)", text: "$25K from 2 wallets up $1M+ on Miami (FL)" },
  { key: "mil_no", label: "Millionaire money on Notre Dame", text: "$65K from 1 wallet up $1M+ on Notre Dame" },
  { key: "biggest", label: "Biggest position", text: "the biggest position is $129K on Notre Dame at 90¢, from a wallet up $713K all-time" },
  { key: "price_now", label: "Price now", text: "Miami (FL) at 4¢ and Notre Dame at 96¢ on Polymarket now" },
] };

describe("Explain this market", () => {
  it("is on unless AI_EXPLAIN=off", () => {
    expect(explainOn({})).toBe(true);
    expect(explainOn({ AI_EXPLAIN: "off" })).toBe(false);
  });
  it("the fallback says what the data shows, from the facts only, and passes the validator", () => {
    const t = marketTemplate(facts);
    expect(t).toContain("$65K from 1 wallet up $1M+ on Notre Dame");
    expect(validateNote(t, facts)).toEqual({ ok: true, problems: [] });
  });
  it("advice, predictions and invented numbers never pass", () => {
    for (const bad of ["You should bet on Notre Dame.", "Notre Dame will win.", "Notre Dame is likely to cover.", "Take the Notre Dame side.", "$500K is on Notre Dame."])
      expect(validateNote(bad, facts).ok, bad).toBe(false);
  });
});
