/* Categories come from the exchange's own series first (Polymarket's event slug, Kalshi's series ticker), then names;
 * keyword luck ("Masters") never puts esports or tennis under Golf. Real titles from the board. */
import { describe, expect, it } from "vitest";
import { categoryOf } from "@/lib/brand/categories";
import { classify } from "@/lib/moves/classify";

const of = (title: string, extra: { event?: string; url?: string; venueCategory?: string } = {}) => {
  const c = classify(extra.venueCategory ?? "sports", [extra.event, title]);
  return categoryOf({ title, event: extra.event ?? null, venueCategory: extra.venueCategory ?? "sports", tab: c.tab, league: c.league, url: extra.url ?? null });
};

describe("esports and the Masters", () => {
  it("EPL Masters (Dota 2) is esports, by its series and by its name, never golf", () => {
    expect(of("Dota 2: HULIGANI vs Yellow Submarine – EPL Masters Playoffs")).toBe("esports");
    expect(of("HULIGANI vs Yellow Submarine", { url: "https://polymarket.com/event/dota2-huligani-ys-2026-11-03" })).toBe("esports");
    expect(of("Game 1 Winner", { url: "https://kalshi.com/markets/kxdota2game/dota-2-game/KXDOTA2GAME-26NOV03HULYS" })).toBe("esports");
    // A row already stored with the old classifier's league (golf) is still esports.
    expect(categoryOf({ title: "Dota 2: HULIGANI vs Yellow Submarine – EPL Masters Playoffs", tab: "sports", league: "golf", venueCategory: "sports" })).toBe("esports");
  });
  it("The Masters at Augusta is golf", () => {
    expect(of("Will Scottie Scheffler win the Masters?")).toBe("golf");
    expect(of("The Masters 2027 Winner")).toBe("golf");
    expect(of("Masters Tournament: Rory McIlroy to win?")).toBe("golf");
  });
  it("a Masters Cup or Masters 1000 is not golf", () => {
    expect(of("Will Jannik Sinner win the Masters Cup?")).not.toBe("golf");
    expect(of("Rolex Paris Masters: Sinner vs Alcaraz")).toBe("tennis");
    expect(of("CS2: Vitality vs FaZe – IEM Masters")).toBe("esports");
    expect(of("Valorant Masters Toronto: Sentinels vs Fnatic")).toBe("esports");
  });
});
