/* The V3 Form 4 database (docs/INSIDIR-V3.md §3–§4), pure parts, against real filings saved from EDGAR
 * (test/fixtures/sec/v3: a Procter & Gamble officer's Form 4 with option exercises and a sale, and a BCB Bancorp
 * director's Form 4 with the 4/A that restates it): every transaction code kept, Table I and II apart, owned-after and
 * direct/indirect as filed, the 10b5-1 rule, the daily form index, amendment matching, the insider tabs and the query
 * parser. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backfillDays, etDay, indexUrl, parseFormIndex, seenKey } from "@/lib/stocks/backfill";
import { amendmentLinks, filingRow, ownerKey, parseQuery, tabOf, TABS, type GroupItem } from "@/lib/stocks/filings";
import { parseOwnership, plan10b5One } from "@/lib/stocks/form4";
import { isOpenMarket, tradeRows } from "@/lib/stocks/history";
import { allowedSecUrl } from "@/lib/stocks/sec";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures/sec/v3", name), "utf8");
const url = "https://www.sec.gov/Archives/edgar/data/80424/000008042426000271/0000080424-26-000271-index.htm";

describe("Form 4: every transaction line as filed", () => {
  const o = parseOwnership(fx("pg-ms.xml"));
  const rows = tradeRows(o, "000008042426000271", Date.parse("2026-11-05T21:00:00Z"), url);
  it("keeps the option exercises and the sale, each with its own code and table", () => {
    expect(o.period).toBe("2026-11-04");
    expect(o.aff10b5One).toBe(false);
    expect(rows.map(r => r.code)).toEqual(["M", "S", "M"]);
    expect(rows.map(r => r.derivative)).toEqual([false, false, true]);
    expect(rows.filter(isOpenMarket).map(r => r.code)).toEqual(["S"]);
    for (const r of rows) expect(r).toMatchObject({ form: "4", issuerCik: "80424", ownerName: "Schulten Andre", url, superseded: false });
  });
  it("carries owned-after, direct or indirect, and the relationship as filed", () => {
    for (const r of rows) {
      expect(typeof r.ownedAfter === "number" || r.ownedAfter === null).toBe(true);
      expect([true, false, null]).toContain(r.direct);
      expect([true, false]).toContain(r.isOfficer);
    }
    // An unchecked 10b5-1 box and no footnote saying otherwise: no line was under a plan.
    expect(rows.map(r => r.plan10b5_1)).toEqual([false, false, false]);
  });
  it("value is shares × the filed price, exact to the cent, and only when the filing gives both", () => {
    for (const r of rows) {
      const shares = r.shares ?? null, price = r.price ?? null;
      if (shares !== null && price !== null && price > 0) expect(r.value).toBeCloseTo(Math.round(shares * price * 100) / 100, 2);
      else expect(r.value).toBeNull();
    }
  });
});


describe("the 10b5-1 rule", () => {
  const yes = { notes: ["The sales reported were effected pursuant to a Rule 10b5-1 trading plan adopted on May 1, 2026."] };
  const no = { notes: ["This transaction was not made pursuant to a Rule 10b5-1 trading plan."] };
  const none = { notes: ["Weighted average price."] };
  it("the line's own footnote decides", () => {
    expect(plan10b5One(yes, null)).toBe(true);
    expect(plan10b5One(yes, false)).toBe(true);
    expect(plan10b5One(no, true)).toBe(false);
  });
  it("without a footnote: an unchecked box is No, a checked box doesn't say which line, no box says nothing", () => {
    expect(plan10b5One(none, false)).toBe(false);
    expect(plan10b5One(none, true)).toBeNull();
    expect(plan10b5One(none, null)).toBeNull();
  });
});

describe("the daily form index", () => {
  const text = [
    "Form Type   Company Name                                                  CIK         Date Filed  File Name",
    "-".repeat(140),
    "4                ACCESS INDUSTRIES MANAGEMENT, LLC                             1508226     20261105    edgar/data/1508226/0001193125-26-450029.txt   ",
    "4                ACCESS INDUSTRIES, LLC                                        1508227     20261105    edgar/data/1508227/0001193125-26-450029.txt   ",
    "4/A              BCB BANCORP INC                                               1228454     20261105    edgar/data/1228454/0001193125-26-450490.txt   ",
    "424B2            JPMORGAN CHASE & CO                                           19617       20261105    edgar/data/19617/0001213900-26-000001.txt     ",
    "40-F             SOME ISSUER                                                   1234        20261105    edgar/data/1234/0000001234-26-000001.txt      ",
  ].join("\n");
  it("keeps Form 4 and 4/A only, once per accession whichever filer it is listed under", () => {
    expect(parseFormIndex(text)).toEqual([
      { accession: "000119312526450029", cik: "1508226", form: "4" },
      { accession: "000119312526450490", cik: "1228454", form: "4/A" },
    ]);
  });
  it("its URL is allowed, nothing else on that path is", () => {
    expect(indexUrl("2026-11-05")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261105.idx");
    expect(indexUrl("2026-03-31")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/form.20260331.idx");
    expect(allowedSecUrl(indexUrl("2026-11-05"))).toBe(true);
    expect(allowedSecUrl("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/master.20261105.idx")).toBe(false);
    expect(allowedSecUrl(`${indexUrl("2026-11-05")}?x=1`)).toBe(false);
  });
  it("covers yesterday (US Eastern) back a year by default, newest first", () => {
    const now = Date.parse("2026-11-07T03:00:00Z"); // Nov 6, 10pm in New York
    expect(etDay(now)).toBe("2026-11-06");
    const days = backfillDays(now, null);
    expect(days[0]).toBe("2026-11-05");
    expect(days).toHaveLength(365);
    expect(backfillDays(now, "2026-11-01")).toEqual(["2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02", "2026-11-01"]);
    expect(seenKey("x")).toBe("f4v3:x");
  });
});

describe("amendments", () => {
  const a = parseOwnership(fx("bcb-4.xml")), b = parseOwnership(fx("bcb-4a.xml"));
  it("a real 4/A: same issuer, owners and period as its original, and the day the original was filed", () => {
    expect(b.documentType).toBe("4/A");
    expect(b.originalDate).toBe("2026-11-05");
    expect(a.originalDate).toBeNull();
    expect(ownerKey(a)).toBe(ownerKey(b));
    expect(a.period).toBe(b.period);
    const fa = filingRow(a, "000119312526448969", Date.parse("2026-11-05T15:37:13Z"), url), fb = filingRow(b, "000119312526450490", Date.parse("2026-11-05T20:00:00Z"), url);
    expect([fa.form, fb.form]).toEqual(["4", "4/A"]);
    expect(amendmentLinks([g(fa.accession, "4", fa.filedAt as Date, fa.lines, null), g(fb.accession, "4/A", fb.filedAt as Date, fb.lines, fb.originalDate ?? null)]))
      .toEqual({ amends: new Map([[fb.accession, fa.accession]]), supersededBy: new Map([[fa.accession, fb.accession]]) });
  });
  const g = (accession: string, form: string, filedAt: Date | string, lines = 1, originalDate: string | null = null): GroupItem => ({ accession, form, filedAt: new Date(filedAt), lines, originalDate });
  it("chains: a second 4/A restates the first, and the order read in doesn't matter", () => {
    const group = [g("a2", "4/A", "2026-11-07T15:00:00Z", 1, "2026-11-05"), g("o", "4", "2026-11-05T15:00:00Z"), g("a1", "4/A", "2026-11-06T15:00:00Z", 1, "2026-11-05")];
    const l = amendmentLinks(group);
    expect(l.amends).toEqual(new Map([["a1", "o"], ["a2", "a1"]]));
    expect(l.supersededBy).toEqual(new Map([["o", "a1"], ["a1", "a2"]]));
    expect(amendmentLinks([...group].reverse())).toEqual(l);
  });
  it("a 4/A with no transaction lines is linked but restates nothing", () => {
    const l = amendmentLinks([g("o", "4", "2026-11-05T15:00:00Z"), g("a", "4/A", "2026-11-06T15:00:00Z", 0, "2026-11-05")]);
    expect(l.amends.get("a")).toBe("o");
    expect(l.supersededBy.size).toBe(0);
  });
  it("two originals: the 4/A's original date picks one; without it, or with neither matching, nothing is superseded", () => {
    const two = [g("o1", "4", "2026-11-03T15:00:00Z"), g("o2", "4", "2026-11-05T15:00:00Z")];
    expect(amendmentLinks([...two, g("a", "4/A", "2026-11-06T15:00:00Z", 1, "2026-11-05")]).supersededBy).toEqual(new Map([["o2", "a"]]));
    expect(amendmentLinks([...two, g("a", "4/A", "2026-11-06T15:00:00Z", 1, null)]).supersededBy.size).toBe(0);
    expect(amendmentLinks([g("o", "4", "2026-10-01T15:00:00Z"), g("a", "4/A", "2026-11-06T15:00:00Z", 1, "2026-11-05")]).supersededBy.size).toBe(0);
  });
  it("an original accepted late in the evening (dated the next business day) still matches", () => {
    // Friday Oct 30, 10:30pm ET → EDGAR's date Monday Nov 2.
    expect(amendmentLinks([g("o", "4", "2026-10-31T02:30:00Z"), g("a", "4/A", "2026-11-04T15:00:00Z", 1, "2026-11-02")]).supersededBy.get("o")).toBe("a");
  });
});

describe("the insider page and the filter form", () => {
  it("open-market first; exercises, grants, tax and gifts each their own tab", () => {
    expect(TABS.map(t => t.key)).toEqual(["open", "exercises", "grants", "tax", "gifts", "other"]);
    expect(TABS[0]!.codes).toEqual(["P", "S"]);
    expect(new Set(TABS.flatMap(t => [...t.codes])).size).toBe(TABS.flatMap(t => [...t.codes]).length);
    expect(tabOf("grants")).toBe("grants");
    expect(tabOf("<script>")).toBe("open");
    expect(tabOf(undefined)).toBe("open");
  });
  it("keeps well-formed filters and drops the rest", () => {
    expect(parseQuery({ q: "  Huang ", ticker: "nvda", role: "officer", code: "m", from: "2026-01-01", to: "2026-13-01", min: "100000" }))
      .toEqual({ q: "Huang", ticker: "NVDA", role: "officer", code: "M", from: "2026-01-01", min: 100000 });
    expect(parseQuery({ ticker: "'; drop", role: "ceo", code: "PS", min: "-5", from: "yesterday" })).toEqual({});
    expect(parseQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});
