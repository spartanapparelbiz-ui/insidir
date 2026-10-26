/* Price gaps, cheap to run: the cron matcher's index keys and rare-word rule, the live scanner's request budget, the
 * on/off switch, and the moves directory (memory first, then the venue). The database path is checked against the
 * in-memory matcher by scripts/check-match-equivalence.ts after scripts/bench-match.ts. */
import { describe, expect, it } from "vitest";
import { gapsEnabled } from "@/lib/flags";
import { requestsFor } from "@/lib/gaps/live";
import { effectiveKeys, indexKeys } from "@/lib/gaps/matcher";
import { buildProfile } from "@/lib/matching/candidates";
import { MarketDirectory } from "@/lib/moves/directory";
import type { VMarket } from "@/lib/types";
import { mk } from "./fixtures/matching/markets";

describe("switch", () => {
  it("Price gaps is off unless GAPS_ENABLED=1", () => {
    expect(gapsEnabled({})).toBe(false);
    expect(gapsEnabled({ GAPS_ENABLED: "0" })).toBe(false);
    expect(gapsEnabled({ GAPS_ENABLED: "1" })).toBe(true);
  });
});

describe("matcher index", () => {
  const m = mk("kalshi", "K1", { title: "Will Zanzibar host the Gondwana summit?", closeTime: Date.UTC(2026, 10, 1) });
  it("stores blocking keys plus every word that could be a rare-word key", () => {
    const keys = indexKeys(buildProfile(m));
    expect(keys).toEqual(expect.arrayContaining(buildProfile(m).blockKeys));
    expect(keys).toContain("tok:zanzibar");
    expect(keys.filter(k => k.startsWith("tok:")).every(k => k.length >= 8)).toBe(true);
  });
  it("uses only the 3 rarest words seen on 2 to 30 markets, as the in-memory matcher does", () => {
    const df = new Map([["tok:aaaa", 1], ["tok:bbbb", 2], ["tok:cccc", 5], ["tok:dddd", 9], ["tok:eeee", 20], ["tok:ffff", 31]]);
    expect(effectiveKeys(["team:nba:lal", "tok:aaaa", "tok:bbbb", "tok:cccc", "tok:dddd", "tok:eeee", "tok:ffff"], df)).toEqual(["team:nba:lal", "tok:bbbb", "tok:cccc", "tok:dddd"]);
  });
});

describe("live scanner budget", () => {
  const list = (n: number, venue: VMarket["venue"]) => Array.from({ length: n }, (_, i) => mk(venue, `${venue}-${i}`, { title: "x" }));
  it("books Kalshi 100 tickers per request and Polymarket 500 tokens (250 markets) per request", () => {
    expect(requestsFor(new Map([["kalshi", list(250, "kalshi")], ["polymarket", list(600, "polymarket")]]))).toBe(3 + 3);
    expect(requestsFor(new Map())).toBe(0);
  });
});

describe("moves directory", () => {
  it("asks the venue only for markets it hasn't seen, and keeps no rules text", async () => {
    let asked: string[] = [];
    const src = { getMarketsById: async (ids: readonly string[]) => { asked = [...ids]; return new Map(ids.map(id => [id, mk("kalshi", id, { title: `T ${id}`, rules: "long rules" })])); } };
    const dir = new MarketDirectory(null, { kalshi: src, polymarket: src }, 2);
    expect([...(await dir.lookup("kalshi", ["A", "B"])).keys()]).toEqual(["A", "B"]);
    expect(asked).toEqual(["A", "B"]);
    const again = await dir.lookup("kalshi", ["A"]);
    expect(asked).toEqual(["A", "B"]); // from memory
    expect(again.get("A")!.rules).toBe("");
    await dir.lookup("kalshi", ["C"]);
    expect(dir.size).toBe(2); // bounded
  });
});
