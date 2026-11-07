/* Millionaire pings (lib/millionaires/pings.ts): who gets which bet, the daily cap, quiet hours (theirs, else 11pm–8am
 * local), Elections on for everyone through Election week, and the words. */
import { describe, expect, it } from "vitest";
import { ELECTIONS_ON_UNTIL, PING_DAILY_MAX, pingJobs, pingMessage, type PingBet, type PingUser } from "@/lib/millionaires/pings";

const NOON_ET = Date.parse("2026-11-03T17:00:00Z"); // noon in New York, Election Day
const user = (o: Partial<PingUser> = {}): PingUser => ({ id: "u", push: true, cats: ["football"], quietStart: null, quietEnd: null, timeZone: "America/New_York", sentLast24h: 0, ...o });
const bet = (o: Partial<PingBet> = {}): PingBet => ({ id: "b1", tier: "millionaire", amount: 120_000, category: "football", title: "Chiefs vs. Bills", outcome: "Chiefs", price: 0.6, pnl: 3_100_000, ...o });

describe("who gets pinged", () => {
  it("a $1M+ wallet's $25K+ bet in their categories; never under $25K, never a Pro wallet, never outside their categories", () => {
    expect(pingJobs([user()], [bet()], NOON_ET)).toEqual([{ userId: "u", betId: "b1" }]);
    expect(pingJobs([user()], [bet({ amount: 24_999 })], NOON_ET)).toEqual([]);
    expect(pingJobs([user()], [bet({ tier: "pro" })], NOON_ET)).toEqual([]);
    expect(pingJobs([user()], [bet({ category: "tennis" })], NOON_ET)).toEqual([]);
    expect(pingJobs([user({ push: false })], [bet()], NOON_ET)).toEqual([]);
  });
  it("no categories chosen means every category; Elections is on for everyone through Election week", () => {
    expect(pingJobs([user({ cats: [] })], [bet({ category: "tennis" })], NOON_ET)).toHaveLength(1);
    expect(pingJobs([user()], [bet({ category: "elections" })], NOON_ET)).toHaveLength(1);
    expect(pingJobs([user()], [bet({ category: "elections" })], ELECTIONS_ON_UNTIL + 3_600_000)).toEqual([]);
  });
  it(`at most ${PING_DAILY_MAX} in 24 hours, counting what was already sent`, () => {
    const many = Array.from({ length: 12 }, (_, i) => bet({ id: `b${i}` }));
    expect(pingJobs([user()], many, NOON_ET)).toHaveLength(PING_DAILY_MAX);
    expect(pingJobs([user({ sentLast24h: 6 })], many, NOON_ET)).toHaveLength(2);
    expect(pingJobs([user({ sentLast24h: PING_DAILY_MAX })], many, NOON_ET)).toEqual([]);
  });
  it("quiet hours: 11pm–8am local by default, their own when set", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(pingJobs([user()], [bet()], at("2026-11-04T04:30:00Z"))).toEqual([]); // 11:30 pm New York
    expect(pingJobs([user()], [bet()], at("2026-11-04T12:30:00Z"))).toEqual([]); // 7:30 am New York: still quiet
    expect(pingJobs([user()], [bet()], at("2026-11-04T13:05:00Z"))).toHaveLength(1); // 8:05 am New York
  });
  it("their own quiet hours and time zone win", () => {
    const at = Date.parse("2026-11-04T06:30:00Z"); // 10:30 pm in Los Angeles, 1:30 am in New York
    expect(pingJobs([user({ timeZone: "America/Los_Angeles" })], [bet()], at)).toHaveLength(1); // before their 11pm
    expect(pingJobs([user({ timeZone: "America/Los_Angeles", quietStart: "22:00", quietEnd: "07:00" })], [bet()], at)).toEqual([]);
  });
});

describe("the ping's words", () => {
  it("names the wallet by its profit, the outcome and market, its price and the price now, and opens the copy ticket", () => {
    expect(pingMessage(bet({ title: "the Iowa Senate race", outcome: "Republicans" }), 0.61, "https://insidir.com")).toEqual({
      title: "Insidir", body: "A +$3.1M wallet just put $120K on Republicans in the Iowa Senate race at 60¢ (now 61¢). Copy?", url: "https://insidir.com/copy/b1",
    });
  });
  it("a Yes/No question is quoted; an unchanged price says so; no profit known says $1M+", () => {
    expect(pingMessage(bet({ title: "Will the Republicans win the Iowa Senate race?", outcome: "Yes", pnl: null }), 0.6, "https://x").body)
      .toBe("A $1M+ wallet just put $120K on Yes in “Will the Republicans win the Iowa Senate race?” at 60¢ (still there now). Copy?");
  });
});

describe("a ping on a market with a Kalshi twin", () => {
  it("leads with both prices and opens the bet's page (Kalshi first)", () => {
    const b = bet({ id: "b9", outcome: "Hawks", price: 0.79, pnl: 11_200_000, side: "yes", marketId: "0xm" });
    const m = pingMessage(b, 0.8, "https://insidir.com", { yes: 0.81 });
    expect(m.body).toBe("A +$11M wallet bought Hawks at 79¢ on Polymarket. Kalshi: 81¢.");
    expect(m.url).toBe("https://insidir.com/bet/b9");
    // NO on Polymarket is NO on Kalshi, at Kalshi's NO ask (not 1 − the YES ask, the NO bid).
    expect(pingMessage({ ...b, side: "no" }, null, "https://insidir.com", { yes: 0.81, noAsk: 0.21 }).body).toContain("Kalshi: 21¢.");
    // No twin, or no Kalshi price yet: the copy ticket as before.
    expect(pingMessage(b, 0.8, "https://insidir.com", null).url).toBe("https://insidir.com/copy/b9");
  });
});
