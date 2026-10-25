/* Synthetic but realistic market fixtures for the matching tests. Titles, labels and rules follow the shapes the
 * venues publish (Kalshi: "<City> at <City> Winner?" with yes_sub_title per team, rules_primary/secondary;
 * Polymarket: "<Team> vs. <Team>" with the two team outcomes, a description as rules). All times are UTC. */
import type { Strike, Venue, VMarket } from "@/lib/types";

export const T0 = Date.UTC(2026, 9, 25, 12); // "now" in the tests: 2026-10-25 12:00 UTC
const H = 3_600_000;
export const at = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

export function mk(venue: Venue, id: string, p: Partial<VMarket> & Pick<VMarket, "title">): VMarket {
  const fee: VMarket["fee"] = venue === "kalshi" ? { venue: "kalshi", multiplier: 0.07 } : { venue, rate: 0.02 };
  return {
    venue,
    id,
    eventId: p.eventId ?? `${id}-event`,
    seriesId: p.seriesId ?? null,
    title: p.title,
    eventTitle: p.eventTitle ?? null,
    yesLabel: p.yesLabel ?? "Yes",
    noLabel: p.noLabel ?? "No",
    rules: p.rules ?? "",
    resolutionSource: p.resolutionSource ?? null,
    closeTime: p.closeTime === undefined ? T0 + 24 * H : p.closeTime,
    category: p.category ?? "other",
    fee,
    url: `https://example.test/${venue}/${id}`,
    yesTokenId: venue === "kalshi" ? null : `${id}-yes`,
    noTokenId: venue === "kalshi" ? null : `${id}-no`,
    strike: p.strike ?? null,
    active: true,
    result: null,
    volume24h: null,
  };
}

const btcStrike = (value: number): Strike => ({ kind: "above", value, upper: null, subject: "btc" });

// ---------------------------------------------------------------------------------------------------------------
// NBA moneyline, Nov 5 2026, 7:30 PM ET (00:30 UTC Nov 6). Kalshi has one market per team.

const KALSHI_NBA_RULES = (team: string) =>
  `If ${team} wins the Los Angeles L at Boston professional basketball game originally scheduled for Nov 5, 2026, then the market resolves to Yes. ` +
  "The outcome includes overtime. If the game is postponed, the market will remain open until the game is played, up to two weeks after the originally scheduled date.";
const POLY_NBA_RULES =
  "In the upcoming NBA game, scheduled for November 5, 2026 at 7:30 PM ET: If the Los Angeles Lakers win, the market will resolve to “Lakers”. " +
  "If the Boston Celtics win, the market will resolve to “Celtics”. If the game is postponed, this market will remain open until the game has been completed.";

export const kNbaLal = mk("kalshi", "KXNBAGAME-26NOV05LALBOS-LAL", {
  eventId: "KXNBAGAME-26NOV05LALBOS", seriesId: "KXNBAGAME", category: "sports",
  title: "Los Angeles L at Boston Winner?", eventTitle: "Los Angeles L at Boston",
  yesLabel: "Los Angeles L", noLabel: "Los Angeles L", rules: KALSHI_NBA_RULES("Los Angeles L"), closeTime: at(2026, 11, 6, 3),
});
export const kNbaBos = mk("kalshi", "KXNBAGAME-26NOV05LALBOS-BOS", {
  eventId: "KXNBAGAME-26NOV05LALBOS", seriesId: "KXNBAGAME", category: "sports",
  title: "Los Angeles L at Boston Winner?", eventTitle: "Los Angeles L at Boston",
  yesLabel: "Boston", noLabel: "Boston", rules: KALSHI_NBA_RULES("Boston"), closeTime: at(2026, 11, 6, 3),
});
export const pNba = mk("polymarket", "0xnba-lal-bos-1105", {
  category: "sports", title: "Lakers vs. Celtics", eventTitle: "Lakers vs. Celtics",
  yesLabel: "Lakers", noLabel: "Celtics", rules: POLY_NBA_RULES, closeTime: at(2026, 11, 6, 0, 30),
});
/** Polymarket US lists the same game with the outcomes the other way round. */
export const pusNba = mk("polymarket_us", "pus-nba-bos-lal-1105", {
  category: "sports", title: "Celtics vs. Lakers", yesLabel: "Celtics", noLabel: "Lakers", rules: POLY_NBA_RULES, closeTime: at(2026, 11, 6, 0, 30),
});
/** Same two teams eight days later: must never pair with the Nov 5 markets. */
export const pNbaRematch = mk("polymarket", "0xnba-lal-bos-1113", {
  category: "sports", title: "Lakers vs. Celtics", yesLabel: "Lakers", noLabel: "Celtics",
  rules: POLY_NBA_RULES.replace("November 5", "November 13"), closeTime: at(2026, 11, 14, 0, 30),
});

// ---------------------------------------------------------------------------------------------------------------
// NFL moneyline with identical rules on both sides (GREEN).

