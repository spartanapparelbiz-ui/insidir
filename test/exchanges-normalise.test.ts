import { describe, expect, it } from "vitest";
import { POLYMARKET_RATES } from "@/lib/fees";
import { kalshiCategory, normaliseCategory } from "@/lib/exchanges/categories";
import { strikeFromText, subjectFromKalshiSeries } from "@/lib/exchanges/strike";
import { list, num, epochMs } from "@/lib/exchanges/parse";

describe("categories", () => {
  it("maps tags to the fee categories, most specific first", () => {
    expect(normaliseCategory(["Politics", "Mentions"])).toBe("mentions");
    expect(normaliseCategory(["politics", "geopolitics", "ukraine"])).toBe("geopolitics");
    expect(normaliseCategory(["Sports", "NBA"])).toBe("sports");
    expect(normaliseCategory(["Crypto Prices", "Bitcoin"])).toBe("crypto");
    expect(normaliseCategory(["Pop Culture"])).toBe("culture");
    expect(normaliseCategory(["fed-rates"])).toBe("economics");
    expect(normaliseCategory([])).toBe("other");
    expect(normaliseCategory(["Something new"])).toBe("other");
  });

  it("maps Kalshi's category names", () => {
    expect(kalshiCategory("Climate and Weather")).toBe("weather");
    expect(kalshiCategory("Financials")).toBe("finance");
    expect(kalshiCategory("Science and Technology")).toBe("tech");
    expect(kalshiCategory("World")).toBe("geopolitics");
    expect(kalshiCategory(null, "Entertainment")).toBe("culture");
  });

  it("only produces keys lib/fees.ts knows", () => {
    const labels = ["Politics", "Sports", "Crypto", "Economy", "Finance", "Tech", "Culture", "Weather", "Geopolitics", "Mentions", "Combos", "x"];
    for (const l of labels) expect(Object.keys(POLYMARKET_RATES)).toContain(normaliseCategory([l]));
  });
});

describe("strikes from text", () => {
  it("reads above / below / between with a subject", () => {
    expect(strikeFromText("Will Bitcoin be above $100,000 on Oct 31?")).toEqual({ kind: "above", value: 100000, upper: null, subject: "btc" });
    expect(strikeFromText("↑ 120k", "Bitcoin price")).toEqual({ kind: "above", value: 120000, upper: null, subject: "btc" });
    expect(strikeFromText("$100k-$105k", "Bitcoin price")).toEqual({ kind: "between", value: 100000, upper: 105000, subject: "btc" });
    expect(strikeFromText("Ethereum below $3,000?")).toEqual({ kind: "below", value: 3000, upper: null, subject: "eth" });
    expect(strikeFromText("4.25% or higher", "Fed funds rate")).toEqual({ kind: "above", value: 4.25, upper: null, subject: "fed-funds-rate" });
  });

  it("is conservative: no subject or a time range is not a strike", () => {
    expect(strikeFromText("Above 100")).toBeNull();
    expect(strikeFromText("Bitcoin Up or Down 3:00PM-4:00PM ET")).toBeNull();
  });

  it("reads Kalshi series subjects", () => {
    expect(subjectFromKalshiSeries("KXBTCD")).toBe("btc");
    expect(subjectFromKalshiSeries("KXHIGHNY")).toBe("nyc-high-temp");
    expect(subjectFromKalshiSeries("KXINXU")).toBe("spx");
    expect(subjectFromKalshiSeries("KXWEIRD")).toBe("kxweird");
  });
});

describe("defensive readers", () => {
  it("read numbers, arrays and times in the shapes venues send", () => {
    expect(num("0.4500")).toBe(0.45);
    expect(num("$1,000")).toBe(1000);
    expect(num("abc")).toBeNull();
    expect(list('["a","b"]')).toEqual(["a", "b"]);
    expect(list("not json")).toEqual([]);
    expect(epochMs(1730000000)).toBe(1730000000000);
    expect(epochMs("2025-01-01T00:00:00Z")).toBe(Date.UTC(2025, 0, 1));
  });
});
