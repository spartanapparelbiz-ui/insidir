import { describe, expect, it } from "vitest";
import { parseLink, polymarketUrl, targetPath } from "@/lib/link";

describe("parseLink", () => {
  const ev = (slug: string, market: string | null = null) => ({ kind: "event", slug, market });
  it.each([
    ["https://polymarket.com/event/fed-decision-in-december", ev("fed-decision-in-december")],
    ["https://www.polymarket.com/event/fed-decision-in-december", ev("fed-decision-in-december")],
    ["polymarket.com/event/fed-decision-in-december", ev("fed-decision-in-december")],
    ["www.polymarket.com/event/fed-decision-in-december/", ev("fed-decision-in-december")],
    ["http://polymarket.com/event/Fed-Decision-In-December", ev("fed-decision-in-december")],
    ["https://polymarket.com/event/fed-decision-in-december/fed-decreases-interest-rates-by-25-bps", ev("fed-decision-in-december", "fed-decreases-interest-rates-by-25-bps")],
    ["https://polymarket.com/es/event/fed-decision-in-december", ev("fed-decision-in-december")],
    ["https://polymarket.com/pt-br/event/fed-decision-in-december/x-y", ev("fed-decision-in-december", "x-y")],
    ["https://polymarket.com/event/fed-decision-in-december?tid=1730000000&r=abc#comments", ev("fed-decision-in-december")],
    ["https://insidir.com/event/fed-decision-in-december", ev("fed-decision-in-december")],
    ["  fed-decision-in-december  ", ev("fed-decision-in-december")],
    ["https://polymarket.com/sports/nba/games/week/1/nba-lal-bos-2026-10-24", ev("nba-lal-bos-2026-10-24")],
  ])("%s", (input, want) => {
    expect(parseLink(input)).toEqual(want);
  });

  it("reads /market/ links", () => {
    expect(parseLink("https://polymarket.com/market/will-it-rain")).toEqual({ kind: "market", slug: "will-it-rain" });
    expect(parseLink("https://polymarket.com/fr/market/will-it-rain?x=1")).toEqual({ kind: "market", slug: "will-it-rain" });
  });

  it("refuses what isn't a market link", () => {
    for (const bad of ["", "   ", "https://polymarket.com/", "https://polymarket.com/profile/0xabc", "https://polymarket.com/event/", "javascript:alert(1)",
      "ftp://polymarket.com/event/x", "not a link at all", "https://polymarket.com/event/%E0%A4%A"]) {
      expect(parseLink(bad), bad).toBeNull();
    }
  });

  it("mirrors Polymarket's paths both ways", () => {
    const t = parseLink("https://polymarket.com/event/a-b/c-d");
    expect(t && targetPath(t)).toBe("/event/a-b/c-d");
    expect(t && polymarketUrl(t)).toBe("https://polymarket.com/event/a-b/c-d");
    expect(targetPath({ kind: "market", slug: "m" })).toBe("/market/m");
  });
});
