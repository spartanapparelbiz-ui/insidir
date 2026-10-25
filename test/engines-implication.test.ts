import { describe, expect, it } from "vitest";
import { findImplications, findRuleImplications, fillTemplate, type ImplicationRule } from "@/lib/engines/implication";
import { IMPLICATION_RULES } from "@/config/implications";
import type { Book } from "@/lib/types";
import { DAY, L, NOW, ZERO_PM, book, key, market } from "./engines-fixtures";

const pm = (id: string, title: string, closeDays = 200) => market({ id, venue: "polymarket", fee: ZERO_PM, title, closeTime: NOW + closeDays * DAY });

describe("implication rules", () => {
  it("NBA title implies the right conference", () => {
    const ms = [
      pm("t", "Will the Boston Celtics win the 2026 NBA Finals?"),
      pm("e", "Will the Boston Celtics win the Eastern Conference?", 170),
      pm("w", "Will the Boston Celtics win the Western Conference?", 170),
      pm("o", "Will the Knicks win the Eastern Conference?", 170),
    ];
    const imps = findRuleImplications(ms, IMPLICATION_RULES);
    expect(imps.map((i) => `${i.antecedent.id}>${i.consequent.id}`)).toEqual(["t>e"]);
    expect(imps[0]!.ruleId).toBe("nba-title-implies-conference");
  });

  it("skips unknown entities and other venues", () => {
    const ms = [pm("t", "Will the Seattle Supersonics win the NBA Finals?"), pm("e", "Will the Seattle Supersonics win the Western Conference?")];
    expect(findRuleImplications(ms)).toEqual([]);
    const cross = [pm("t", "Will the Celtics win the NBA Finals?"), market({ id: "k", venue: "kalshi", title: "Will the Celtics win the Eastern Conference?" })];
    expect(findRuleImplications(cross)).toEqual([]);
  });

  it("presidential rule maps the candidate's party and is yellow", () => {
    const ms = [pm("p", "Will Gavin Newsom win the 2028 presidential election?", 740), pm("d", "Will Gavin Newsom win the 2028 Democratic presidential nomination?", 650), pm("r", "Will Gavin Newsom win the 2028 Republican presidential nomination?", 650)];
    const imps = findRuleImplications(ms);
    expect(imps.map((i) => i.consequent.id)).toEqual(["d"]);
    expect(imps[0]!.safety).toBe("yellow");
  });

  it("custom rule without a map, template escaping, and the lock", () => {
    const rule: ImplicationRule = {
      id: "test",
      description: "Test",
      antecedent: { titlePattern: /^will (?<x>.+) happen by june\?$/i },
      consequent: { titlePattern: "^will {x} happen by december\\?$" },
    };
    const a = pm("a", "Will A.B (c) happen by June?");
    const c = pm("c", "Will A.B (c) happen by December?");
    const decoy = pm("d", "Will AxB (c) happen by December?");
    const books = new Map<string, Book>([
      [key("polymarket", "c"), book({ yesAsks: [L(0.5, 10)] })],
      [key("polymarket", "a"), book({ noAsks: [L(0.45, 10)] })],
    ]);
    const opps = findImplications([a, c, decoy], books, NOW, [rule]);
    expect(opps).toHaveLength(1);
    expect(opps[0]!.kind).toBe("implication");
    expect(opps[0]!.legs.map((l) => [l.marketId, l.side])).toEqual([["c", "yes"], ["a", "no"]]);
    expect(opps[0]!.profit).toBeCloseTo(0.5, 9);
  });

  it("fillTemplate returns null when a mapped entity is missing", () => {
    const m = "Will X win".match(/^will (?<t>\w+) win$/i)!;
    expect(fillTemplate("{t:map}", m, {})).toBeNull();
    expect(fillTemplate("^{t}$", m)!.test("x")).toBe(true);
  });
});
