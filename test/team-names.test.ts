/* Tonight's lists: full team names (lib/sports/team-names.ts), "Live" once a game is under way, and Kalshi's scheduled
 * game start from its event milestone (lib/exchanges/kalshi.ts readMilestoneStart). */
import { describe, expect, it } from "vitest";
import { readMilestoneStart } from "@/lib/exchanges/kalshi";
import { readGammaMarket } from "@/lib/exchanges/polymarket";
import { fullTeamNames, isLive, LIVE_MS } from "@/lib/sports/team-names";

describe("full team names", () => {
  it("Kalshi's shared-city initials and plain cities become nicknames", () => {
    expect(fullTeamNames("Los Angeles R at Denver", "NFL")).toBe("Rams at Broncos");
    expect(fullTeamNames("Kansas City at Denver Winner?", "NFL")).toBe("Chiefs at Broncos Winner?");
    expect(fullTeamNames("New York G vs New York J", "NFL")).toBe("Giants vs Jets");
    expect(fullTeamNames("Los Angeles C at Las Vegas", "NFL")).toBe("Chargers at Raiders");
    expect(fullTeamNames("Chicago C at Chicago W", "MLB")).toBe("Cubs at White Sox");
    expect(fullTeamNames("St. Louis at Kansas City", "MLB")).toBe("Cardinals at Royals");
    expect(fullTeamNames("Los Angeles L vs Golden State", "NBA")).toBe("Lakers vs Warriors");
    expect(fullTeamNames("New York R at Los Angeles", "NHL")).toBe("Rangers at Kings");
  });
  it("names already full stay as they are; city + nickname becomes the nickname", () => {
    expect(fullTeamNames("Chiefs vs. Broncos", "NFL")).toBe("Chiefs vs. Broncos");
    expect(fullTeamNames("Kansas City Chiefs vs. Denver Broncos", "NFL")).toBe("Chiefs vs. Broncos");
    expect(fullTeamNames("Will the Los Angeles Rams win?", "NFL")).toBe("Will the Rams win?");
  });
  it("other leagues and unknown leagues are left alone", () => {
    expect(fullTeamNames("Los Angeles R at Denver", null)).toBe("Los Angeles R at Denver");
    expect(fullTeamNames("Texas at Michigan", "College football")).toBe("Texas at Michigan");
  });
});

describe("Live and the scheduled start", () => {
  const T = Date.UTC(2026, 10, 2, 21, 25); // 4:25 PM ET
  it("a game is Live from its start for LIVE_MS; before it, a time", () => {
    expect(isLive(T, T - 60_000)).toBe(false);
    expect(isLive(T, T)).toBe(true);
    expect(isLive(T, T + LIVE_MS - 1)).toBe(true);
    expect(isLive(T, T + LIVE_MS)).toBe(false);
    expect(isLive(null, T)).toBe(false);
  });
  it("Kalshi: the earliest milestone start_date for the event; none → null", () => {
    expect(readMilestoneStart({ milestones: [{ id: "m1", type: "football_game", start_date: "2026-11-02T21:25:00Z", related_event_tickers: ["KXNFLGAME-26NOV02KCDEN"] }] })).toBe(T);
    expect(readMilestoneStart({ milestones: [{ start_date: "2026-11-02T22:00:00Z" }, { start_date: "2026-11-02T21:25:00Z" }] })).toBe(T);
    expect(readMilestoneStart({ milestones: [] })).toBeNull();
    expect(readMilestoneStart(null)).toBeNull();
  });
});

describe("Polymarket's game start", () => {
  const base = { conditionId: "0x1", question: "Chiefs vs. Broncos", outcomes: '["Chiefs","Broncos"]', clobTokenIds: '["1","2"]' };
  it("gameStartTime first; for a sports market without it, startDate; never startDate on other markets (that's when it was listed)", () => {
    expect(readGammaMarket({ ...base, sportsMarketType: "moneyline", gameStartTime: "2026-11-02 21:25:00+00", startDate: "2026-10-20T00:00:00Z" }, null)!.startTime).toBe(Date.UTC(2026, 10, 2, 21, 25));
    expect(readGammaMarket({ ...base, sportsMarketType: "moneyline", startDate: "2026-11-02T21:25:00Z" }, null)!.startTime).toBe(Date.UTC(2026, 10, 2, 21, 25));
    expect(readGammaMarket({ ...base, question: "Fed cuts in December?", outcomes: '["Yes","No"]', startDate: "2026-10-20T00:00:00Z" }, null)!.startTime).toBeNull();
  });
});
