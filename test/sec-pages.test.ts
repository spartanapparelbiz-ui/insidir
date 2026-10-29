/* The public SEC pages and following insiders, companies and funds: their addresses, what's free (the last 30 days),
 * "X insiders bought this month", how the stock did after a buy (only with a close we hold), what can be followed,
 * the Following feed's filing entries, and no Congress trades anywhere. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOLLOW_KINDS, fundItem, parseFollow, tradeItems, type TradeIn } from "@/lib/follows";
import { secFollowsOf } from "@/lib/moves/feed";
import type { Move } from "@/lib/moves/types";
import { companyHref, fundHref, insiderHref, parseCikSlug, parseTicker, slugify } from "@/lib/profiles/name";
import { afterBuys, boughtThisMonthLine, FREE_DAYS, freeWindow, insidersBoughtThisMonth, tradesByFiling, type Close } from "@/lib/profiles/sec";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 18, 0, 0); // Oct 28 2026

describe("addresses", () => {
  it("slugs: plain ASCII words joined by hyphens", () => {
    expect(slugify("Jen Hsun Huang")).toBe("jen-hsun-huang");
    expect(slugify("Ronald A. McDonald Jr.")).toBe("ronald-a-mcdonald-jr");
    expect(slugify("Procter & Gamble")).toBe("procter-and-gamble");
    expect(slugify("José Núñez")).toBe("jose-nunez");
    expect(slugify("x".repeat(80))).toHaveLength(60);
  });
  it("an insider's page uses the name in normal order; a fund's its EDGAR name; a company's its ticker", () => {
    expect(insiderHref("0001045810", "HUANG JEN HSUN")).toBe("/insiders/1045810-jen-hsun-huang");
    expect(insiderHref("1045810")).toBe("/insiders/1045810");
    expect(fundHref("0001067983", "Berkshire Hathaway")).toBe("/funds/1067983-berkshire-hathaway");
    expect(companyHref("brk.b")).toBe("/insider-trading/BRK.B");
  });
  it("reads a CIK and slug back; a ticker in any case", () => {
    expect(parseCikSlug("1045810-jen-hsun-huang")).toEqual({ cik: "1045810", slug: "jen-hsun-huang" });
    expect(parseCikSlug("0001045810")).toEqual({ cik: "1045810", slug: "" });
    for (const bad of ["", "0", "abc", "-1", "jen-1045810"]) expect(parseCikSlug(bad)).toBeNull();
    expect(parseTicker("nvda")).toBe("NVDA");
    expect(parseTicker("BRK.B")).toBe("BRK.B");
    for (const bad of ["", "1ABC", "TOOLONGTICKER", "A B", "<x>"]) expect(parseTicker(bad)).toBeNull();
  });
});

const trade = (o: Partial<TradeIn> & { accession: string }): TradeIn => ({
  ownerCik: "888888", ownerName: "FIXTURE JANE", role: "The CEO", issuerCik: "999999", company: "E2E Fixture Devices", ticker: "EXDV",
  code: "P", shares: 1000, value: 100_000, tradeDate: null, filedAt: new Date(NOW - DAY), url: "https://www.sec.gov/x", ...o,
});

describe("what's free", () => {
  it("anyone sees filings from the last 30 days; older ones are only counted", () => {
    const list = [{ filedAt: NOW - DAY }, { filedAt: new Date(NOW - (FREE_DAYS - 1) * DAY) }, { filedAt: NOW - (FREE_DAYS + 1) * DAY }, { filedAt: NOW - 400 * DAY }];
    const { shown, older } = freeWindow(list, NOW);
    expect(shown).toHaveLength(2);
    expect(older).toBe(2);
  });
});

describe("insiders bought this month", () => {
  it("distinct insiders with an open-market buy dated this calendar month; sales and last month don't count", () => {
    const ts = [
      trade({ accession: "a", ownerCik: "1", tradeDate: "2026-10-02" }), trade({ accession: "b", ownerCik: "1", tradeDate: "2026-10-20" }),
      trade({ accession: "c", ownerCik: "2", tradeDate: null, filedAt: new Date(Date.UTC(2026, 9, 5)) }),
      trade({ accession: "d", ownerCik: "3", code: "S", tradeDate: "2026-10-10" }),
      trade({ accession: "e", ownerCik: "4", tradeDate: "2026-09-30" }),
    ];
    expect(insidersBoughtThisMonth(ts, NOW)).toBe(2);
    expect(boughtThisMonthLine(2)).toBe("2 insiders bought this month");
    expect(boughtThisMonthLine(1)).toBe("1 insider bought this month");
    expect(boughtThisMonthLine(0)).toBe("No insiders bought this month");
  });
  it("a joint filing stays one row per insider on the company page", () => {
    const ts = [trade({ accession: "a", ownerCik: "1" }), trade({ accession: "a", ownerCik: "2" })].map(t => ({ ...t, price: 100 }));
    expect(tradesByFiling(ts)).toHaveLength(1);
    expect(tradesByFiling(ts, true)).toHaveLength(2);
  });
});

describe("how the stock did after their buys", () => {
  const rows = [
    { accession: "a", code: "P" as const, ticker: "EXDV", price: 100, value: 300_000 },
    { accession: "b", code: "P" as const, ticker: "EXDV", price: 150, value: 100_000 },
    { accession: "c", code: "S" as const, ticker: "EXDV", price: 160, value: 50_000 },
    { accession: "d", code: "P" as const, ticker: "NOPX", price: 20, value: 10_000 },
  ];
  it("the filed price against the latest close we hold, dollar-weighted; sales and tickers without a close left out", () => {
    const closes = new Map<string, Close>([["EXDV", { ticker: "EXDV", date: "2026-10-27", close: 120 }]]);
    const r = afterBuys(rows, closes, NOW);
    expect(r.perBuy.get("a")).toBeCloseTo(0.2);
    expect(r.perBuy.get("b")).toBeCloseTo(-0.2);
    expect(r.perBuy.has("c")).toBe(false);
    expect(r.perBuy.has("d")).toBe(false);
    // $300k × 1.2 + $100k × 0.8 = $440k for $400k paid.
    expect(r.overall?.change).toBeCloseTo(0.1);
    expect(r.overall).toMatchObject({ buys: 2, asOf: "2026-10-27" });
  });
  it("no prices, or only a stale close: the line is skipped", () => {
    expect(afterBuys(rows, new Map(), NOW).overall).toBeNull();
    expect(afterBuys(rows, new Map([["EXDV", { ticker: "EXDV", date: "2026-09-01", close: 120 }]]), NOW).overall).toBeNull();
  });
});

describe("following insiders, companies and funds", () => {
  it("five kinds; CIKs without leading zeros; wallets lower-case; anything else refused", () => {
    expect(FOLLOW_KINDS).toEqual(["tracker", "trader", "market", "insider", "company", "fund"]);
    expect(parseFollow("insider", "0001045810")).toEqual({ kind: "insider", target: "1045810" });
    expect(parseFollow("company", "1045810")).toEqual({ kind: "company", target: "1045810" });
    expect(parseFollow("fund", "0001067983")).toEqual({ kind: "fund", target: "1067983" });
    expect(parseFollow("trader", "0xABC0000000000000000000000000000000000001")).toEqual({ kind: "trader", target: "0xabc0000000000000000000000000000000000001" });
    expect(parseFollow("market", "KXNFL-26")).toEqual({ kind: "market", target: "KXNFL-26" });
    for (const [k, t] of [["insider", "0"], ["insider", "abc"], ["fund", "12345678901"], ["trader", "0x12"], ["politician", "1"], ["congress", "1"], ["insider", ""], [null, "1"]]) {
      expect(parseFollow(k, t)).toBeNull();
    }
  });
  it("a stock card offers the insider and the company, or the fund", () => {
    const base = { id: "x", source: "sec", tab: "stocks" } as unknown as Move;
    expect(secFollowsOf({ ...base, detail: { kind: "insider", company: "Nvidia", ticker: "NVDA", issuerCik: "0001045810", role: "The CEO", ownerName: "HUANG JEN HSUN", ownerCik: "0001197649",
      shares: 1, pricePerShare: 1, tradeDate: null, filedAt: NOW, accession: "a" } })).toEqual([
      { kind: "insider", target: "1197649", label: "Follow insider" }, { kind: "company", target: "1045810", label: "Follow company" }]);
    expect(secFollowsOf({ ...base, detail: { kind: "fund", company: "Apple", cusip: "037833100", fund: "Berkshire Hathaway", fundCik: "0001067983", period: null, filedOn: "2026-10-01",
      addedShares: 1, prevShares: 0, curShares: 1, curValue: 1, newPosition: true, accession: "b", prevAccession: "c" } })).toEqual([{ kind: "fund", target: "1067983", label: "Follow fund" }]);
  });
  it("the Following feed: one entry per filing, insider and side, only for who they follow, newest first", () => {
    const hrefs = { insider: insiderHref, company: companyHref };
    const ts = [
      trade({ accession: "f1", value: 100_000 }), trade({ accession: "f1", value: 50_000 }),
      trade({ accession: "f2", ownerCik: "777", ownerName: "DOE JOHN", role: "A director", code: "S", value: 20_000, filedAt: new Date(NOW - 2 * DAY) }),
      trade({ accession: "f3", ownerCik: "555", issuerCik: "111", company: "Other Co", ticker: "OTH" }),
    ];
    const byInsider = tradeItems(ts, { insiders: new Set(["888888"]), companies: new Set() }, hrefs);
    expect(byInsider).toHaveLength(1);
    expect(byInsider[0]).toMatchObject({ sentence: "Jane Fixture, CEO of E2E Fixture Devices, bought $150,000 of EXDV.", because: "You follow Jane Fixture",
      href: "/insiders/888888-jane-fixture", companyHref: "/insider-trading/EXDV" });
    const byCompany = tradeItems(ts, { insiders: new Set(), companies: new Set(["999999"]) }, hrefs);
    expect(byCompany.map(i => i.sentence)).toEqual([
      "Jane Fixture, CEO of E2E Fixture Devices, bought $150,000 of EXDV.", "John Doe, a director of E2E Fixture Devices, sold $20,000 of EXDV."]);
    expect(byCompany[1]!.because).toBe("You follow E2E Fixture Devices");
  });
  it("a followed fund's new 13F: its biggest add and its new positions", () => {
    const h = (cusip: string, company: string, shares: number, value: number) => ({ cusip, company, shares, value });
    const item = fundItem({ fundCik: "999998", fund: "E2E Fixture Capital", accession: "q2", period: "2026-09-30", filedOn: "2026-10-21", url: "u",
      prev: [h("1", "Devices", 4_000_000, 880_000_000), h("2", "Other", 1_000_000, 50_000_000)],
      holdings: [h("1", "Devices", 5_136_364, 1_130_000_080), h("2", "Other", 500_000, 26_000_000), h("3", "New Co", 100_000, 30_000_000)] }, "/funds/999998-e2e-fixture-capital");
    expect(item.sentence).toBe("E2E Fixture Capital filed its 13F for the quarter ending Sep 30, 2026. Biggest add: Devices ($250,000,080). 1 new position.");
    expect(item.at).toBe(Date.parse("2026-10-21T21:00:00Z"));
  });
});

describe("no politicians", () => {
  it("Congress trades are not a source: nothing in the code reads House or Senate disclosures", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    for (const d of ["lib", "worker", "app", "scripts"]) walk(d);
    const banned = /disclosures-clerk\.house\.gov|efdsearch\.senate\.gov|house-stock-watcher|senate-stock-watcher|quiverquant|capitoltrades/i;
    expect(files.filter(f => banned.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
