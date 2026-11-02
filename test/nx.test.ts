/* The new design system's pure parts: categories, sparkline sampling, chip text, the election switch, number formats,
 * and the palette's contrast (WCAG AA). */
import { describe, expect, it } from "vitest";
import { catOf, chipText, downsample, ELECTION_END, electionMode } from "@/lib/nx/data";
import { fmt } from "@/lib/nx/fmt";

describe("categories", () => {
  it("from the tab, the venue's category, then the words", () => {
    expect(catOf({ tab: "sports", category: "sports" })).toBe("sports");
    expect(catOf({ tab: "markets", category: "politics" })).toBe("elections");
    expect(catOf({ tab: "crypto", category: null })).toBe("economy");
    expect(catOf({ tab: "markets", category: "geopolitics" })).toBe("world");
    expect(catOf({ tab: "markets", category: "tech" })).toBe("culture");
    expect(catOf({ tab: "markets", category: null, text: "Which party wins Senate control?" })).toBe("elections");
    expect(catOf({ tab: "markets", category: null, text: "Fed decision in December?" })).toBe("economy");
    expect(catOf({ tab: "stocks", category: null })).toBeNull();
  });
});

describe("sparklines, chips, the election switch, formats", () => {
  const NOW = Date.UTC(2026, 10, 2);
  it("a sparkline is the last week's points, evenly sampled; under two points, none", () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ t: NOW - (200 - i) * 3_600_000, p: i / 200 }));
    const s = downsample(pts, NOW, 7, 32);
    expect(s).toHaveLength(32);
    expect(s[0]).toBeCloseTo(32 / 200, 2);
    expect(s.at(-1)).toBeCloseTo(199 / 200, 3);
    expect(downsample([{ t: NOW - 1000, p: 0.5 }], NOW)).toEqual([]);
    expect(downsample([{ t: NOW - 30 * 86_400_000, p: 0.5 }, { t: NOW - 29 * 86_400_000, p: 0.6 }], NOW)).toEqual([]);
  });
  it("chips use a short event name, else the market's title, trimmed", () => {
    expect(chipText({ title: "Which party wins Senate control in 2026?", event: "Senate control" })).toBe("Senate control");
    expect(chipText({ title: "Chiefs vs. Broncos", event: "NFL: Kansas City Chiefs at Denver Broncos, week 9, Sunday afternoon game" })).toBe("Chiefs vs. Broncos");
    expect(chipText({ title: "A".repeat(60), event: null })).toHaveLength(39);
  });
  it("the election framing holds through Nov 4 (ET) and ends at midnight", () => {
    expect(electionMode(Date.parse("2026-11-03T23:00:00-05:00"))).toBe(true);
    expect(electionMode(Date.parse("2026-11-04T23:59:00-05:00"))).toBe(true);
    expect(electionMode(ELECTION_END)).toBe(false);
  });
  it("money, cents, percents; a loss always carries a minus sign", () => {
    expect(fmt(139_771, "usdExact")).toBe("$139,771");
    expect(fmt(412_000, "usd")).toBe("$412K");
    expect(fmt(-1_200_000, "usd")).toBe("−$1.2M");
    expect(fmt(0.69, "cents")).toBe("69¢");
    expect(fmt(0.581, "pct")).toBe("58%");
  });
});

describe("the palette meets WCAG AA", () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]; return (x + 0.05) / (y + 0.05); };
  it.each([
    ["text on background", "#FFFFFF", "#0A0C10", 7], ["muted on background", "#9BA3AE", "#0A0C10", 4.5], ["muted on panels", "#9BA3AE", "#14171C", 4.5],
    ["accent on background", "#22C58B", "#0A0C10", 4.5], ["dark text on the accent button", "#0A0C10", "#22C58B", 4.5], ["red on background", "#F0565B", "#0A0C10", 4.5],
    ["red on panels", "#F0565B", "#14171C", 4.5], ["accent on panels", "#22C58B", "#14171C", 4.5],
  ])("%s", (_n, fg, bg, min) => { expect(ratio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number); });
});
