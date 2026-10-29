/* The polish rules that can be checked without a browser: the home order, results as plain text, the cover's numbers
 * and curve, and no stylesheet heavier than 600. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverFigure, curvePath } from "@/components/trackers/TrackerCover";
import { FEATURED, homeOrder, recordResult, returnPct, trackerBySlug, type TrackerRecord } from "@/lib/trackers";
import { cumulative } from "@/lib/trackers-store";

const rec = (won: number, lost: number, net: number, staked?: number): TrackerRecord => ({ won, lost, oddsPct: 50, net, staked });

describe("polish", () => {
  it("home lists lead with stocks, then prediction markets, then sports, keeping each group's order", () => {
    const rows = ["nba-big-money", "biggest-bets", "fed-and-rates", "ceo-buys", "nfl-big-money", "geopolitics"].map(s => ({ t: trackerBySlug(s)! }));
    expect(homeOrder(rows).map(r => r.t.slug)).toEqual(["ceo-buys", "fed-and-rates", "geopolitics", "biggest-bets", "nba-big-money", "nfl-big-money"]);
    expect(FEATURED.map(s => trackerBySlug(s)!.group)).toEqual(["Stocks", "Topics", "Styles", "Leagues"]);
  });

  it("a record is plain text: the net in green or red, the win rate in grey; New without one", () => {
    expect(recordResult(rec(63, 37, 1_200_000))).toEqual({ amount: "+$1.2M", tone: "won", status: "Won 63%" });
    expect(recordResult(rec(9, 11, -40_000))).toEqual({ amount: "−$40K", tone: "lost", status: "Won 45%" });
    expect(recordResult(rec(5, 2, 9e6))).toEqual({ amount: null, tone: "none", status: "New" });
    expect(recordResult(null)).toEqual({ amount: null, tone: "none", status: "New" });
  });

  it("the cover's return is the net on the money in; filings show money bought; New otherwise", () => {
    expect(returnPct(rec(30, 10, 12_400, 100_000))).toBe("+12.4%");
    expect(returnPct(rec(30, 10, -5_000, 100_000))).toBe("−5.0%");
    expect(returnPct(rec(30, 10, 5_000))).toBeNull();
    const whales = trackerBySlug("biggest-bets")!, ceo = trackerBySlug("ceo-buys")!;
    expect(coverFigure(whales, { record: rec(30, 10, 12_400, 100_000), curve: [], tracked30d: 0 })).toEqual({ figure: "+12.4%", label: "return, all settled bets" });
    expect(coverFigure(whales, { record: rec(3, 1, 9, 10), curve: [], tracked30d: 0 }).figure).toBe("New");
    expect(coverFigure(ceo, { record: null, curve: [], tracked30d: 2_400_000 })).toEqual({ figure: "$2.4M", label: "bought in 30 days" });
    expect(coverFigure(ceo, null).figure).toBe("New");
  });

  it("the curve is cumulative by week, oldest first, and empty when nothing happened", () => {
    expect(cumulative([{ week: 0, v: 5 }, { week: 2, v: 10 }, { week: 30, v: 99 }], 4)).toEqual([0, 10, 10, 15]);
    expect(cumulative([], 4)).toEqual([]);
    expect(curvePath([1])).toBeNull();
    const d = curvePath([0, 10, 5], 400, 300)!;
    expect(d.startsWith("M0.0,258.0")).toBe(true);
    expect(d).toContain("L200.0,114.0");
    expect(d.endsWith("L400.0,186.0")).toBe(true);
  });

  it("no stylesheet sets a weight above 600", () => {
    const files = [...readdirSync("app").filter(f => f.endsWith(".css")).map(f => join("app", f)), "components/app/terminal.css"];
    for (const f of files) {
      const css = readFileSync(f, "utf8");
      expect(css, f).not.toMatch(/font-weight:\s*(700|800|900|bold)/);
      expect(css, f).not.toMatch(/font:\s*(700|800|900)\s/);
    }
  });
});
