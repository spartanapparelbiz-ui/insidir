/* Which photo a move's thumbnail gets (lib/photos.ts subjectPhoto) and every tracker has one (trackerPhoto). */
import { describe, expect, it } from "vitest";
import { PHOTOS, subjectPhoto, trackerPhoto } from "@/lib/photos";
import { TRACKERS } from "@/lib/trackers";

describe("subject photos", () => {
  it("every tracker has its own photo", () => {
    for (const t of TRACKERS) expect(trackerPhoto(t.slug), t.slug).not.toBe("home-markets");
    expect(Object.keys(PHOTOS)).toHaveLength(36);
  });

  it("a league gets its league's photo; politics, world, the Fed, tech, culture and crypto their topic's; SEC filings CEO Buys or Big Funds", () => {
    expect(subjectPhoto({ tab: "sports", leagueLabel: "NBA" })).toBe("nba");
    expect(subjectPhoto({ tab: "sports", leagueLabel: "Premier League" })).toBe("premier-league");
    expect(subjectPhoto({ tab: "sports", leagueLabel: "Counter-Strike" })).toBe("esports");
    expect(subjectPhoto({ tab: "sports", league: "nfl" })).toBe("nfl");
    expect(subjectPhoto({ tab: "sports" })).toBe("home-sports");
    expect(subjectPhoto({ tab: "markets", category: "politics" })).toBe("elections-2026");
    expect(subjectPhoto({ tab: "markets", category: "geopolitics" })).toBe("geopolitics");
    expect(subjectPhoto({ tab: "markets", category: "economy", text: "Fed cuts rates in December?" })).toBe("fed-and-rates");
    expect(subjectPhoto({ tab: "markets", category: "tech" })).toBe("tech-and-ai");
    expect(subjectPhoto({ tab: "markets", category: "culture" })).toBe("culture");
    expect(subjectPhoto({ tab: "crypto", category: "crypto" })).toBe("crypto-prices");
    expect(subjectPhoto({ tab: "stocks", source: "sec", detailKind: "insider" })).toBe("ceo-buys");
    expect(subjectPhoto({ tab: "stocks", source: "sec", detailKind: "fund" })).toBe("big-funds");
    expect(subjectPhoto({ tab: "markets", category: "mentions" })).toBe("home-markets");
  });
});
