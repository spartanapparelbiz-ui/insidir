/* The polish rules that can be checked without a browser: the home order, results as plain text, the cover's numbers
 * and the curve data, and no stylesheet heavier than 600. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURED, homeOrder, recordResult, trackerBySlug, type TrackerRecord } from "@/lib/trackers";
import { cumulative } from "@/lib/trackers-store";

const rec = (won: number, lost: number, net: number, staked?: number): TrackerRecord => ({ won, lost, oddsPct: 50, net, staked });

describe("polish", () => {
  it("home lists lead with stocks, then prediction markets, then sports, keeping each group's order", () => {
    const rows = ["nba-big-money", "biggest-bets", "fed-and-rates", "ceo-buys", "nfl-big-money", "geopolitics"].map(s => ({ t: trackerBySlug(s)! }));
    expect(homeOrder(rows).map(r => r.t.slug)).toEqual(["ceo-buys", "fed-and-rates", "geopolitics", "biggest-bets", "nba-big-money", "nfl-big-money"]);
    expect(FEATURED.map(s => trackerBySlug(s)!.group)).toEqual(["Stocks", "Topics", "Styles", "Leagues"]);
  });

  it("a record is plain text: the net in green or red, the win rate in grey; under 30 settled, the record being built", () => {
    expect(recordResult(rec(63, 37, 1_200_000))).toEqual({ amount: "+$1.2M", tone: "won", status: "Won 63%" });
    expect(recordResult(rec(18, 22, -40_000))).toEqual({ amount: "−$40K", tone: "lost", status: "Won 45%" });
    expect(recordResult(rec(5, 2, 9e6))).toEqual({ amount: null, tone: "none", status: "Building record · 7 of 30" });
    expect(recordResult(null)).toEqual({ amount: null, tone: "none", status: "Building record · 0 of 30" });
  });

  it("the curve is cumulative by week, oldest first, and empty when nothing happened", () => {
    expect(cumulative([{ week: 0, v: 5 }, { week: 2, v: 10 }, { week: 30, v: 99 }], 4)).toEqual([0, 10, 10, 15]);
    expect(cumulative([], 4)).toEqual([]);
  });

  it("no stylesheet sets a weight above 600 (the brand's wordmark is the hero spec's 800, nothing else)", () => {
    const brand = readFileSync("app/brand.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(brand.match(/font-weight:\s*(700|800|900|bold)/g)).toEqual(["font-weight: 800"]);
    expect(brand).toMatch(/\.b-logo \{[^}]*font-weight: 800/);
    const files = [...readdirSync("app").filter(f => f.endsWith(".css") && f !== "brand.css").map(f => join("app", f))];
    for (const f of files) {
      const css = readFileSync(f, "utf8");
      expect(css, f).not.toMatch(/font-weight:\s*(700|800|900|bold)/);
      expect(css, f).not.toMatch(/font:\s*(700|800|900)\s/);
    }
  });
});
