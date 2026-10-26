/* Curated logical implications between markets on the same venue ("wins the NBA title ⇒ wins its conference").
 * Pure. The rules live in config/implications.ts (how to add one is documented there).
 *
 * For each rule, every market whose title matches the antecedent pattern is an antecedent A. The consequent
 * template is filled with A's captures and compiled to a case-insensitive RegExp; every other active market on the
 * same venue whose title matches it is a consequent B. Then the same lock as ladders: YES on B + NO on A pays at
 * least $1 in every outcome.
 *
 * Consequent template syntax: regex source where
 *   {name}       inserts capture group `name` from the antecedent match, regex-escaped ("" if it didn't capture);
 *   {name:map}   inserts entityMap[capture, lower-cased and trimmed], regex-escaped; no entry → the rule is skipped.
 * Cross-venue implications are not searched (same venue only). */

import type { Book, Opportunity, Safety, VMarket, Venue } from "../types";
import { IMPLICATION_RULES } from "../../config/implications";
import type { FillOptions } from "./book";
import { lockImplication, type Implication } from "./common";

/** Default largest gap between the two markets' close times (different seasons shouldn't pair): 180 days. */
export const IMPLICATION_MAX_CLOSE_GAP_MS = 180 * 86_400_000;

export interface ImplicationRule {
  id: string;
  description: string;
  antecedent: { titlePattern: RegExp; venue?: Venue };
  consequent: { titlePattern: string };
  entityMap?: Record<string, string>;
  /** Default "green". Use "yellow" when the implication has edge cases (and say which in safetyNotes). */
  safety?: Safety;
  safetyNotes?: string[];
  /** Override IMPLICATION_MAX_CLOSE_GAP_MS. */
  maxCloseGapMs?: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normTitle(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

/** Fill a consequent template with an antecedent match. Null when a mapped entity is missing. */
export function fillTemplate(template: string, match: RegExpMatchArray, entityMap?: Record<string, string>): RegExp | null {
  let missing = false;
  const source = template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(:map)?\}/g, (_all, name: string, map?: string) => {
    const captured = match.groups?.[name];
    if (map) {
      const v = captured == null ? undefined : entityMap?.[captured.trim().toLowerCase()];
      if (v == null) { missing = true; return ""; }
      return escapeRegExp(v);
    }
    return captured == null ? "" : escapeRegExp(captured.trim());
  });
  if (missing) return null;
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

export function findRuleImplications(markets: readonly VMarket[], rules: readonly ImplicationRule[] = IMPLICATION_RULES): Implication[] {
  const out: Implication[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const ante = new RegExp(rule.antecedent.titlePattern.source, rule.antecedent.titlePattern.flags.replace(/[gy]/g, ""));
    const maxGap = rule.maxCloseGapMs ?? IMPLICATION_MAX_CLOSE_GAP_MS;
    for (const a of markets) {
      if (rule.antecedent.venue && a.venue !== rule.antecedent.venue) continue;
      const match = normTitle(a.title).match(ante);
      if (!match) continue;
      const cons = fillTemplate(rule.consequent.titlePattern, match, rule.entityMap);
      if (!cons) continue;
      for (const b of markets) {
        if (b.venue !== a.venue || b.id === a.id) continue;
        if (!cons.test(normTitle(b.title))) continue;
        if (a.closeTime != null && b.closeTime != null && Math.abs(a.closeTime - b.closeTime) > maxGap) continue;
        const key = `${a.venue}:${a.id}>${b.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          antecedent: a,
          consequent: b,
          reason: `${rule.description}: "${a.title}" implies "${b.title}".`,
          ruleId: rule.id,
          safety: rule.safety ?? "green",
          safetyNotes: [...(rule.safetyNotes ?? [])],
        });
      }
    }
  }
  return out;
}

export function findImplications(
  markets: readonly VMarket[],
  books: ReadonlyMap<string, Book>,
  now: number,
  rules: readonly ImplicationRule[] = IMPLICATION_RULES,
  opts?: FillOptions,
): Opportunity[] {
  const out: Opportunity[] = [];
  for (const imp of findRuleImplications(markets, rules)) {
    const opp = lockImplication(imp, books, "implication", now, opts);
    if (opp) out.push(opp);
  }
  return out;
}
