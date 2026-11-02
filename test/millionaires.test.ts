/* The millionaire watchlist and bets (lib/millionaires) and the category map (lib/brand/categories.ts), pure parts:
 * tiers from all-time profit, the leaderboard read keeping only wallet and profit, cursor paging, the moves poller
 * counting watchlist wallets' bets from $5K while everyone else stays at the moves threshold, and every market
 * landing in exactly one category with a photo. */
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_SLUGS, categoryOf, categoryPhoto, categoryPhotos, isCategory } from "@/lib/brand/categories";
import { FALLBACK, PHOTOS, SLOT } from "@/lib/brand/images";
import { betsFrom } from "@/lib/millionaires/bets";
import { leaningSide, type MarketMoney } from "@/lib/millionaires/queries";
import { readBoardPnl, readTop, shortWallet, tierOf } from "@/lib/millionaires/watchlist";
import { BET_MIN, MovesPoller } from "@/lib/moves/poll";
import { leaderboardCursor, readLeaderboard, readUserPnl } from "@/lib/moves/sources";
import type { Move } from "@/lib/moves/types";
import { existsSync, statSync } from "node:fs";

const W = (c: string) => "0x" + c.repeat(40).slice(0, 40);

describe("watchlist", () => {
  it("tiers: $1M+ Millionaire, $100K+ Pro, below that not watched", () => {
    expect(tierOf(22_053_933)).toBe("millionaire");
    expect(tierOf(1_000_000)).toBe("millionaire");
    expect(tierOf(999_999)).toBe("pro");
    expect(tierOf(100_000)).toBe("pro");
    expect(tierOf(99_999)).toBeNull();
  });

  it("reads wallet and profit only from a v2 leaderboard page: never the username, picture or rank", () => {
    const raw = { data: [{ rank: 1, user_id: W("A"), pnl: 22053933.752321, volume: 4, user_name: "Theo4", profile_image: "x", x_username: "t" }, { rank: 2, user_id: "nope", pnl: 1 }], pagination: { has_more: true, next_cursor: "c2" } };
    const rows = readBoardPnl(raw);
    expect(rows).toEqual([{ wallet: W("a"), pnl: 22053933.75 }]);
    expect(Object.keys(rows[0]!)).toEqual(["wallet", "pnl"]);
    expect(leaderboardCursor(raw)).toBe("c2");
    expect(leaderboardCursor({ data: [], pagination: { has_more: false, next_cursor: "x" } })).toBeNull();
  });

  it("pages by cursor to the top 1,000, each wallet once", async () => {
    const calls: Array<string | null | undefined> = [];
    const poly = {
      getLeaderboardPage: async (o: { cursor?: string | null; limit?: number }) => {
        calls.push(o.cursor);
        const page = o.cursor ? Number(o.cursor) : 0;
        const data = Array.from({ length: o.limit! }, (_, i) => ({ user_id: "0x" + (page * 100 + i).toString(16).padStart(40, "0"), pnl: 3e6 - (page * 100 + i) * 2500 }));
        return { data, pagination: { has_more: page < 12, next_cursor: String(page + 1) } };
      },
    };
    const top = await readTop(poly);
    expect(top).toHaveLength(1000);
    expect(calls).toEqual([null, "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(top.filter(t => t.tier === "millionaire")).toHaveLength(801);
    expect(new Set(top.map(t => t.wallet)).size).toBe(1000);
  });

  it("shortens wallets for display", () => {
    expect(shortWallet("0x56687bf447db6ffa42ffe2204a05edaa20f55839")).toBe("0x5668…5839");
  });

  it("the existing leaderboard readers read v2 too (v1 was retired)", () => {
    expect(readUserPnl({ data: { user_id: W("b"), pnl: 12.345 } }, W("b"))).toBe(12.35);
    expect(readUserPnl({ data: { user_id: W("c"), pnl: 12 } }, W("b"))).toBeNull();
    expect(readUserPnl([{ proxyWallet: W("b"), pnl: 5 }], W("b"))).toBe(5);
    expect(readLeaderboard({ data: [{ user_id: W("d"), user_name: "abc", profile_image: "" }] })[0]).toMatchObject({ wallet: W("d"), name: "abc" });
  });
});

const fill = (o: Partial<{ wallet: string; usd: number; at: number; market: string; id: string }>) => ({
  transactionHash: o.id ?? `0x${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`, proxyWallet: o.wallet ?? W("1"), side: "BUY", conditionId: o.market ?? "0xm1",
  size: (o.usd ?? 6000) / 0.5, price: 0.5, timestamp: Math.floor((o.at ?? Date.now()) / 1000), title: "NFL: Will the Chiefs win?", eventSlug: "nfl-kc-buf", outcome: "Yes", outcomeIndex: 0,
});

describe("millionaire bets from the moves poller", () => {
  it("watched wallets count from $5K; everyone else stays at the moves threshold", async () => {
    const now = Date.now();
    const millionaire = W("m"), pro = W("p"), stranger = W("s");
    const fills = [fill({ wallet: millionaire, usd: 6000, at: now - 60_000 }), fill({ wallet: pro, usd: 4000, at: now - 60_000, market: "0xm2" }), fill({ wallet: stranger, usd: 6000, at: now - 60_000, market: "0xm3" })];
    const lookups: string[][] = [];
    const poller = new MovesPoller({
      polyTradesPage: async page => (page === 0 ? fills : []), polyWalletTrades: async () => [], kalshiTradesPage: async () => ({ trades: [] }),
      watched: w => w === millionaire || w === pro,
    });
    const moves = await poller.pollPolymarket(now, async ids => { lookups.push([...ids]); return new Map(); });
    expect(moves).toEqual([]); // nobody reached the $10K moves threshold
    expect(lookups[0]).toContain("0xm1"); // the watched bet's market is looked up for its category
    const watched = poller.lastWatchedBets();
    expect(watched.map(m => m.wallet)).toEqual([millionaire]); // the Pro wallet's $4K is under BET_MIN
    expect(watched[0]!.amount).toBeGreaterThanOrEqual(BET_MIN);
    const tiers = new Map([[millionaire, "millionaire" as const], [pro, "pro" as const]]);
    const rows = betsFrom(watched, w => tiers.get(w) ?? null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wallet: millionaire, tier: "millionaire", source: "polymarket", marketId: "0xm1", outcomeSide: "yes", amount: 6000, price: 0.5, category: "football" });
  });

  it("drops Kalshi (anonymous), unwatched wallets and bets under $5K", () => {
    const base = { id: "x", source: "polymarket", marketId: "m", eventTitle: "E", marketTitle: "Will it rain in NYC?", outcome: "Yes", outcomeSide: "yes", amount: 5000, avgPrice: 0.4,
      wallet: W("a"), walletName: null, at: 1, lastAt: 1, fills: 1, tab: "markets", league: null, category: "weather", url: null, result: null, settledAt: null } as Move;
    const tier = (w: string) => (w === W("a") ? "pro" as const : null);
    expect(betsFrom([base], tier)[0]).toMatchObject({ tier: "pro", category: "weather" });
    expect(betsFrom([{ ...base, amount: 4999 }], tier)).toEqual([]);
    expect(betsFrom([{ ...base, wallet: W("b") }], tier)).toEqual([]);
    expect(betsFrom([{ ...base, source: "kalshi", wallet: null }], tier)).toEqual([]);
  });

  it("a split needs 3 wallets", () => {
    const t = (yw: number, nw: number): MarketMoney["millionaire"] => ({ yes: { dollars: 100, wallets: yw }, no: { dollars: 50, wallets: nw } });
    expect(leaningSide(t(1, 1))).toBeNull();
    expect(leaningSide(t(2, 1))).toBe("yes");
  });
});

describe("category map", () => {
  const cases: Array<[Parameters<typeof categoryOf>[0], string]> = [
    [{ title: "Will the Chiefs beat the Bills?", event: "NFL: Chiefs vs Bills", tab: "sports", league: "NFL" }, "football"],
    [{ title: "Ohio State vs Michigan", tab: "sports", league: "college" }, "football"],
    [{ title: "Duke vs UNC (March Madness)", tab: "sports", league: "college" }, "basketball"],
    [{ title: "Lakers vs Celtics", tab: "sports", league: "NBA" }, "basketball"],
    [{ title: "Arsenal FC vs Chelsea FC", venueCategory: "sports", tab: "sports", league: "soccer" }, "soccer"],
    [{ title: "Yankees vs Dodgers", tab: "sports", league: "MLB" }, "baseball"],
    [{ title: "Sinner vs Alcaraz", tab: "sports", league: "tennis" }, "tennis"],
    [{ title: "Rangers vs Bruins", tab: "sports", league: "NHL" }, "hockey"],
    [{ title: "Masters winner", tab: "sports", league: "golf" }, "golf"],
    [{ title: "Las Vegas Grand Prix winner", event: "F1", tab: "sports", league: "other" }, "racing"],
    [{ title: "UFC 320: Jones vs Aspinall", tab: "sports", league: "UFC" }, "culture"],
    [{ title: "Will a hurricane make landfall in Florida in November?", venueCategory: "weather" }, "hurricane"],
    [{ title: "Highest temperature in NYC on Nov 3?", venueCategory: "weather" }, "weather"],
    [{ title: "Who will win the 2026 Georgia Senate race?", event: "Midterms", venueCategory: "politics" }, "elections"],
    [{ title: "Will Trump sign the funding bill?", venueCategory: "politics" }, "politics"],
    [{ title: "Fed decision in December: 25 bps cut?", venueCategory: "economics" }, "markets"],
    [{ title: "Bitcoin above $150K on Dec 31?", venueCategory: "crypto" }, "markets"],
    [{ title: "WTI crude above $90 in 2026?", venueCategory: "economics" }, "oil"],
    [{ title: "Will OpenAI release GPT-6 this year?", venueCategory: "tech" }, "tech"],
    [{ title: "Will Starship reach orbit in 2026?", venueCategory: "tech" }, "space"],
    [{ title: "Russia x Ukraine ceasefire in 2026?", venueCategory: "geopolitics" }, "world"],
    [{ title: "Best Picture at the Oscars", venueCategory: "culture" }, "culture"],
    [{ title: "Will Powell say 'inflation' 10+ times?", venueCategory: "mentions" }, "culture"],
    [{ title: "Something nobody can classify", venueCategory: "other" }, "world"],
    // Real markets from the live poll: the title names only teams or players; the event slug names the league.
    [{ title: "Hawks vs. Pacers", tab: "sports", league: "other", url: "https://polymarket.com/event/nba-atl-ind-2026-11-02/nba-atl-ind-2026-11-02" }, "basketball"],
    [{ title: "Red Wings vs. Panthers: O/U 5.5", tab: "sports", league: "other", url: "https://polymarket.com/event/nhl-det-fla-2026-11-02/nhl-det-fla-2026-11-02-total-5pt5" }, "hockey"],
    [{ title: "Spread: Seahawks (-10.5)", tab: "sports", url: "https://polymarket.com/event/nfl-chi-sea-2026-11-03/x" }, "football"],
    [{ title: "Rolex Paris Masters: Ugo Humbert vs Botic van de Zandschulp", tab: "sports", league: "golf", url: "https://polymarket.com/event/atp-humbert-zandsch-2026-11-02/x" }, "tennis"],
    [{ title: "Rolex Paris Masters: Ugo Humbert vs Botic van de Zandschulp", tab: "sports", league: "golf" }, "tennis"],
    [{ title: "Will RC Deportivo A Coruña win on 2026-11-02?", tab: "sports", url: "https://polymarket.com/event/lal-dep-osa-2026-11-02/x" }, "soccer"],
  ];
  it.each(cases)("%o → %s", (m, slug) => { expect(categoryOf(m)).toBe(slug); });

  it("every category has a photo on disk, named once in the list", () => {
    expect(new Set(CATEGORIES.map(c => c.slug))).toEqual(new Set(CATEGORY_SLUGS));
    for (const slug of CATEGORY_SLUGS) {
      const p = categoryPhoto(slug);
      expect(existsSync(`public${p.src}`), slug).toBe(true);
      expect(isCategory(slug)).toBe(true);
    }
    for (const [slot, file] of Object.entries(SLOT)) expect(PHOTOS[file], slot).toBeTruthy();
    for (const file of Object.values(FALLBACK)) expect(PHOTOS[file]).toBeTruthy();
  });

  it("a row of cards never shows the same photo twice while a fallback is free", () => {
    expect(categoryPhotos(["soccer", "football"]).map(p => p.src)).toEqual(["/brand/soccer.jpg", "/brand/baseball.jpg"]);
    expect(categoryPhotos(["football"]).map(p => p.src)).toEqual(["/brand/soccer.jpg"]);
    expect(new Set(categoryPhotos(["politics", "elections", "markets"]).map(p => p.src)).size).toBe(2); // elections' fallbacks are both taken
  });

  it("the hero master is small enough to stay under 250KB as delivered", () => {
    expect(statSync(`public${PHOTOS.hero.src}`).size).toBeLessThan(250_000);
  });
});
