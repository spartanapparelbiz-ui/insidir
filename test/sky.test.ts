/* The skyline design system's pure parts: imagery (lib/sky/art.ts), people matching, the skyline's layout and words,
 * chips, the greeting, cents, and the palette's contrast. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { artFor, sideFirst } from "@/lib/sky/art";
import { matchPeople, peopleIn, type Legislator, type PersonRow } from "@/lib/sky/people-match";
import { ago, betLine, initials } from "@/lib/sky/sky-pure";
import { dedupeChips } from "@/lib/sky/landing";
import { hello, memberCats } from "@/lib/nx/member";
import { chipText, shortQuestion, type MarketCard } from "@/lib/nx/data";
import { fmt } from "@/lib/nx/fmt";

const NOW = Date.parse("2026-11-02T22:00:00Z");

describe("imagery for a market", () => {
  it("a game shows both teams' vendored logos, with their names for the fallback", () => {
    const a = artFor({ tab: "sports", league: "NFL", title: "Chargers vs. Rams", event: "Chargers vs. Rams", cat: "sports" });
    expect(a.kind).toBe("teams");
    if (a.kind !== "teams") return;
    expect(a.teams).toHaveLength(2);
    for (const t of a.teams) expect(t.src).toMatch(/^\/logos\/.+\.svg$/);
    expect(a.teams.map(t => t.name)).toEqual(["Chargers", "Rams"]);
  });

  it("a party market gets D and R rings; other elections a ballot icon; everything else its category's icon", () => {
    expect(artFor({ tab: "markets", league: null, title: "Which party will control the Senate after the 2026 midterms?", event: null, cat: "elections" })).toEqual({ kind: "parties", parties: ["D", "R"] });
    expect(artFor({ tab: "markets", league: null, title: "Texas Senate race 2026", event: null, cat: "elections" }).kind).toBe("parties");
    expect(artFor({ tab: "markets", league: null, title: "Will the Fed cut rates in December?", event: null, cat: "economy" })).toMatchObject({ kind: "icon", icon: "bank" });
    expect(artFor({ tab: "markets", league: null, title: "Who wins the Ballon d'Or?", event: null, cat: "culture" })).toMatchObject({ kind: "icon", icon: "spark" });
  });

  it("the side a bet backs comes first: the team it names, or the party (also for YES/NO on a party question)", () => {
    const game = artFor({ tab: "sports", league: "NFL", title: "Chargers vs. Rams", event: null, cat: "sports" });
    const first = (s: string) => { const a = sideFirst(game, s, "Chargers vs. Rams"); return a.kind === "teams" ? a.teams[0]!.name : null; };
    expect(first("Rams")).toBe("Rams");
    expect(first("Chargers")).toBe("Chargers");
    expect(first("Under 44.5")).toBe("Chargers");
    const parties = { kind: "parties" as const, parties: ["D", "R"] as Array<"D" | "R"> };
    const p = (side: string, title: string) => { const a = sideFirst(parties, side, title); return a.kind === "parties" ? a.parties[0] : null; };
    expect(p("Republicans", "Senate")).toBe("R");
    expect(p("Democrats", "Senate")).toBe("D");
    expect(p("Yes", "Will Republicans win the Iowa Senate race?")).toBe("R");
    expect(p("No", "Will Republicans win the Iowa Senate race?")).toBe("D");
  });

  it("monograms take initials", () => {
    expect(initials("Haley Stevens")).toBe("HS");
    expect(initials("Rams")).toBe("RA");
    expect(initials("KC")).toBe("KC");
    expect(initials("")).toBe("?");
  });
});

describe("people", () => {
  const legislators: Legislator[] = [
    { id: { bioguide: "S001215" }, name: { first: "Haley", last: "Stevens", official_full: "Haley M. Stevens" }, terms: [{ type: "rep", state: "MI", party: "Democrat" }] },
    { id: { bioguide: "C001098" }, name: { first: "Rafael", last: "Cruz", nickname: "Ted", official_full: "Ted Cruz" }, terms: [{ type: "sen", state: "TX", party: "Republican" }] },
  ];
  it("matches official names and first + last as whole words, with the party of the latest term", () => {
    const m = matchPeople(["Will Ted Cruz win the Texas Senate race?", "Haley Stevens vs. Mike Rogers"], legislators);
    expect(m.map(p => [p.bioguide, p.party])).toEqual([["S001215", "D"], ["C001098", "R"]]);
    expect(matchPeople(["Cruzado wins"], legislators)).toEqual([]);
  });
  it("finds the vendored people a title names, in order", () => {
    const rows: PersonRow[] = matchPeople(["Ted Cruz", "Haley Stevens"], legislators);
    expect(peopleIn("Stevens vs. Ted Cruz", rows).map(p => p.last)).toEqual(["Stevens", "Cruz"]);
    expect(peopleIn("Chargers vs. Rams", rows)).toEqual([]);
  });
  it("only official portraits are vendored, each with a people.json entry", () => {
    const people = JSON.parse(readFileSync("public/people/people.json", "utf8")) as PersonRow[];
    for (const p of people) expect(p.bioguide).toMatch(/^[A-Z]\d{6}$/);
  });
});

describe("big bets", () => {
  it("describes a bet in one line, as the tooltip shows it", () => {
    expect(betLine({ amount: 139_771, side: "Rams", price: 0.69, title: "Chargers vs. Rams", at: NOW - 4 * 60_000 }, NOW)).toBe("$139,771 · Rams · 69¢ · Chargers vs. Rams · 4m ago");
    expect(betLine({ amount: 65_000, side: "Titans", price: 0.65, title: "Titans", at: NOW - 20_000 }, NOW)).toBe("$65,000 · Titans · 65¢ · just now");
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
  });
});

const card = (title: string, event: string | null = null): MarketCard => ({ key: title, venue: "polymarket", id: title, title, event, cat: "elections", photo: null, logos: null, yesLabel: "Yes", noLabel: "No",
  proven: { yes: 0, no: 0 }, money: { yes: 1, no: 0 }, yesPrice: 0.5, volume24h: null, historyKey: null, spark: [], startAt: null, tab: "markets", league: null }) as unknown as MarketCard;

describe("chips and words", () => {
  it("shortens long party questions; keeps everything else", () => {
    expect(shortQuestion("Which party will control the Senate after the 2026 midterms?")).toBe("Senate control after the midterms");
    expect(shortQuestion("Will Republicans win the Iowa Senate race?")).toBe("Iowa Senate race");
    expect(shortQuestion("Will the Chiefs win the Super Bowl?")).toBe("Will the Chiefs win the Super Bowl?");
    expect(chipText(card("Chargers vs. Rams"))).toBe("Chargers vs. Rams");
  });
  it("five chips, no two with the same words", () => {
    const cs = [card("Chargers vs. Rams"), card("Chargers vs. Rams"), card("Spread: Chiefs (-1.5)", "Chiefs vs. Broncos"), card("Chiefs vs. Broncos"), card("A"), card("B"), card("C"), card("D")];
    const out = dedupeChips(cs);
    expect(out).toHaveLength(5);
    expect(new Set(out.map(chipText)).size).toBe(5);
  });
  it("greets by first name only when it looks like a name", () => {
    expect(hello("Good evening", "Jordan Ellis")).toBe("Good evening, Jordan.");
    expect(hello("Good evening", "user_e2e_pro_intl")).toBe("Good evening.");
    expect(hello("Good evening", null)).toBe("Good evening.");
    expect(hello("Good evening", "0xabc")).toBe("Good evening.");
  });
  it("a member's categories: sports answers are Sports, Elections is Elections", () => {
    expect(memberCats(["nfl", "nba", "elections"]).sort()).toEqual(["elections", "sports"]);
    expect(memberCats([])).toEqual([]);
  });
  it("prices keep a half cent (71.5¢) and drop a whole one's decimal (50¢)", () => {
    expect(fmt(0.715, "cents")).toBe("71.5¢");
    expect(fmt(0.5, "cents")).toBe("50¢");
    expect(fmt(0.9449999, "cents")).toBe("94.5¢");
  });
});

describe("the palette", () => {
  const css = readFileSync("app/sky.css", "utf8");
  const root = css.slice(0, css.indexOf("}", css.indexOf(":root")));
  const hex = (name: string) => { const m = new RegExp(`--sk-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(root); if (!m) throw new Error(name); return m[1]!; };
  const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  it("is the spec's colours", () => {
    expect([hex("bg"), hex("surface"), hex("raised"), hex("text"), hex("muted"), hex("ice"), hex("up"), hex("down"), hex("dem"), hex("rep")].map(h => h.toUpperCase()))
      .toEqual(["#070B14", "#0D1424", "#121B2E", "#F1F5FB", "#8B96AB", "#8FB8FF", "#3DD68C", "#FF6B6B", "#4C8DFF", "#FF5A5F"]);
  });
  it("text, muted, ice and the data colours read on every surface (WCAG AA, 4.5:1)", () => {
    for (const bg of ["bg", "surface", "raised"]) for (const fg of ["text", "muted", "ice", "up", "down"]) expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(4.5);
    // The white button's dark label.
    expect(contrast(hex("bg"), hex("text"))).toBeGreaterThanOrEqual(4.5);
  });
  it("no raw hex outside :root, and only Outfit and IBM Plex Mono", () => {
    expect(css.slice(css.indexOf("}", css.indexOf(":root")))).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/Outfit\(/); expect(layout).toMatch(/IBM_Plex_Mono\(/);
    expect(css).not.toMatch(/font-family:\s*["']?(?!var\()(?!inherit)[A-Za-z]/);
  });
});
