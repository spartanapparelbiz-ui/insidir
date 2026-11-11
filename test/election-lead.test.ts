/* The election headline says what millionaire wallets did in one candidate's own market, and the race card under it
 * says the same thing: a No on one candidate is never counted as money on another. Headlines stay within two lines. */
import { describe, expect, it } from "vitest";
import { headlineLines } from "@/lib/market/headline";
import { candidateMoney, raceLead, type Candidate, type ElectionDay, type RaceCard } from "@/lib/market/races";
import { dollars } from "@/lib/money";

const cand = (name: string, yes: number, no: number, price: number | null = 0.5, party: Candidate["party"] = null): Candidate =>
  ({ marketId: `0x${name.replace(/\W/g, "").toLowerCase()}`, name, party, image: null, price, mil: { yes, no }, result: null });
const race = (title: string, candidates: Candidate[], kind: RaceCard["kind"] = "race"): RaceCard =>
  ({ key: title, title, kind, candidates, total: candidates.reduce((t, c) => t + c.mil.yes + c.mil.no, 0), fallback: null });
const day = (...races: RaceCard[]): ElectionDay => ({ races, locked: [], at: 0 });

describe("the election headline", () => {
  it("Florida: a No on Byron Donalds is money against Donalds, never money on David Jolly", () => {
    const d = day(race("Florida Governor Election Winner", [cand("Byron Donalds", 0, 5_900, 0.66, "R"), cand("David Jolly", 0, 0, 0.34, "D")]));
    const lead = raceLead(d)!;
    expect(lead.headline).toBe("Millionaires traded $5.9K against Donalds.");
    expect(lead.headline).not.toMatch(/Jolly/);
    expect(lead.side).toBe("against");
    expect(lead.candidate.name).toBe("Byron Donalds");
    expect(lead.sub).toBe("Florida governor · Donalds 66¢ now.");
    expect(candidateMoney(d.races[0]!.candidates[1]!)).toBe("No millionaire money yet");
  });

  it("names the largest single position, Yes or No, in that candidate's own market", () => {
    const d = day(race("Texas Senate Election Winner", [cand("Ken Paxton", 30_000, 0, 0.28), cand("James Talarico", 0, 24_000, 0.73)]));
    expect(raceLead(d)!.headline).toBe("Millionaires traded $30K on Ken Paxton.");
  });

  it("control of a chamber reads as a party, and only when no head-to-head race has money", () => {
    const control = race("Which party will win the House in 2026?", [cand("Democratic Party", 48_000, 0, 0.95, "D"), cand("Republican Party", 0, 0, 0.06, "R")], "control");
    expect(raceLead(day(control))!.headline).toBe("Millionaires traded $48K on Democrats to win the House.");
    expect(raceLead(day(control, race("Ohio Governor Election Winner", [cand("Amy Acton", 1_000, 0)])))!.candidate.name).toBe("Amy Acton");
  });

  it("never more than two lines (so at most 2 at 1440 and 3 at 390), however long the name", () => {
    for (const name of ["Alexandria Ocasio-Cortez", "Catherine Cortez Masto", "Raphael Warnock", "Al"]) {
      for (const amount of [900, 5_900, 48_000, 1_250_000]) {
        const lead = raceLead(day(race("New York Senate Election Winner", [cand(name, amount, 0)])))!;
        expect(headlineLines(lead.headline).length, lead.headline).toBeLessThanOrEqual(2);
      }
    }
  });

  it("property: across many random races the headline and its card never disagree", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 300; n++) {
      const races = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => race(`State ${i} Governor Election Winner`,
        Array.from({ length: 2 + Math.floor(rnd() * 2) }, (_, j) => cand(`Candidate ${i}${j} Name`, rnd() < 0.5 ? 0 : Math.round(rnd() * 400_000), rnd() < 0.5 ? 0 : Math.round(rnd() * 400_000), rnd()))));
      const lead = raceLead(day(...races));
      if (!lead) { expect(races.every(r => r.candidates.every(c => c.mil.yes + c.mil.no === 0))).toBe(true); continue; }
      // The headline's figure is the candidate's own Yes (on) or No (against) money, and the card says the same.
      expect(lead.dollars).toBe(lead.side === "on" ? lead.candidate.mil.yes : lead.candidate.mil.no);
      expect(lead.headline).toContain(`${dollars(lead.dollars)} ${lead.side}`);
      expect(candidateMoney(lead.candidate)).toContain(`${dollars(lead.dollars)} ${lead.side}`);
      // And it is the largest single position on the page.
      const max = Math.max(...races.flatMap(r => r.candidates.flatMap(c => [c.mil.yes, c.mil.no])));
      expect(lead.dollars).toBe(max);
    }
  });
});
