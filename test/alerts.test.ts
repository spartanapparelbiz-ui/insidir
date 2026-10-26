import { describe, expect, it } from "vitest";
import { alertText, digestDue, digestRows, dueAlerts, EMAIL_ALERTS_PER_HOUR, type AlertDeal, type AlertUser } from "@/lib/alerts/fanout";
import { renderEmail, unsubscribeSig, verifyUnsubscribe } from "@/lib/alerts/send";
import { bannedPhrases } from "@/lib/copy";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import type { StoredOpp } from "@/lib/feed";
import type { Leg, Opportunity, Venue } from "@/lib/types";

/* SYNTHETIC deals and users. */
const NOW = Date.UTC(2026, 9, 26, 15, 0, 0); // 15:00 UTC, after the digest hour
const leg = (venue: Venue, side: "yes" | "no", p: number): Leg => ({ venue, marketId: "m", side, label: "", url: "", contracts: 10, avgPrice: p, worstPrice: p, cost: 10 * p, fee: 0.1 });
const opp = (o: Partial<Opportunity> = {}): Opportunity => ({ id: "o1", kind: "cross_arb", title: "Example game", legs: [leg("kalshi", "yes", 0.55), leg("polymarket_us", "no", 0.4)],
  sets: 10, cost: 9.5, fees: 0.2, payout: 10, profit: 0.3, roi: 0.03, days: 2, profitPerDay: 0.15, safety: "green", safetyNotes: [], categories: ["sports"],
  closeTime: null, pairId: "p", gapCents: null, ...o });
const user = (o: Partial<AlertUser> = {}): AlertUser => ({ id: "u", email: "member@example.invalid", plan: "pro", region: "us", hasPush: true, emailsLastHour: 0, lastDigestAt: null,
  settings: { ...DEFAULT_SETTINGS, alertPush: true, alertEmail: true, emailDigest: true, alertMinRoi: 0.01 }, ...o });
const deal = (ageS: number, o: Partial<Opportunity> = {}): AlertDeal => ({ opp: opp(o), firstSeenAt: NOW - ageS * 1000, active: true });

describe("alert fan-out", () => {
  it("Pro: push immediately; email only as the backup when push isn't on", () => {
    expect(dueAlerts([user()], [deal(2)], NOW)).toEqual([{ userId: "u", oppId: "o1", channel: "push" }]);
    expect(dueAlerts([user({ hasPush: false })], [deal(2)], NOW)).toEqual([{ userId: "u", oppId: "o1", channel: "email" }]);
  });
  it("Insidir: only after the 60 second delay; free: no per-deal alerts", () => {
    expect(dueAlerts([user({ plan: "insidir" })], [deal(30)], NOW)).toEqual([]);
    expect(dueAlerts([user({ plan: "insidir" })], [deal(61)], NOW)).toHaveLength(1);
    expect(dueAlerts([user({ plan: "free" })], [deal(600)], NOW)).toEqual([]);
  });
  it("caps backup emails per hour, best deals first", () => {
    const deals = Array.from({ length: 10 }, (_, i) => deal(5, { id: "o" + i, profitPerDay: i }));
    const jobs = dueAlerts([user({ hasPush: false, emailsLastHour: 2 })], deals, NOW);
    expect(jobs).toHaveLength(EMAIL_ALERTS_PER_HOUR - 2);
    expect(jobs[0]?.oppId).toBe("o9");
  });
  it("respects region, safety, ROI, size, categories, staleness and second opinions", () => {
    expect(dueAlerts([user()], [deal(5, { legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.4)] })], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(5, { safety: "red" })], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(5, { roi: 0.005 })], NOW)).toEqual([]);
    expect(dueAlerts([user({ settings: { ...user().settings, minSizeUsd: 100 } })], [deal(5)], NOW)).toEqual([]);
    // Alerts have their own categories (the Alerts page); the feed's category filter doesn't apply to them.
    expect(dueAlerts([user({ settings: { ...user().settings, alertCategories: ["politics"] } })], [deal(5)], NOW)).toEqual([]);
    expect(dueAlerts([user({ settings: { ...user().settings, categories: ["politics"] } })], [deal(5)], NOW)).toHaveLength(1);
    expect(dueAlerts([user()], [deal(3600)], NOW)).toEqual([]);
    expect(dueAlerts([user()], [deal(5, { kind: "second_opinion" })], NOW)).toEqual([]);
    expect(dueAlerts([user({ hasPush: false, email: null })], [deal(5)], NOW)).toEqual([]);
  });
  it("safety lights: Same rules only by default; Check rules when chosen; Skip never", () => {
    expect(dueAlerts([user()], [deal(5, { safety: "yellow" })], NOW)).toEqual([]);
    expect(dueAlerts([user({ settings: { ...user().settings, alertSafety: "green_yellow" } })], [deal(5, { safety: "yellow" })], NOW)).toHaveLength(1);
    expect(dueAlerts([user({ settings: { ...user().settings, alertSafety: "green_yellow", showRed: true } })], [deal(5, { safety: "red" })], NOW)).toEqual([]);
  });
  it("quiet hours, in the member's own time zone, send nothing", () => {
    // NOW is 15:00 UTC = 11:00 in New York (EDT).
    const quiet = (start: string, end: string, timeZone: string | null) => user({ settings: { ...user().settings, quietStart: start, quietEnd: end, timeZone } });
    expect(dueAlerts([quiet("10:00", "12:00", "America/New_York")], [deal(5)], NOW)).toEqual([]);
    expect(dueAlerts([quiet("10:00", "12:00", "UTC")], [deal(5)], NOW)).toHaveLength(1);
    expect(dueAlerts([quiet("14:00", "16:00", null)], [deal(5)], NOW)).toEqual([]);
  });
  it("the alert text states facts and the lock condition, never a promise or advice", () => {
    const t = alertText(opp(), "https://insidir.com", "push");
    expect(t.body).toContain("if both sides fill and both markets settle the same way");
    expect(t.url).toBe("https://insidir.com/api/alerts/opened?opp=o1&ch=push");
    expect(bannedPhrases(t.title + " " + t.body)).toEqual([]);
  });
});

