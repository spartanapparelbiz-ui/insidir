/* Market twins on real markets recorded from both venues (scripts/twin-fixtures.ts, test/fixtures/twins/): an NBA
 * moneyline, its spreads and totals, the Fed's December 2026 decision, the Florida governor race. A twin needs the same
 * event, outcome, line, resolution source and close date; spreads and totals match exactly. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findTwins, twinCheck } from "@/lib/twins/check";
import type { VMarket } from "@/lib/types";

const load = (n: string) => JSON.parse(readFileSync(`test/fixtures/twins/${n}.json`, "utf8")) as { kalshi: VMarket[]; polymarket: VMarket[] };
const by = (list: VMarket[], title: string | RegExp, yes?: string) => list.find(m => (typeof title === "string" ? m.title === title : title.test(m.title)) && (yes === undefined || m.yesLabel === yes))!;

describe("market twins on today's real pairs", () => {
  const ml = load("nba-moneyline"), sp = load("nba-spread"), tot = load("nba-total"), fed = load("fed-december"), fl = load("florida-governor");

  it("NBA moneyline: Hawks (Polymarket) is Atlanta wins (Kalshi), not Washington", () => {
    const hawks = by(ml.polymarket, "Hawks vs. Wizards", "Hawks");
    expect(twinCheck(hawks, by(ml.kalshi, "Atlanta wins")).verdict).toBe("candidate");
    expect(twinCheck(hawks, by(ml.kalshi, "Washington wins")).verdict).toBe("rejected");
  });

  it("NBA spreads match exactly: Hawks −4.5 is 'Atlanta wins by over 4.5', never 5.5", () => {
    const m45 = by(sp.polymarket, "Spread: Hawks (-4.5)");
    const k45 = by(sp.kalshi, /^Atlanta wins by over 4\.5 points/), k55 = by(sp.kalshi, /^Atlanta wins by over 5\.5 points/);
    expect(k45 && k55).toBeTruthy();
    expect(twinCheck(m45, k45).verdict).toBe("candidate");
    const off = twinCheck(m45, k55);
    expect(off.verdict).toBe("rejected");
    expect(off.checks.line).toBe(false);
    // The other team's spread is a different outcome.
    expect(twinCheck(by(sp.polymarket, "Spread: Wizards (-4.5)"), k45).verdict).toBe("rejected");
  });

  it("NBA totals match exactly and by side: O/U 230.5 Over is 'Over 230.5 points scored'", () => {
    const o = by(tot.polymarket, "Hawks vs. Wizards: O/U 230.5");
    expect(twinCheck(o, by(tot.kalshi, /Over 230\.5 points scored/)).verdict).toBe("candidate");
    expect(twinCheck(o, by(tot.kalshi, /Over 232\.5 points scored/)).verdict).toBe("rejected");
  });

  it("every twin found in the NBA event has the same line and team", () => {
    const twins = findTwins(sp.polymarket, sp.kalshi);
    expect(twins.length).toBeGreaterThan(5);
    for (const t of twins) {
      const line = Number(/\(([+-]?\d+(?:\.\d+)?)\)/.exec(t.poly.title)![1]);
      expect(t.kalshi.title).toContain(`over ${Math.abs(line)} points`);
      expect(t.kalshi.title.startsWith("Atlanta") === t.poly.title.includes("Hawks")).toBe(true);
    }
  });

  it("Fed December 2026: 25 bps cut ↔ Cut 25bps and no change ↔ maintains are candidates; '>25bps' vs '50+' goes to a person", () => {
    expect(twinCheck(by(fed.polymarket, /decrease interest rates by 25 bps/), by(fed.kalshi, /Cut rates by 25bps/)).verdict).toBe("candidate");
    expect(twinCheck(by(fed.polymarket, /no change/i), by(fed.kalshi, /Hike rates by 0bps/)).verdict).toBe("candidate");
    expect(twinCheck(by(fed.polymarket, /decrease interest rates by 50\+ bps/), by(fed.kalshi, /Cut rates by >25bps/)).verdict).toBe("review");
    expect(twinCheck(by(fed.polymarket, /decrease interest rates by 25 bps/), by(fed.kalshi, /Hike rates by 25bps/)).verdict).toBe("rejected");
  });

  it("Florida governor: the same party outcome, but Kalshi closes at certification months later, so a person decides", () => {
    const r = twinCheck(by(fl.polymarket, /Democrats win the Florida governor/), by(fl.kalshi, /Democratic party win the governorship in Florida/));
    expect(r.verdict).toBe("review");
    expect(r.checks).toMatchObject({ event: true, outcome: true, line: true, close: false });
    expect(twinCheck(by(fl.polymarket, /Democrats win the Florida governor/), by(fl.kalshi, /Republican party/)).verdict).toBe("rejected");
  });

  it("halves, quarters and team totals are their own lines: never a full-game total", () => {
    const base = by(tot.polymarket, "Hawks vs. Wizards: O/U 230.5"), k = by(tot.kalshi, /Over 230\.5 points scored/);
    const as = (m: VMarket, title: string): VMarket => ({ ...m, title });
    expect(twinCheck(as(base, "Hawks vs. Wizards: 1H O/U 118.5"), as(k, "1st Half: Over 118.5 points scored")).verdict).toBe("candidate");
    expect(twinCheck(as(base, "Hawks vs. Wizards: 1H O/U 118.5"), as(k, "2nd Half: Over 118.5 points scored")).verdict).toBe("rejected");
    expect(twinCheck(as(base, "Hawks vs. Wizards: 1H O/U 118.5"), as(k, "Full Game: Over 118.5 points scored")).verdict).toBe("rejected");
    expect(twinCheck(as(base, "Hawks vs. Wizards: O/U 119.5"), as(k, "Atlanta over 119.5 points scored")).verdict).toBe("rejected");
  });

  it("race combinations, margins and seat counts are never a race winner", () => {
    const k = by(fl.kalshi, /Democratic party win the governorship in Florida/), p = by(fl.polymarket, /Democrats win the Florida governor/);
    for (const t of ["Will Democrats win the Florida governor race by 5%-10%?", "Will Democrats win the Florida Governor and Senate elections?", "Will Democrats win Miami-Dade County in the Florida governor race?", "Will Democrats win exactly 9 House seats in Florida?"]) {
      expect(twinCheck({ ...p, title: t }, k).verdict, t).toBe("rejected");
    }
  });
});

