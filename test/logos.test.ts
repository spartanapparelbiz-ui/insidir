/* Real logos: a sports position shows its team's (by nickname or city, within its league) or its league's, a filing
 * its company's, a market the company or coin it names; every tracker logo is a file that exists; and every logo
 * file parses as an image with something drawn in it. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandOf, moveLogo, stockLogo, teamOf, tickerOfName } from "@/lib/logos";
import { TRACKER_LOGOS, trackerLogo } from "@/lib/tracker-logos";
import { TRACKERS } from "@/lib/trackers";

const pub = (p: string) => `public${p}`;

describe("logos", () => {
  it("finds the team by nickname or city, only within its league", () => {
    expect(teamOf("nfl", "Chiefs")).toBe("KC");
    expect(teamOf("nfl", "Kansas City Chiefs")).toBe("KC");
    expect(teamOf("mlb", "Kansas City")).toBe("KAN");
    expect(teamOf("nba", "Lakers")).toBe("LAL");
    expect(teamOf("nba", "Golden State Warriors")).toBe("GSW");
    expect(teamOf("nhl", "Maple Leafs")).toBe("TOR");
    expect(teamOf("mlb", "Giants")).toBe("SF");
    expect(teamOf("nfl", "Giants")).toBe("NYG");
    expect(teamOf("nba", "Chiefs")).toBeNull();
  });

  it("a position's logo: its team, else its league; a filing's company; a market's company or coin", () => {
    expect(moveLogo({ tab: "sports", source: "polymarket", league: "NFL", leagueLabel: "NFL", outcome: "Chiefs", marketTitle: "Chiefs vs. Bills" })).toBe("/logos/teams/nfl/KC.svg");
    expect(moveLogo({ tab: "sports", source: "kalshi", league: "NBA", leagueLabel: "NBA", outcome: "Yes", marketTitle: "Will the Lakers win?" })).toBe("/logos/teams/nba/LAL.svg");
    expect(moveLogo({ tab: "sports", source: "polymarket", league: "soccer", leagueLabel: "Premier League", outcome: "Arsenal" })).toBe("/logos/leagues/epl.webp");
    expect(moveLogo({ tab: "sports", source: "polymarket", league: "other", leagueLabel: "Tennis", outcome: "Sinner" })).toBeNull();
    expect(moveLogo({ tab: "stocks", source: "sec", ticker: "NVDA" })).toBe("/logos/stocks/NVDA.webp");
    expect(moveLogo({ tab: "stocks", source: "sec", ticker: null, company: "MICROSOFT CORP" })).toBe("/logos/stocks/MSFT.webp");
    expect(moveLogo({ tab: "markets", source: "polymarket", marketTitle: "Bitcoin above $120K on Friday?" })).toBe("/logos/brands/bitcoin.svg");
    expect(moveLogo({ tab: "markets", source: "polymarket", marketTitle: "Will Nvidia be the largest company by December 31?" })).toBe("/logos/stocks/NVDA.webp");
    expect(moveLogo({ tab: "markets", source: "kalshi", marketTitle: "Fed rate cut in December?" })).toBeNull();
    expect(tickerOfName("Alphabet Inc.")).toBe("GOOG");
    expect(stockLogo("GOOGL")).toBe("/logos/stocks/GOOG.webp");
    expect(stockLogo("ZZZZZZ")).toBeNull();
    expect(brandOf("Will Ethereum hit $5K?")).toBe("/logos/brands/ethereum.svg");
  });

  it("every tracker logo exists, and every league tracker has one", () => {
    for (const p of Object.values(TRACKER_LOGOS)) expect(existsSync(pub(p)), p).toBe(true);
    for (const t of TRACKERS.filter(t => ["nfl-big-money", "nba-big-money", "mlb-big-money", "nhl-big-money", "premier-league", "champions-league", "la-liga", "serie-a", "ufc"].includes(t.slug)))
      expect(trackerLogo(t.slug), t.slug).not.toBeNull();
  });

  it("every team and league SVG has shapes in it and no editor-only attributes", () => {
    for (const dir of ["leagues", "teams/nba", "teams/nfl", "teams/mlb", "teams/nhl", "brands"]) {
      const files = readdirSync(pub(`/logos/${dir}`)).filter(f => f.endsWith(".svg"));
      for (const f of files) {
        const svg = readFileSync(pub(`/logos/${dir}/${f}`), "utf8");
        expect(svg, `${dir}/${f}`).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        expect(svg, `${dir}/${f}`).toMatch(/<(path|polygon|circle|rect|ellipse)\b/);
        expect(svg, `${dir}/${f}`).not.toMatch(/\s(inkscape|sodipodi):/);
      }
    }
    expect(readdirSync(pub("/logos/teams/nba")).length).toBe(30);
    expect(readdirSync(pub("/logos/teams/nfl")).length).toBe(32);
    expect(readdirSync(pub("/logos/teams/mlb")).length).toBe(30);
    expect(readdirSync(pub("/logos/teams/nhl")).length).toBe(32);
  });
});
