/* Polymarket's placeholder outcomes never show on a race (lib/market/races.ts isPlaceholderOutcome). The House race once
 * listed "Party A" at 0¢, linking to a market page that 404s. */
import { describe, expect, it } from "vitest";
import { isPlaceholderOutcome } from "@/lib/market/races";

describe("isPlaceholderOutcome", () => {
  it.each([
    [null, "Will Party A win the House in 2026?"],
    ["Party A", "Will Party A win the House in 2026?"],
    [null, "Will Person B win the Texas Senate race in 2026?"],
    ["Option C", "Will Option C win the Florida governor race in 2026?"],
    [null, "Will Candidate D win?"],
  ])("%s / %s is a placeholder", (name, q) => expect(isPlaceholderOutcome(name, q)).toBe(true));

  it.each([
    [null, "Will the Democratic Party win the House in 2026?"],
    ["Democrats", "Which party will win the House in 2026?"],
    [null, "Will the Reform Party UK win the most seats?"],
    ["Ken Paxton", "Will Ken Paxton win the Texas Senate race in 2026?"],
    [null, "Will Option Alpha launch?"],
  ])("%s / %s is real", (name, q) => expect(isPlaceholderOutcome(name, q)).toBe(false));
});