describe("daily summary email", () => {
  it("is due once a day after the hour, only when opted in with an email", () => {
    expect(digestDue(user(), NOW)).toBe(true);
    expect(digestDue(user({ lastDigestAt: NOW - 3 * 3_600_000 }), NOW)).toBe(false);
    expect(digestDue(user(), Date.UTC(2026, 9, 26, 8, 0, 0))).toBe(false);
    expect(digestDue(user({ settings: { ...user().settings, emailDigest: false } }), NOW)).toBe(false);
    expect(digestDue(user({ email: null }), NOW)).toBe(false);
  });
  it("a free user's summary is the delayed top 3 with sizes withheld", () => {
    const stored: StoredOpp[] = Array.from({ length: 6 }, (_, i) => ({ live: opp({ id: "o" + i, profitPerDay: i }), snapshot: opp({ id: "o" + i, profitPerDay: i }),
      firstSeenAt: NOW - (i < 4 ? 60 : 5) * 60_000, lastSeenAt: NOW, active: true }));
    const rows = digestRows(user({ plan: "free" }), stored, NOW);
    expect(rows.map(r => r.id)).toEqual(["o3", "o2", "o1"]);
    expect(rows.every(r => r.locked && r.profit === null && r.sets === null)).toBe(true);
  });
});

describe("email plumbing", () => {
  it("signs and checks one-click unsubscribe links", () => {
    const sig = unsubscribeSig("user_1", "secret");
    expect(verifyUnsubscribe("user_1", sig, "secret")).toBe(true);
    expect(verifyUnsubscribe("user_2", sig, "secret")).toBe(false);
    expect(verifyUnsubscribe("user_1", sig, "")).toBe(false);
  });
  it("renders text and HTML with the disclaimer and the unsubscribe link, escaped", () => {
    const e = renderEmail({ heading: "Today on Insidir", lines: [{ text: "A <b> & c", url: "https://insidir.com/deal/x" }], unsubscribe: "https://insidir.com/u" });
    expect(e.html).toContain("A &lt;b&gt; &amp; c");
    expect(e.text).toContain("Unsubscribe: https://insidir.com/u");
    expect(e.html).toContain("Not affiliated with Polymarket or Kalshi");
  });
});
