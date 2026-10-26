/* The scan over a SYNTHETIC universe: one matched pair with a lock, a multi-outcome event, a ladder. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SCAN_OPTIONS, laddersEnabled, marketsToBook, scan, scanOptionsFromEnv } from "@/lib/scanner";
import type { VEvent } from "@/lib/types";
import { book, DAY, key, L, market, NOW, pair } from "./engines-fixtures";

const V = { volume24h: 5_000 };
const k = market({ id: "K", venue: "kalshi", category: "sports" });
const p = market({ id: "P", venue: "polymarket", category: "sports", fee: { venue: "polymarket", rate: 0.05 } });
const e1 = market({ id: "E1", venue: "kalshi", eventId: "EV1", ...V }), e2 = market({ id: "E2", venue: "kalshi", eventId: "EV1" }), e3 = market({ id: "E3", venue: "kalshi", eventId: "EV1" });
const ev: VEvent = { venue: "kalshi", id: "EV1", title: "Who wins", category: "politics", marketIds: ["E1", "E2", "E3"], mutuallyExclusive: true, exhaustive: true, closeTime: NOW + 30 * DAY };
const hi = market({ id: "HI", eventId: "BTC", title: "BTC above 100k", strike: { kind: "above", value: 100_000, upper: null, subject: "btc" }, ...V });
const lo = market({ id: "LO", eventId: "BTC", title: "BTC above 90k", strike: { kind: "above", value: 90_000, upper: null, subject: "btc" }, ...V });
const unrelated = market({ id: "U" });

const u = { markets: [k, p, e1, e2, e3, hi, lo, unrelated], events: [ev], pairs: [pair(k, p)] };
const LADDERS = { ...DEFAULT_SCAN_OPTIONS, ladders: true };

describe("LADDERS_ENABLED", () => {
  it("ladders are off unless it is exactly 1", () => {
    expect(laddersEnabled({})).toBe(false);
    expect(laddersEnabled({ LADDERS_ENABLED: "0" })).toBe(false);
    expect(laddersEnabled({ LADDERS_ENABLED: "1" })).toBe(true);
  });
});

describe("scan", () => {
  // These cases cover every engine, ladders included.
  beforeAll(() => { process.env.LADDERS_ENABLED = "1"; });
  afterAll(() => { delete process.env.LADDERS_ENABLED; });
  it("books only the markets an engine can use", () => {
    const need = marketsToBook(u, NOW, LADDERS);
    expect(need.get("kalshi")?.map(m => m.id).sort()).toEqual(["E1", "E2", "E3", "HI", "K", "LO"]);
    expect(need.get("polymarket")?.map(m => m.id)).toEqual(["P"]);
  });

  it("finds the cross-venue lock, the all-YES set and the ladder, best per day first", () => {
    const books = new Map([
      [key("kalshi", "K"), book({ yesAsks: [L(0.55, 100)], noAsks: [L(0.5, 100)] })],
      [key("polymarket", "P"), book({ yesAsks: [L(0.65, 100)], noAsks: [L(0.4, 100)] })],
      [key("kalshi", "E1"), book({ yesAsks: [L(0.3, 50)], noAsks: [L(0.75, 50)] })],
      [key("kalshi", "E2"), book({ yesAsks: [L(0.3, 50)], noAsks: [L(0.75, 50)] })],
      [key("kalshi", "E3"), book({ yesAsks: [L(0.3, 50)], noAsks: [L(0.75, 50)] })],
      // above 90k must be at least as likely as above 100k: YES 90k at 40¢ + NO 100k at 50¢ = 90¢ for ≥ $1.
      [key("kalshi", "LO"), book({ yesAsks: [L(0.4, 20)], noAsks: [L(0.65, 20)] })],
      [key("kalshi", "HI"), book({ yesAsks: [L(0.55, 20)], noAsks: [L(0.5, 20)] })],
    ]);
    const { opps, counts } = scan(u, books, NOW, LADDERS);
    expect(counts.crossArb).toBe(1);
    expect(counts.multi).toBeGreaterThanOrEqual(1);
    expect(counts.ladder).toBe(1);
    expect(opps.map(o => o.kind)).toEqual(expect.arrayContaining(["cross_arb", "multi_yes", "ladder"]));
    for (let i = 1; i < opps.length; i++) expect(opps[i - 1]!.profitPerDay).toBeGreaterThanOrEqual(opps[i]!.profitPerDay);
    expect(new Set(opps.map(o => o.id)).size).toBe(opps.length);
  });

  it("finds nothing without books, and skips blocked pairs", () => {
    expect(scan(u, new Map(), NOW).opps).toEqual([]);
    const blocked = { ...u, pairs: [pair(k, p, { blocked: true })] };
    expect(marketsToBook(blocked, NOW).get("polymarket")).toBeUndefined();
  });

  it("leaves ladders off unless LADDERS_ENABLED=1", () => {
    expect(scanOptionsFromEnv({}).ladders).toBe(false);
    expect(scanOptionsFromEnv({ LADDERS_ENABLED: "0" }).ladders).toBe(false);
    expect(scanOptionsFromEnv({ LADDERS_ENABLED: "1" }).ladders).toBe(true);
    expect(marketsToBook(u, NOW).get("kalshi")?.map(m => m.id).sort()).toEqual(["E1", "E2", "E3", "K"]);
    const books = new Map([[key("kalshi", "LO"), book({ yesAsks: [L(0.4, 20)], noAsks: [L(0.65, 20)] })], [key("kalshi", "HI"), book({ yesAsks: [L(0.55, 20)], noAsks: [L(0.5, 20)] })]]);
    expect(scan(u, books, NOW).counts.ladder).toBe(0);
  });

  it("books matched pairs always, other markets only when they trade and close within the window", () => {
    const quiet = { ...u, markets: u.markets.map(m => ({ ...m, volume24h: 10 })) };
    expect(marketsToBook(quiet, NOW, LADDERS).get("kalshi")?.map(m => m.id)).toEqual(["K"]);
    const far = { ...u, markets: u.markets.map(m => ({ ...m, closeTime: NOW + 60 * DAY })), events: [{ ...ev, closeTime: NOW + 60 * DAY }] };
    expect(marketsToBook(far, NOW, LADDERS).get("kalshi")?.map(m => m.id)).toEqual(["K"]);
    expect(scanOptionsFromEnv({ BOOK_MIN_VOLUME_24H: "50", BOOK_MAX_DAYS: "7" })).toMatchObject({ minVolume24h: 50, maxDays: 7 });
  });

});
