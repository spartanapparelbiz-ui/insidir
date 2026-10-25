import { describe, expect, it } from "vitest";
import { alertText, dueAlerts, type AlertDeal, type AlertUser } from "@/lib/alerts/fanout";
import { startCode } from "@/lib/alerts/send";
import { bannedPhrases } from "@/lib/copy";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import type { Leg, Opportunity, Venue } from "@/lib/types";

/* SYNTHETIC deals and users. */
const NOW = 1_800_000_000_000;
const leg = (venue: Venue, side: "yes" | "no", p: number): Leg => ({ venue, marketId: "m", side, label: "", url: "", contracts: 10, avgPrice: p, worstPrice: p, cost: 10 * p, fee: 0.1 });
const opp = (o: Partial<Opportunity> = {}): Opportunity => ({ id: "o1", kind: "cross_arb", title: "Example game", legs: [leg("kalshi", "yes", 0.55), leg("polymarket_us", "no", 0.4)],
  sets: 10, cost: 9.5, fees: 0.2, payout: 10, profit: 0.3, roi: 0.03, days: 2, profitPerDay: 0.15, safety: "green", safetyNotes: [], categories: ["sports"],
  closeTime: null, pairId: "p", gapCents: null, ...o });
const user = (o: Partial<AlertUser> = {}): AlertUser => ({ id: "u", plan: "pro", region: "us", hasPush: true, telegramChatId: "42",
  settings: { ...DEFAULT_SETTINGS, alertPush: true, alertTelegram: true, alertMinRoi: 0.01 }, ...o });
const deal = (ageS: number, o: Partial<Opportunity> = {}): AlertDeal => ({ opp: opp(o), firstSeenAt: NOW - ageS * 1000, active: true });

describe("alert fan-out", () => {
  it("Pro: immediately, on every enabled channel", () => {
    expect(dueAlerts([user()], [deal(2)], NOW)).toEqual([{ userId: "u", oppId: "o1", channel: "push" }, { userId: "u", oppId: "o1", channel: "telegram" }]);
  });
  it("Insidir: only after the 60 second delay; free: never", () => {
    expect(dueAlerts([user({ plan: "insidir" })], [deal(30)], NOW)).toEqual([]);
    expect(dueAlerts([user({ plan: "insidir" })], [deal(61)], NOW)).toHaveLength(2);
    expect(dueAlerts([user({ plan: "free" })], [deal(600)], NOW)).toEqual([]);
  });
  it("respects region, safety, ROI, size, categories, staleness and second opinions", () => {
    expect(dueAlerts([user()], [deal(5, { legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.4)] })], NOW)).toEqual([]); // US user, international Polymarket
    expect(dueAlerts([user()], [deal(5, { safety: "red" })], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(5, { roi: 0.005 })], NOW)).toEqual([]);
    expect(dueAlerts([user({ settings: { ...user().settings, minSizeUsd: 100 } })], [deal(5)], NOW)).toEqual([]);
    expect(dueAlerts([user({ settings: { ...user().settings, categories: ["politics"] } })], [deal(5)], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(3600)], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(5, { kind: "second_opinion" })], NOW)).toEqual([]);
    expect(dueAlerts([user({ hasPush: false, telegramChatId: null })], [deal(5)], NOW)).toEqual([]);
  });
  it("the alert text states facts and the lock condition, never a promise or advice", () => {
    const t = alertText(opp(), "https://insidir.com", "push");
    expect(t.body).toContain("if both sides fill and both markets settle the same way");
    expect(t.url).toBe("https://insidir.com/api/alerts/opened?opp=o1&ch=push");
    expect(bannedPhrases(t.title + " " + t.body)).toEqual([]);
  });
  it("reads the Telegram deep-link code", () => {
    expect(startCode("/start abcDEF12_-x")).toBe("abcDEF12_-x");
    expect(startCode("/start")).toBeNull();
    expect(startCode("hello")).toBeNull();
  });
});