const NFL_RULES_K =
  "If Kansas City wins the Kansas City at Buffalo professional football game originally scheduled for Nov 8, 2026, then the market resolves to Yes. " +
  "The outcome includes overtime. If the game ends in a tie, the market resolves 50-50.";
const NFL_RULES_P =
  "This market refers to the NFL game scheduled for November 8, 2026. If the Kansas City Chiefs win, including overtime, the market resolves to “Chiefs”. " +
  "If the Buffalo Bills win, it resolves to “Bills”. If the game ends in a tie, the market resolves 50-50.";
export const kNflKc = mk("kalshi", "KXNFLGAME-26NOV08KCBUF-KC", {
  seriesId: "KXNFLGAME", category: "sports", title: "Kansas City at Buffalo Winner?", eventTitle: "Kansas City at Buffalo",
  yesLabel: "Kansas City", noLabel: "Kansas City", rules: NFL_RULES_K, closeTime: at(2026, 11, 9, 1, 30),
});
export const pNfl = mk("polymarket", "0xnfl-kc-buf-1108", {
  category: "sports", title: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills", rules: NFL_RULES_P, closeTime: at(2026, 11, 9, 0, 30),
});

// ---------------------------------------------------------------------------------------------------------------
// NHL: Rangers at Bruins on consecutive days. Titles carry no date; the 24h gap must keep them apart.

export const kNhlDay2 = mk("kalshi", "KXNHLGAME-26NOV06NYRBOS-NYR", {
  seriesId: "KXNHLGAME", category: "sports", title: "New York R at Boston Winner?", yesLabel: "New York R", noLabel: "New York R",
  rules: "If New York R wins the New York R at Boston professional hockey game originally scheduled for Nov 6, 2026, then the market resolves to Yes.",
  closeTime: at(2026, 11, 7, 3),
});
export const pNhlDay1 = mk("polymarket", "0xnhl-nyr-bos-1105", {
  category: "sports", title: "Rangers vs. Bruins", yesLabel: "Rangers", noLabel: "Bruins",
  rules: "NHL game scheduled for November 5, 2026. Resolves to the winning team, including overtime and shootout.", closeTime: at(2026, 11, 6, 2),
});

// ---------------------------------------------------------------------------------------------------------------
// Election: one Kalshi market per candidate, one Polymarket market per candidate.

const ELECTION_CLOSE_K = at(2028, 8, 21, 4);
const ELECTION_CLOSE_P = at(2028, 8, 20, 4);
const kElection = (name: string, id: string) =>
  mk("kalshi", id, {
    eventId: "KXDEMNOM-28", seriesId: "KXDEMNOM", category: "politics",
    title: "Who will win the 2028 Democratic presidential nomination?", eventTitle: "2028 Democratic presidential nominee",
    yesLabel: name, noLabel: name, closeTime: ELECTION_CLOSE_K,
    rules: `If ${name} is the nominee of the Democratic Party for President in 2028, then the market resolves to Yes.`,
  });
const pElection = (name: string, id: string, party = "Democratic") =>
  mk("polymarket", id, {
    category: "politics", title: `Will ${name} win the 2028 ${party} presidential nomination?`, eventTitle: `${party} Presidential Nominee 2028`,
    closeTime: ELECTION_CLOSE_P,
    rules: `This market will resolve to "Yes" if ${name} wins and accepts the 2028 nomination of the ${party} Party for U.S. president. Otherwise, it resolves to "No".`,
  });
export const kNewsom = kElection("Gavin Newsom", "KXDEMNOM-28-GNEW");
export const kButtigieg = kElection("Pete Buttigieg", "KXDEMNOM-28-PBUT");
export const pNewsom = pElection("Gavin Newsom", "0xdem-newsom");
export const pButtigieg = pElection("Pete Buttigieg", "0xdem-buttigieg");
export const pVanceGop = pElection("JD Vance", "0xgop-vance", "Republican");

// ---------------------------------------------------------------------------------------------------------------
// BTC ladder, Nov 5 2026 5 PM ET. Near-but-different strikes must never match.

const BTC_CLOSE = at(2026, 11, 5, 22);
const KALSHI_BTC_RULES = (v: string) =>
  `If the simple average of the sixty seconds of CF Benchmarks' Bitcoin Real-Time Index (BRTI) before 5 PM EST on Nov 5, 2026 is above ${v}, then the market resolves to Yes.`;
const POLY_BTC_RULES =
  "This market will resolve to \"Yes\" if the Binance 1 minute candle for BTC/USDT at 5:00 PM ET on November 5, 2026 has a final \"Close\" price above the price specified in the title. Otherwise, this market will resolve to \"No\".";
