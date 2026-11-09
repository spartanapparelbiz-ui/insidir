import { describe, expect, it } from "vitest";
import { checkSections, lineProblems, writeSections, type FactSection } from "@/lib/briefing/write";

const FACTS: FactSection[] = [
  { key: "cost", title: "What it costs and what it pays", lines: ["76¢ means the market says 76%. $100 buys 131 shares. They pay $131 if yes, $0 if not."] },
  { key: "who", title: "Who's on each side", lines: ["3 wallets up $1M+ are on YES with $412K.", "0x7c3d…5c6b is 14–6 on politics, $100 on each: +$880."] },
];
const ok = (text: string) => ({ ok: true, text, toolCalls: [], costUsd: 0.001, model: "m", empties: 0, empty: false });

describe("the number check", () => {
  it("passes numbers from the facts, rejects any other, and bans advice", () => {
    const allowed = new Set(["76", "$131", "131", "3", "$412K"]);
    expect(lineProblems("At 76¢, $100 gets you 131 shares paying $131 if it wins.", new Set([...allowed, "$100"]))).toEqual([]);
    expect(lineProblems("At 77¢ it pays $131.", allowed)).toEqual(["number not in the facts: 77"]);
    expect(lineProblems("You should bet YES, it will win.", allowed).length).toBeGreaterThan(0);
    expect(lineProblems("Alerts arrive instantly.", allowed)).toContain('banned: "instantly"');
    expect(lineProblems("A strong signal.", allowed)).toContain('banned: "signal"');
  });
  it("keeps the model's section when every number checks out, the template where one doesn't", () => {
    const c = checkSections(FACTS, {
      cost: ["At 76¢ the market says 76%: $100 buys 131 shares, and they pay $131 if yes, $0 if not."],
      who: ["4 big wallets are on YES."],
    });
    expect(c.sections.cost).toEqual(["At 76¢ the market says 76%: $100 buys 131 shares, and they pay $131 if yes, $0 if not."]);
    expect(c.sections.who).toEqual(FACTS[1]!.lines);
    expect(c.problems).toEqual(["who: number not in the facts: 4"]);
  });
});

describe("writeSections", () => {
  it("uses the model's sentences when they pass", async () => {
    const w = await writeSections(FACTS, { chatFn: async () => ok(JSON.stringify({ sections: { cost: ["$100 at 76¢ buys 131 shares: $131 if yes, $0 if not. That's the market saying 76%."], who: FACTS[1]!.lines } })) });
    expect(w.origin).toBe("model");
    expect(w.sections.cost![0]).toContain("131 shares");
  });
  it("falls back to the template on bad JSON, an error or no model", async () => {
    expect((await writeSections(FACTS, { chatFn: async () => ok("not json") })).sections).toEqual({ cost: FACTS[0]!.lines, who: FACTS[1]!.lines });
    expect((await writeSections(FACTS, { chatFn: async () => ({ ...ok(""), ok: false, error: "no_key" }) })).origin).toBe("template");
    expect((await writeSections(FACTS, { allowModel: false })).origin).toBe("template");
  });
});
