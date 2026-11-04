/* Human entity addresses (lib/entities/slug.ts): a market by its title and its id's first 6 hex characters, a Kalshi
 * ticker as itself, a race by its event slug; and back. */
import { describe, expect, it } from "vitest";
import { betPath, marketPath, marketSlug, parseMarketSlug, raceSlugOf, slugWords, walletPath } from "@/lib/entities/slug";

const ID = "0x3f9a2c" + "b".repeat(58);

describe("entity slugs", () => {
  it("a market: its title's words, then the id's first 6 hex characters", () => {
    expect(marketSlug(ID, "Bulls vs. 76ers")).toBe("bulls-vs-76ers-3f9a2c");
    expect(marketPath(ID, "Will the Fed cut rates in December?")).toBe("/market/will-the-fed-cut-rates-in-december-3f9a2c");
    expect(marketSlug(ID, "")).toBe("3f9a2c");
    expect(slugWords("Señor & Co: O/U 230.5")).toBe("senor-and-co-o-u-230-5");
    expect(slugWords("x".repeat(200)).length).toBeLessThanOrEqual(72);
  });

  it("back: a slug names the id's prefix; old full-id links and Kalshi tickers are recognised", () => {
    expect(parseMarketSlug("bulls-vs-76ers-3f9a2c")).toEqual({ kind: "prefix", prefix: "0x3f9a2c" });
    expect(parseMarketSlug("3f9a2c")).toEqual({ kind: "prefix", prefix: "0x3f9a2c" });
    expect(parseMarketSlug(ID)).toEqual({ kind: "id", id: ID });
    expect(parseMarketSlug("KXNBAGAME-26NOV04ATLWAS-ATL")).toEqual({ kind: "kalshi", ticker: "KXNBAGAME-26NOV04ATLWAS-ATL" });
    expect(parseMarketSlug("<script>")).toBeNull();
  });

  it("a non-hex id (a fixture) is its own slug, and resolves to itself without a redirect loop", () => {
    expect(marketSlug("0xe2etennis100", "Tennis match 100")).toBe("0xe2etennis100");
    expect(parseMarketSlug("0xe2etennis100")).toEqual({ kind: "id", id: "0xe2etennis100" });
  });

  it("races, wallets and bets", () => {
    expect(raceSlugOf("florida-governor-election-winner", "Florida Governor Election Winner")).toBe("florida-governor-election-winner");
    expect(raceSlugOf(ID, "Florida Governor")).toBe("florida-governor-3f9a2c");
    expect(walletPath("0xABCdef0000000000000000000000000000000001")).toBe("/wallet/0xabcdef0000000000000000000000000000000001");
    expect(betPath("pm:0xab:1")).toBe("/bet/pm%3A0xab%3A1");
  });
});