const kBtc = (strike: number, label: string) =>
  mk("kalshi", `KXBTCD-26NOV0517-T${strike}`, {
    eventId: "KXBTCD-26NOV0517", seriesId: "KXBTCD", category: "crypto", title: "Bitcoin price on Nov 5, 2026 at 5pm EST?",
    eventTitle: "Bitcoin price on Nov 5, 2026 at 5pm EST?", yesLabel: label, noLabel: label, strike: btcStrike(strike),
    rules: KALSHI_BTC_RULES(`$${strike.toLocaleString("en-US")}`), closeTime: BTC_CLOSE,
  });
export const kBtc100 = kBtc(99999.99, "$100,000 or above");
export const kBtc102 = kBtc(102499.99, "$102,500 or above");
export const kBtc105 = kBtc(104999.99, "$105,000 or above");
const pBtc = (id: string, title: string) => mk("polymarket", id, { category: "crypto", title, rules: POLY_BTC_RULES, closeTime: BTC_CLOSE });
export const pBtc100 = pBtc("0xbtc-100k-1105", "Will Bitcoin be above $100k on November 5 at 5pm ET?");
export const pBtc101 = pBtc("0xbtc-101k-1105", "Will Bitcoin be above $101,000 on November 5 at 5pm ET?");
export const pBtc105 = pBtc("0xbtc-105k-1105", "Will Bitcoin be above $105,000 on November 5 at 5pm ET?");
/** Same strike, measured at noon: a different outcome. */
export const pBtc100Noon = pBtc("0xbtc-100k-1105-noon", "Will Bitcoin be above $100,000 on November 5 at 12:00 PM ET?");

// ---------------------------------------------------------------------------------------------------------------
// Fed decision, Dec 2026 meeting (Dec 9).

const FED_CLOSE = at(2026, 12, 9, 19);
const KALSHI_FED_RULES = (what: string) =>
  `If the Federal Reserve ${what} at its December 2026 meeting, as stated in the FOMC statement, then the market resolves to Yes.`;
const kFed = (id: string, label: string, what: string) =>
  mk("kalshi", id, { eventId: "KXFEDDECISION-26DEC", seriesId: "KXFEDDECISION", category: "economics", title: "Fed decision in Dec 2026?", yesLabel: label, noLabel: label, rules: KALSHI_FED_RULES(what), closeTime: FED_CLOSE });
export const kFedCut25 = kFed("KXFEDDECISION-26DEC-C25", "Cut 25bps", "cuts the target rate by 25 basis points");
export const kFedHold = kFed("KXFEDDECISION-26DEC-H0", "Hold", "keeps the target rate unchanged");
const pFed = (id: string, title: string) =>
  mk("polymarket", id, {
    category: "economics", title, eventTitle: "Fed decision in December?", closeTime: FED_CLOSE,
    rules: "The resolution source for this market is the FOMC's statement after its December 2026 meeting, per federalreserve.gov.",
  });
export const pFedCut25 = pFed("0xfed-dec-cut25", "Fed decreases interest rates by 25 bps after December 2026 meeting?");
export const pFedCut50 = pFed("0xfed-dec-cut50", "Fed decreases interest rates by 50+ bps after December 2026 meeting?");
export const pFedHold = pFed("0xfed-dec-hold", "No change in Fed interest rates after December 2026 meeting?");

// ---------------------------------------------------------------------------------------------------------------
// Weather: NYC high temperature on Nov 5 2026. Sources differ (NWS Central Park vs Weather Underground LGA).

const WX_CLOSE = at(2026, 11, 6, 5);
export const kWx60 = mk("kalshi", "KXHIGHNY-26NOV05-T60", {
  seriesId: "KXHIGHNY", category: "weather", title: "Will the high temperature in NYC be above 60° on Nov 5, 2026?",
  strike: { kind: "above", value: 60, upper: null, subject: "nyc-high-temp" }, closeTime: WX_CLOSE,
  rules: "If the highest temperature recorded in Central Park, New York for Nov 5, 2026 is above 60°F as reported by the National Weather Service's Climatological Report, then the market resolves to Yes.",
});
const pWx = (id: string, v: number) =>
  mk("polymarket", id, {
    category: "weather", title: `Will the highest temperature in New York City be above ${v}°F on November 5?`, closeTime: WX_CLOSE,
    rules: `This market will resolve to "Yes" if the highest temperature recorded at LaGuardia Airport on November 5, 2026, as reported by Weather Underground, is above ${v}°F.`,
  });
export const pWx60 = pWx("0xwx-nyc-60", 60);
export const pWx62 = pWx("0xwx-nyc-62", 62);

export const KALSHI_ALL: readonly VMarket[] = [kNbaLal, kNbaBos, kNflKc, kNhlDay2, kNewsom, kButtigieg, kBtc100, kBtc102, kBtc105, kFedCut25, kFedHold, kWx60];
export const POLY_ALL: readonly VMarket[] = [pNba, pNbaRematch, pNfl, pNhlDay1, pNewsom, pButtigieg, pVanceGop, pBtc100, pBtc101, pBtc105, pBtc100Noon, pFedCut25, pFedCut50, pFedHold, pWx60, pWx62];
