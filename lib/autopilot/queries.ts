/* What /autopilot and the ticket page read: a member's rules with their paper portfolios and backtests, their log
 * (matches and skips), and one match's ticket. The paper portfolio of a rule: every match it sent (or held for quiet
 * hours), bought at Kalshi's ask then + 1¢ with the match's stake, held to settlement or sold at Kalshi's bid when the
 * wallet exited. Losses count in full; Kalshi's fees aren't taken off. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { autopilotBacktests, autopilotMatches, autopilotRules } from "@/lib/db/schema";
import type { Backtest } from "./backtest";
import { specKey } from "./backtest";
import { cleanSpec, type RuleSpec } from "./rules";

type MatchRow = typeof autopilotMatches.$inferSelect;
export interface Paper { matches: number; open: number; won: number; lost: number; void: number; exited: number; staked: number; net: number }

/** One paper position's P&L, or null while open. Pure. */
export function paperPnl(m: Pick<MatchRow, "stake" | "paperEntry" | "exitAt" | "exitPrice" | "result">): number | null {
  if (!m.stake || !m.paperEntry) return null;
  const contracts = Math.floor(m.stake / m.paperEntry + 1e-9), cost = contracts * m.paperEntry;
  if (m.exitAt && m.exitPrice !== null) return contracts * m.exitPrice - cost;
  if (m.result === "won") return contracts - cost;
  if (m.result === "lost") return -cost;
  if (m.result === "void") return 0;
  return null;
}

/** A rule's paper portfolio from its matches. Pure. */
export function paper(rows: readonly Pick<MatchRow, "status" | "stake" | "paperEntry" | "exitAt" | "exitPrice" | "result">[]): Paper {
  const p: Paper = { matches: 0, open: 0, won: 0, lost: 0, void: 0, exited: 0, staked: 0, net: 0 };
  for (const m of rows) {
    if (m.status !== "sent" && m.status !== "quiet") continue;
    p.matches++;
    const pnl = paperPnl(m);
    if (pnl === null) { p.open++; continue; }
    if (m.exitAt && m.exitPrice !== null) p.exited++; else p[m.result as "won" | "lost" | "void"]++;
    if (m.result !== "void" || m.exitAt) { p.staked += Math.floor(m.stake! / m.paperEntry! + 1e-9) * m.paperEntry!; p.net += pnl; }
  }
  p.staked = Math.round(p.staked * 100) / 100; p.net = Math.round(p.net * 100) / 100;
  return p;
}

interface RuleView { id: number; name: string; starter: string | null; active: boolean; spec: RuleSpec; paper: Paper; backtest: Backtest | null }

export async function rulesFor(db: Db, userId: string): Promise<RuleView[]> {
  const rules = await db.select().from(autopilotRules).where(eq(autopilotRules.userId, userId)).orderBy(desc(autopilotRules.createdAt));
  if (!rules.length) return [];
  const ms = await db.select().from(autopilotMatches).where(inArray(autopilotMatches.ruleId, rules.map(r => r.id)));
  const specs = rules.map(r => cleanSpec(r.spec));
  const bts = await backtestsFor(db, specs);
  return rules.map((r, i) => ({ id: r.id, name: r.name, starter: r.starter, active: r.active, spec: specs[i]!, paper: paper(ms.filter(m => m.ruleId === r.id)), backtest: bts.get(specKey(specs[i]!)) ?? null }));
}

export async function backtestsFor(db: Db, specs: readonly RuleSpec[]): Promise<Map<string, Backtest>> {
  const keys = [...new Set(specs.map(specKey))];
  if (!keys.length) return new Map();
  return new Map((await db.select().from(autopilotBacktests).where(inArray(autopilotBacktests.key, keys))).map(b => [b.key, b.result]));
}

/** The member's Autopilot log, newest first: matches pushed, held and skipped. */
export async function logFor(db: Db, userId: string, limit = 50): Promise<Array<MatchRow & { ruleName: string }>> {
  const r = await db.select({ m: autopilotMatches, name: autopilotRules.name }).from(autopilotMatches).leftJoin(autopilotRules, eq(autopilotRules.id, autopilotMatches.ruleId))
    .where(eq(autopilotMatches.userId, userId)).orderBy(desc(autopilotMatches.matchedAt)).limit(limit);
  return r.map(x => ({ ...x.m, ruleName: x.name ?? "A deleted rule" }));
}

/** One match, only for its member. */
export async function matchFor(db: Db, id: number, userId: string): Promise<(MatchRow & { ruleName: string }) | null> {
  const r = await db.select({ m: autopilotMatches, name: autopilotRules.name }).from(autopilotMatches).leftJoin(autopilotRules, eq(autopilotRules.id, autopilotMatches.ruleId))
    .where(and(eq(autopilotMatches.id, id), eq(autopilotMatches.userId, userId))).limit(1);
  return r[0] ? { ...r[0].m, ruleName: r[0].name ?? "A deleted rule" } : null;
}

export const MAX_RULES = 20;
