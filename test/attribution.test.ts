import { describe, expect, it } from "vitest";
import { directTouch, externalHost, extraShortLinks, platformOfRef, readTouch, shortLinkTarget, sourceOf, touchFrom, writeTouch } from "@/lib/attribution";
import { amountOf, cancelled, paymentFacts, paymentKind } from "@/lib/metrics/events";
import { readWindow } from "@/lib/metrics/report";

const NOW = Date.UTC(2026, 10, 9, 15);
const u = (s: string) => new URL(s, "https://insidir.com");

describe("short links", () => {
  it("send /tt1, /ig2 and /x3 to the home page with the ref, keeping the post tag", () => {
    expect(shortLinkTarget(u("/tt1"))).toBe("/?ref=tt1");
    expect(shortLinkTarget(u("/IG2/?utm_content=story-5"))).toBe("/?ref=ig2&utm_content=story-5");
    expect(shortLinkTarget(u("/x3?utm_content=reply_77&utm_campaign=nfl"))).toBe("/?ref=x3&utm_content=reply_77&utm_campaign=nfl");
    expect(platformOfRef("tt1")).toBe("tiktok");
    expect(platformOfRef("ig12")).toBe("instagram");
    expect(platformOfRef("x3")).toBe("x");
  });
  it("leave real pages alone, and take extra names from SHORT_LINKS", () => {
    for (const p of ["/go", "/t", "/board", "/tt", "/tiktok", "/tt1/more", "/x"]) expect(shortLinkTarget(u(p))).toBeNull();
    expect(shortLinkTarget(u("/yt1"), extraShortLinks("yt1, newsletter"))).toBe("/?ref=yt1");
    expect(shortLinkTarget(u("/newsletter"), extraShortLinks("yt1,newsletter"))).toBe("/?ref=newsletter");
    expect(shortLinkTarget(u("/go"), extraShortLinks("go"))).toBeNull();
  });
});

describe("touches", () => {
  it("read ref, UTM tags and the external referrer; group by ref, then utm_source, then referrer, then direct", () => {
    const t = touchFrom(u("/?ref=tt1&utm_content=reel9"), "https://www.tiktok.com/@insidir", NOW)!;
    expect(t).toMatchObject({ ref: "tt1", utm_content: "reel9", referrer: "tiktok.com", landing: "/", source: "tt1", at: NOW });
    expect(touchFrom(u("/board?utm_source=Newsletter"), null, NOW)!.source).toBe("newsletter");
    expect(touchFrom(u("/"), "https://l.instagram.com/?u=x", NOW)!.source).toBe("instagram.com");
    expect(touchFrom(u("/"), "https://insidir.com/board", NOW)).toBeNull();
    expect(touchFrom(u("/"), null, NOW)).toBeNull();
    expect(directTouch(u("/market/x"), NOW)).toEqual({ source: "direct", landing: "/market/x", at: NOW });
    expect(sourceOf({})).toBe("direct");
  });
  it("ignore our own host and junk refs", () => {
    expect(externalHost("https://www.insidir.com/x", "insidir.com")).toBeNull();
    expect(externalHost("not a url", "insidir.com")).toBeNull();
    expect(touchFrom(u("/?ref=<script>"), null, NOW)).toBeNull();
  });
  it("round-trip through the cookie", () => {
    const t = touchFrom(u("/?ref=x1&utm_content=reply1"), null, NOW)!;
    expect(readTouch(writeTouch(t))).toEqual(t);
    expect(readTouch("{bad")).toBeNull();
  });
});

describe("billing funnel", () => {
  it("tells the $1 trial from the first $39 charge and renewals", () => {
    expect(paymentKind({ amount: 1, reason: "subscription_create" }, false)).toBe("trial_start");
    expect(paymentKind({ amount: 39, reason: "subscription_cycle" }, false)).toBe("trial_convert");
    expect(paymentKind({ amount: 39, reason: "subscription_cycle" }, true)).toBe("sub_renewal");
    expect(paymentKind({ amount: 1, reason: null }, false)).toBe("trial_start");
    expect(paymentKind({ amount: 39, reason: null }, false)).toBe("trial_convert");
    expect(paymentKind({ amount: null, reason: null }, false)).toBeNull();
  });
  it("reads Whop amounts in either shape", () => {
    expect(amountOf(39)).toBe(39);
    expect(amountOf({ amount: "39.00", currency: "usd" })).toBe(39);
    expect(amountOf("1")).toBe(1);
    expect(paymentFacts({ data: { id: "pay_1", billing_reason: "subscription_create", usd_total: { amount: "1.00" }, membership: { id: "mem_1" } } }))
      .toEqual({ id: "pay_1", amount: 1, reason: "subscription_create", membershipId: "mem_1" });
  });
  it("sees a cancel set for the period end, or a membership that ended", () => {
    expect(cancelled("membership.updated", { data: { id: "mem_1", cancel_at_period_end: true } })).toEqual({ membershipId: "mem_1", at: "period_end" });
    expect(cancelled("membership.deactivated", { data: { id: "mem_1" } })).toEqual({ membershipId: "mem_1", at: "now" });
    expect(cancelled("membership.updated", { data: { id: "mem_1", cancel_at_period_end: false, status: "active" } })).toBeNull();
  });
});

describe("metrics window", () => {
  it("defaults to the last 30 days (ET) and reads from/to or days", () => {
    expect(readWindow({}, NOW)).toEqual({ from: "2026-10-11", to: "2026-11-09" });
    expect(readWindow({ days: "7" }, NOW)).toEqual({ from: "2026-11-03", to: "2026-11-09" });
    expect(readWindow({ from: "2026-11-05", to: "2026-11-01" }, NOW)).toEqual({ from: "2026-11-01", to: "2026-11-05" });
  });
});
