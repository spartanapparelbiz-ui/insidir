/* Raw exchange titles never reach a reader: one formatter (lib/markets/title.ts) for every surface. */
import { describe, expect, it } from "vitest";
import { humanLine, humanTitle, relativeDay, shortName } from "@/lib/markets/title";

const NOW = Date.parse("2026-11-03T22:30:00Z"); // 5:30 PM ET, Nov 3

describe("human titles", () => {
  it("the board's raw titles", () => {
    expect(humanTitle({ title: "Will Paris Saint-Germain FC win on 2026-11-03?", now: NOW })).toEqual({ title: "PSG to win", when: "today" });
    expect(humanLine({ title: "Will FC Bayern München win on 2026-11-03?", now: NOW })).toBe("Bayern Munich to win · today");
    expect(humanLine({ title: "Will Club Atlético de Madrid win on 2026-11-04?", now: NOW })).toBe("Atlético Madrid to win · tomorrow");
    expect(humanLine({ title: "Will Manchester United FC win on 2026-11-07?", now: NOW })).toBe("Man United to win · Sat Nov 7");
    expect(humanTitle({ title: "Spread: Cavaliers (-4.5)", now: NOW }).title).toBe("Cavaliers −4.5");
    expect(humanTitle({ title: "Spread: Thunder (+16.5)", now: NOW }).title).toBe("Thunder +16.5");
  });
  it("leaves plain titles alone, keeps real questions", () => {
    expect(humanTitle({ title: "Hawks vs. Pacers", now: NOW }).title).toBe("Hawks vs. Pacers");
    expect(humanTitle({ title: "Which party will win the House in 2026?", now: NOW }).title).toBe("Which party will win the House in 2026?");
    expect(humanTitle({ title: "Will Republicans win Iowa and Kansas?", now: NOW }).title).toBe("Republicans to win Iowa and Kansas");
  });
  it("uses Polymarket's own short label when the title is still a question", () => {
    expect(humanTitle({ title: "Will the Fed cut rates 50+ bps in December?", groupItemTitle: "50+ bps cut", now: NOW }).title).toBe("50+ bps cut");
  });
  it("relative days and short names", () => {
    expect(relativeDay("2026-11-03", NOW)).toBe("today");
    expect(relativeDay("2026-11-02", NOW)).toBe("yesterday");
    expect(relativeDay("2026-11-10", NOW)).toBe("Tue Nov 10");
    expect(shortName("Real Madrid CF")).toBe("Real Madrid");
    expect(shortName("Arsenal FC")).toBe("Arsenal");
  });
  it("never leaves an ISO date", () => {
    for (const t of ["Will Arsenal FC win on 2026-11-03?", "Arsenal vs. Chelsea (2026-11-05)", "Bitcoin above 100k on 2026-12-01?", "NBA: Hawks - 2026-11-04"]) {
      expect(humanLine({ title: t, now: NOW })).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});
