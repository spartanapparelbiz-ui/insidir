/* Every picture is about its subject: each tracker draws its own (never the generic fallback), every subject has a
 * drawing, and a card's thumbnail follows its league, topic or filing. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ART_SUBJECTS, SubjectArt } from "@/components/SubjectArt";
import { PHOTOS, SLOT_SUBJECT, subjectPhoto, trackerPhoto } from "@/lib/photos";
import { TRACKERS } from "@/lib/trackers";

describe("subject art", () => {
  it("every tracker has its own subject, and it is drawn", () => {
    for (const t of TRACKERS) {
      const s = trackerPhoto(t.slug);
      expect(s, t.slug).not.toBe("home-markets");
      expect(ART_SUBJECTS, t.slug).toContain(s);
    }
    expect(trackerPhoto("nfl-big-money")).toBe("nfl");
    expect(trackerPhoto("biggest-bets")).toBe("biggest-bets");
  });

  it("every subject and every photo slot has a drawing with real lines in it", () => {
    for (const s of [...Object.keys(PHOTOS), "home"]) expect(ART_SUBJECTS).toContain(s);
    for (const s of Object.values(SLOT_SUBJECT)) expect(ART_SUBJECTS).toContain(s);
    for (const s of ART_SUBJECTS) {
      const svg = renderToStaticMarkup(createElement(SubjectArt, { subject: s }));
      expect(svg, s).toMatch(/<(path|line|rect|circle|ellipse|polygon)\b/);
      expect(svg, s).toContain('aria-hidden="true"');
    }
  });

  it("a card's thumbnail follows its league, topic or filing", () => {
    expect(subjectPhoto({ tab: "sports", leagueLabel: "NBA" })).toBe("nba");
    expect(subjectPhoto({ tab: "sports", leagueLabel: "Premier League" })).toBe("premier-league");
    expect(subjectPhoto({ tab: "markets", text: "Fed rate cut in December?" })).toBe("fed-and-rates");
    expect(subjectPhoto({ tab: "markets", text: "Who will win the 2028 presidential election?" })).toBe("elections-2026");
    expect(subjectPhoto({ tab: "markets", text: "Russia x Ukraine ceasefire by June?" })).toBe("geopolitics");
    expect(subjectPhoto({ tab: "markets", text: "Bitcoin above $120K on Friday?" })).toBe("crypto-prices");
    expect(subjectPhoto({ tab: "stocks", source: "sec", detailKind: "insider" })).toBe("ceo-buys");
    expect(subjectPhoto({ tab: "stocks", source: "sec", detailKind: "fund" })).toBe("big-funds");
  });
});
