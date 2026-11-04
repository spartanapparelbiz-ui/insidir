/* The team registry (lib/teams): every logo it names is on disk at 128 and 256px (twice the 28–32px rows and the 96px
 * hero), the game comes from the URL's event slug (never a title), an unknown team is a monogram, and LOGOS=off removes
 * every team image at once. */
import { existsSync } from "node:fs";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { allTeams, gameOf, matchupFor } from "@/lib/teams";
import { discInk, monogram } from "@/lib/teams/mark";

describe("team registry", () => {
  afterEach(() => { delete process.env.LOGOS; });

  it("every logo it names exists at 128 and 256px, square, with transparency", async () => {
    let n = 0;
    for (const l of allTeams()) for (const t of l.teams) {
      if (!t.logo) continue;
      for (const s of [128, 256]) {
        const f = `public${t.logo}-${s}.webp`;
        expect(existsSync(f), f).toBe(true);
        if (n++ % 50 === 0) { const m = await sharp(f).metadata(); expect([m.width, m.height, m.hasAlpha], f).toEqual([s, s, true]); }
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it("each league has every NBA, NFL and NHL team with a logo", () => {
    const by = Object.fromEntries(allTeams().map(l => [l.league, l.teams]));
    for (const [lg, codes] of [["nba", ["atl", "bos", "bkn", "gsw", "lal", "phx", "sas"]], ["nfl", ["kc", "buf", "dal", "gb"]], ["nhl", ["chi", "fla", "sea", "cal"]]] as const) {
      for (const c of codes) expect(by[lg]!.find(t => t.abbr === c)?.logo, `${lg}:${c}`).toBeTruthy();
    }
  });

  it("reads the game from the market's URL, both teams in the slug's order", () => {
    expect(gameOf("https://polymarket.com/event/nba-phx-gsw-2026-11-02/nba-phx-gsw-2026-11-02-total-224pt5")).toEqual({ league: "nba", a: "phx", b: "gsw" });
    expect(gameOf("https://polymarket.com/event/texas-senate-election-winner")).toBeNull();
    expect(gameOf(null)).toBeNull();
    const m = matchupFor("https://polymarket.com/event/nba-phx-gsw-2026-11-02", "Suns vs. Warriors")!;
    expect(m.map(t => [t.abbr, t.short])).toEqual([["phx", "Suns"], ["gsw", "Warriors"]]);
    expect(m.every(t => t.logo)).toBe(true);
  });

  it("an unknown team is a clean monogram named from the title, never another team's logo", () => {
    const m = matchupFor("https://polymarket.com/event/nba-zzz-gsw-2026-11-02", "Zebras vs. Warriors")!;
    expect(m[0]).toMatchObject({ abbr: "zzz", name: "Zebras", logo: null });
    expect(monogram(m[0])).toBe("ZZZ");
    expect(discInk("#ffffff")).toBe("#3a3a40");
    expect(discInk("#c8102e")).toBe("#c8102e");
  });

  it("LOGOS=off removes every team image at once", () => {
    process.env.LOGOS = "off";
    expect(matchupFor("https://polymarket.com/event/nba-phx-gsw-2026-11-02", "Suns vs. Warriors")!.every(t => t.logo === null)).toBe(true);
    expect(allTeams().every(l => l.teams.every(t => t.logo === null))).toBe(true);
  });
});
