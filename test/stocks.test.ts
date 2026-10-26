/* Stocks (docs/INSIDIR-V2.md): SEC Form 4 insider buys and 13F fund adds, parsed from fixtures in the SEC's own XML
 * shapes; the card wording; the SEC client's User-Agent, allowlist and throttle. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS, moveSentence, stockNote } from "@/lib/moves/copy";
import { marketLink } from "@/lib/moves/links";
import { liveTabs, readyFeatures } from "@/lib/features";
import { companyName, easternToMs, filedValue, filingIndexUrl, insiderBuy, ownershipCandidates, parseAtom, parseOwnership, roleWord, xmlDate } from "@/lib/stocks/form4";
import { complete, fundAdds, managerCiks, parseInfoTable, parsePrimaryDoc, positions, thirteenFFilings } from "@/lib/stocks/form13f";
import { fundMove, insiderMove } from "@/lib/stocks/moves";
import { allowedSecUrl, SecClient, secUserAgent } from "@/lib/stocks/sec";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures/sec", name), "utf8");
const ACC = "000032019326000101";

describe("Form 4 insider buys", () => {
  const o = parseOwnership(fx("form4-ceo-buy.xml"));
  it("parses the issuer, the owner and every line as filed", () => {
    expect(o.issuerCik).toBe("0000320193");
    expect(o.ticker).toBe("EXDV");
    expect(o.owners[0]).toMatchObject({ name: "Doe Jane", isOfficer: true, officerTitle: "Chief Executive Officer" });
    expect(o.lines).toHaveLength(4);
    expect(o.lines[1]!.date).toBe("2026-10-22"); // "2026-10-22-04:00" carries a zone
  });
  it("sums open-market buys (code P, acquired, common stock) exactly, skipping tax withholding and derivatives", () => {
    const b = insiderBuy(o, ACC)!;
    expect(b.amount).toBe(1_401_817.5); // 5000 × 182.4050 + 2675 × 183.10
    expect(b.shares).toBe(7675);
    expect(b.role).toBe("The CEO");
    expect(b.company).toBe("Example Devices");
    expect(b.lastDate).toBe("2026-10-22");
  });
  it("under $100,000, amendments and sales make no card", () => {
    expect(insiderBuy(o, ACC, 2_000_000)).toBeNull();
    expect(insiderBuy({ ...o, documentType: "4/A" }, ACC)).toBeNull();
    expect(insiderBuy({ ...o, lines: o.lines.map(l => ({ ...l, code: "S", acquiredDisposed: "D" })) }, ACC)).toBeNull();
  });
  it("filedValue multiplies the filed decimals exactly, half up to the cent", () => {
    expect(filedValue("3", "0.335")).toBe(1.01);
    expect(filedValue("1000", "0")).toBeNull();
    expect(filedValue(null, "1")).toBeNull();
  });
  it("roles come from the filed relationship, never a name", () => {
    const base = { cik: null, name: "X", isDirector: false, isOfficer: true, isTenPercentOwner: false, otherText: null };
    expect(roleWord({ ...base, officerTitle: "President and CEO" })).toBe("The CEO");
    expect(roleWord({ ...base, officerTitle: "EVP, Chief Financial Officer" })).toBe("The CFO");
    expect(roleWord({ ...base, officerTitle: "Vice President, Sales" })).toBe("An executive");
    expect(roleWord({ ...base, officerTitle: "Senior Vice President" })).toBe("An executive");
    expect(roleWord({ ...base, isOfficer: false, isDirector: true, officerTitle: null })).toBe("A director");
    expect(roleWord({ ...base, isOfficer: false, isTenPercentOwner: true, officerTitle: null })).toBe("A 10% owner");
  });
  it("company names read like people say them", () => {
    expect(companyName("NVIDIA CORP")).toBe("Nvidia");
    expect(companyName("Apple Inc.")).toBe("Apple");
    expect(companyName("AT&T INC.")).toBe("AT&T");
    expect(companyName("TESLA, INC. /DE/")).toBe("Tesla");
    expect(companyName("BERKSHIRE HATHAWAY INC")).toBe("Berkshire Hathaway");
    expect(companyName("CHEVRON CORP NEW")).toBe("Chevron");
    expect(companyName("ALPHABET INC CAP STK CL A")).toBe("Alphabet");
  });
  it("reads the current-filings feed: Form 4 and 4/A only, sec.gov links only, once per accession", () => {
    const list = parseAtom(fx("atom-current.xml"));
    expect(list.map(f => [f.accession, f.formType])).toEqual([[ACC, "4"], ["000000000226000888", "4/A"]]);
    expect(list[0]!.publishedAt).toBe(Date.parse("2026-10-26T14:12:44Z"));
  });
  it("EDGAR's Eastern timestamps and zoned dates convert correctly", () => {
    expect(easternToMs("2026-10-15 15:22:00")).toBe(Date.parse("2026-10-15T19:22:00Z"));
    expect(easternToMs("2026-01-15 15:22:00")).toBe(Date.parse("2026-01-15T20:22:00Z"));
    expect(xmlDate("2026-10-14Z")).toBe("2026-10-14");
  });
  it("picks the ownership XML from the filing index, not the styled copy", () => {
    expect(ownershipCandidates({ directory: { item: [{ name: "xslF345X05" }, { name: "R1.htm" }, { name: "zz.xml" }, { name: "wk-form4_1.xml" }] } })).toEqual(["wk-form4_1.xml", "zz.xml"]);
  });
});

describe("13F fund adds", () => {
  const cover = parsePrimaryDoc(fx("13f-primary.xml"));
  const cur = parseInfoTable(fx("13f-info-cur.xml")), prev = parseInfoTable(fx("13f-info-prev.xml"));
  it("checks the parsed table against the cover page totals", () => {
    expect(cover).toMatchObject({ period: "2026-09-30", tableEntryTotal: 4, tableValueTotal: 1_915_000_000 });
    expect(complete(cover, cur)).toBe(true);
    expect(complete(cover, cur.slice(1))).toBe(false);
  });
  it("compares share positions with the previous filing: adds and new positions, options left out", () => {
    const adds = fundAdds(positions(prev, "2026-08-14"), positions(cur, "2026-11-14"));
    expect(adds.map(a => [a.company, a.added, a.newPosition])).toEqual([["Chevron", 600_000_000, true], ["Example Devices", 220_000_000, false]]);
  });
  it("values filed before 2023-01-03 are in thousands", () => {
    expect(positions(prev, "2022-11-14").get("037833100")!.value).toBe(800_000_000_000);
  });
  it("lists original 13F-HR filings only, newest first, with the acceptance time", () => {
    const subs = { name: "X", filings: { recent: { form: ["13F-HR/A", "13F-HR", "4", "13F-HR"], accessionNumber: ["0000000001-26-000003", "0000000001-26-000002", "0000000001-26-000009", "0000000001-26-000001"],
      filingDate: ["2026-11-20", "2026-11-14", "2026-11-01", "2026-08-14"], reportDate: ["2026-09-30", "2026-09-30", "", "2026-06-30"],
      acceptanceDateTime: ["", "2026-11-14T16:05:11.000Z", "", "2026-08-14T15:00:00.000Z"] } } };
    expect(thirteenFFilings(subs, 2).map(f => [f.accessionDashed, f.period, f.acceptedAt])).toEqual([
      ["0000000001-26-000002", "2026-09-30", Date.parse("2026-11-14T16:05:11.000Z")], ["0000000001-26-000001", "2026-06-30", Date.parse("2026-08-14T15:00:00.000Z")]]);
  });
  it("tracks the configured funds, at most 25, CIKs only", () => {
    expect(managerCiks({ INSIDIR_13F_MANAGER_CIKS: "1067983, 1067983 abc 0001336528" })).toEqual(["0001067983", "0001336528"]);
  });
});

describe("stock cards", () => {
  const o = parseOwnership(fx("form4-ceo-buy.xml"));
  const insider = insiderMove(insiderBuy(o, ACC)!, Date.parse("2026-10-26T14:12:44Z"), 2, filingIndexUrl("320193", ACC));
  const f13 = { form: "13F-HR", accession: "000106798326000002", accessionDashed: "0001067983-26-000002", filedAt: "2026-11-14", acceptedAt: null, period: "2026-09-30" };
  const prevF = { ...f13, accession: "000106798326000001", accessionDashed: "0001067983-26-000001", filedAt: "2026-08-14", period: "2026-06-30" };
  const add = fundAdds(positions(parseInfoTable(fx("13f-info-prev.xml")), "2026-08-14"), positions(parseInfoTable(fx("13f-info-cur.xml")), "2026-11-14"))[1]!;
  const fund = fundMove(add, "Berkshire Hathaway", "0001067983", f13, prevF, "https://www.sec.gov/Archives/edgar/data/1067983/000106798326000002/0001067983-26-000002-index.htm");
  it("say it the way the brief does", () => {
    expect(moveSentence(insider, null, true)).toBe("The CEO of Example Devices just bought $1.4M of Example Devices stock.");
    expect(moveSentence(fund, null, false)).toBe("Berkshire Hathaway added $220M of Example Devices last quarter.");
    expect(stockNote(insider.detail!)).toBe("Bought Oct 22 at $182.65 a share. Filed with the SEC Oct 26.");
    expect(stockNote(fund.detail!)).toBe("Filed Nov 14 for the quarter ending Sep 30. 13F data can be up to 45 days old.");
    for (const t of [moveSentence(insider, null), moveSentence(fund, null), stockNote(insider.detail!), stockNote(fund.detail!)]) for (const re of BANNED_WORDS) expect(t).not.toMatch(re);
  });
  it("link to the SEC filing itself, for everyone", () => {
    expect(insider.url).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/0000320193-26-000101-index.htm");
    expect(marketLink(insider, "us", null)).toEqual({ href: insider.url, label: "See the SEC filing" });
    expect(marketLink({ source: "sec", url: "https://evil.example/x" }, "us", null)).toBeNull();
  });
  it("are dated when the filing was public, and stay in the Stocks tab", () => {
    expect(insider).toMatchObject({ id: `f4:${ACC}`, tab: "stocks", source: "sec", at: Date.parse("2026-10-26T14:12:44Z"), wallet: null });
    expect(fund.at).toBe(Date.parse("2026-11-14T21:00:00Z"));
  });
  it("Stocks is a tab only once FEATURES_READY lists it; Crypto never yet", () => {
    expect(liveTabs({})).toEqual(["sports", "markets"]);
    expect(liveTabs({ FEATURES_READY: "feed,stocks,crypto" })).toEqual(["sports", "markets", "stocks"]);
    expect(readyFeatures({ FEATURES_READY: "crypto" }).has("crypto")).toBe(false);
  });
});

describe("SEC client", () => {
  it("needs a User-Agent with a name and an email", () => {
    expect(secUserAgent({})).toBeNull();
    expect(secUserAgent({ SEC_USER_AGENT: "Insidir" })).toBeNull();
    expect(secUserAgent({ SEC_USER_AGENT: "Aethric LLC hello@aethric.llc" })).toBe("Aethric LLC hello@aethric.llc");
  });
  it("only reaches the EDGAR paths this feature reads", () => {
    expect(allowedSecUrl("https://data.sec.gov/submissions/CIK0001067983.json")).toBe(true);
    expect(allowedSecUrl("https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/index.json")).toBe(true);
    expect(allowedSecUrl("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom&count=100&start=100")).toBe(true);
    expect(allowedSecUrl("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1")).toBe(false);
    expect(allowedSecUrl("https://www.sec.gov/files/company_tickers.json")).toBe(false);
    expect(allowedSecUrl("http://data.sec.gov/submissions/CIK0001067983.json")).toBe(false);
    expect(allowedSecUrl("https://efts.sec.gov/LATEST/search-index?q=house")).toBe(false);
  });
  it("sends the User-Agent and stays under 10 requests a second", async () => {
    const seen: Array<{ at: number; ua: string | null }> = [];
    const fake = async (_url: string, init?: RequestInit) => {
      seen.push({ at: Date.now(), ua: new Headers(init?.headers).get("User-Agent") });
      return new Response("{}", { status: 200 });
    };
    const sec = new SecClient("Aethric LLC hello@aethric.llc", fake as typeof fetch);
    const start = Date.now();
    await Promise.all(Array.from({ length: 12 }, () => sec.json("https://data.sec.gov/submissions/CIK0001067983.json")));
    expect(seen.every(s => s.ua === "Aethric LLC hello@aethric.llc")).toBe(true);
    // 12 requests at one per 125 ms take at least 11 gaps.
    expect(Date.now() - start).toBeGreaterThanOrEqual(11 * 125 - 20);
    for (let i = 10; i < seen.length; i++) expect(seen[i]!.at - seen[i - 10]!.at).toBeGreaterThanOrEqual(1000 - 20);
  });
  it("waits and retries on 429", async () => {
    let n = 0;
    const fake = async () => (++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : new Response("<ok/>", { status: 200 }));
    const sec = new SecClient("Aethric LLC hello@aethric.llc", fake as unknown as typeof fetch, 1);
    expect(await sec.text("https://www.sec.gov/Archives/edgar/data/1/000000000126000001/a.xml")).toBe("<ok/>");
    expect(sec.stats.throttled).toBe(1);
  });
});
