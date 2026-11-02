/* The /go quiz's answers (lib/go/answers.ts): the cookie read defensively, the US experience from the venue, the
 * stake line's dollars, the categories saved after paying, the words in the headlines, and the category match. */
import { describe, expect, it } from "vitest";
import { betOnFromTopics, GO_DAYS, matchesAnswers, readAnswers, stakeDollars, topicWords, usFromVenue, writeAnswers } from "@/lib/go/answers";

const NOW = Date.parse("2026-11-02T18:00:00Z");

describe("the /go answers", () => {
  it("round-trips the cookie, drops unknown values, and forgets after 7 days", () => {
    const a = { topics: ["nfl", "elections"] as const, venue: "kalshi" as const, stake: "25-100" as const, at: NOW };
    expect(readAnswers(writeAnswers({ ...a, topics: [...a.topics] }), NOW)).toEqual({ ...a, topics: ["nfl", "elections"] });
    expect(readAnswers(encodeURIComponent(JSON.stringify({ topics: ["nfl", "nope", "nfl"], venue: "x", stake: 9, at: NOW })), NOW)).toEqual({ topics: ["nfl"], venue: null, stake: null, at: NOW });
    expect(readAnswers(writeAnswers({ ...a, topics: ["nfl"], at: NOW - (GO_DAYS + 1) * 86_400_000 }), NOW)).toBeNull();
    expect(readAnswers("not json", NOW)).toBeNull();
    expect(readAnswers(writeAnswers({ ...a, topics: [], remind: false }), NOW)?.remind).toBe(false);
  });
  it("Kalshi or a sportsbook means the US experience", () => {
    expect(usFromVenue("kalshi")).toBe(true);
    expect(usFromVenue("sportsbook")).toBe(true);
    expect(usFromVenue("polymarket")).toBe(false);
    expect(usFromVenue("watch")).toBeNull();
  });
  it("stakes, categories and words", () => {
    expect([stakeDollars("lt25"), stakeDollars("25-100"), stakeDollars("100-500"), stakeDollars("500+"), stakeDollars(null)]).toEqual([10, 50, 250, 500, 50]);
    expect(betOnFromTopics(["nfl", "economy", "other"])).toEqual(["nfl", "other"]);
    expect(topicWords(["nfl", "elections"])).toBe("NFL and the midterms");
    expect(topicWords(["nba", "soccer", "elections"])).toBe("NBA, Soccer and the midterms");
    expect(topicWords(["other"])).toBe("every market");
  });
  it("matches bets to their picks; none picked matches everything", () => {
    const nfl = { tab: "sports", league: "NFL", category: "sports", title: "Rams vs. 49ers", event: null };
    const senate = { tab: "markets", league: null, category: "politics", title: "Which party wins the Senate?", event: null };
    const fed = { tab: "markets", league: null, category: "economics", title: "Fed cuts rates in December?", event: null };
    expect(matchesAnswers(nfl, { topics: ["nfl"] })).toBe(true);
    expect(matchesAnswers(senate, { topics: ["nfl"] })).toBe(false);
    expect(matchesAnswers(senate, { topics: ["elections"] })).toBe(true);
    expect(matchesAnswers(fed, { topics: ["economy"] })).toBe(true);
    expect(matchesAnswers(fed, { topics: [] })).toBe(true);
  });
});
