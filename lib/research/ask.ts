/* One Research question from a viewer, with the limits around it: visitors 3 a day on delayed data, members
 * RESEARCH_MEMBER_DAILY (default 200, fair use) on live data; each member's model spend capped at
 * RESEARCH_USER_MONTHLY_USD (default $3) and all of Research at RESEARCH_MONTHLY_USD (default $60), past which the
 * planner answers without the model; identical questions within 5 minutes answered from the last answer. Every
 * question is logged with its cost (terminal.research_queries). Server only. */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { researchQueries } from "@/lib/db/schema";
import { analystConfigured } from "@/lib/analyst/llm";
import { dbUsageStore } from "@/lib/worker/store";
import { research, type Answer } from "./run";

export const VISITOR_DAILY = 3;
export const memberDaily = (): number => Number(process.env.RESEARCH_MEMBER_DAILY ?? 200);
export const userMonthlyUsd = (): number => Number(process.env.RESEARCH_USER_MONTHLY_USD ?? 3);
export const monthlyUsd = (): number => Number(process.env.RESEARCH_MONTHLY_USD ?? 60);
export const CACHE_MS = 5 * 60_000;
const DAY = 86_400_000;
const month = (now: number) => new Date(now).toISOString().slice(0, 7);

export const keyOf = (q: string, live: boolean, wallet: string | null) =>
  createHash("sha256").update(`${q.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "")}|${live ? "live" : "delayed"}|${wallet ?? ""}`).digest("hex").slice(0, 32);

export type AskResult = { ok: true; id: number; answer: Answer; cached: boolean; remaining: number | null } | { ok: false; reason: "limit"; remaining: 0 };

export async function ask(db: Db, o: { question: string; userId: string | null; visitorId: string | null; member: boolean; live: boolean; until: number; now: number; wallet?: string | null; f?: typeof fetch }): Promise<AskResult> {
  const who = o.userId ? eq(researchQueries.userId, o.userId) : o.visitorId ? eq(researchQueries.visitorId, o.visitorId) : sql`false`;
  const today = Number((await db.select({ n: sql<number>`count(*)::int` }).from(researchQueries).where(and(who, gte(researchQueries.createdAt, new Date(o.now - DAY)))))[0]?.n ?? 0);
  const cap = o.member ? memberDaily() : VISITOR_DAILY;
  if (today >= cap) return { ok: false, reason: "limit", remaining: 0 };
  const key = keyOf(o.question, o.live, o.wallet ?? null);
  const hit = (await db.select().from(researchQueries).where(and(eq(researchQueries.key, key), gte(researchQueries.createdAt, new Date(o.now - CACHE_MS)), sql`${researchQueries.answer} is not null`))
    .orderBy(desc(researchQueries.createdAt)).limit(1))[0];
  let answer: Answer, cached = false;
  if (hit) { answer = hit.answer as Answer; cached = true; }
  else {
    const usage = dbUsageStore(db), mk = `${month(o.now)}:research`;
    const mine = o.userId ? Number((await db.select({ c: sql<number>`coalesce(sum(cost_usd), 0)::float` }).from(researchQueries).where(and(eq(researchQueries.userId, o.userId), gte(researchQueries.createdAt, new Date(`${month(o.now)}-01T00:00:00Z`)))))[0]?.c ?? 0) : 0;
    const useModel = analystConfigured() && (await usage.getMonthSpendUsd(mk)) < monthlyUsd() && (!o.userId || mine < userMonthlyUsd());
    answer = await research(db, o.question, { now: o.now, until: o.until, live: o.live, wallet: o.wallet, useModel, f: o.f });
    if (answer.costUsd) await usage.addSpendUsd(mk, answer.costUsd);
  }
  const [row] = await db.insert(researchQueries).values({ userId: o.userId, visitorId: o.userId ? null : o.visitorId, question: o.question.slice(0, 300), key, answer, costUsd: cached ? 0 : answer.costUsd, cached })
    .returning({ id: researchQueries.id });
  console.log(`research: ${cached ? "cache" : answer.origin} ${answer.model ?? "-"} $${(cached ? 0 : answer.costUsd).toFixed(5)} rows=${answer.tables.reduce((a, t) => a + t.rows.length, 0)}`);
  return { ok: true, id: row!.id, answer, cached, remaining: o.member ? null : Math.max(0, cap - today - 1) };
}

/** A logged answer, for its owner (the CSV export). */
export async function answerById(db: Db, id: number, userId: string): Promise<Answer | null> {
  const r = (await db.select().from(researchQueries).where(and(eq(researchQueries.id, id), eq(researchQueries.userId, userId))).limit(1))[0];
  return (r?.answer as Answer | undefined) ?? null;
}

/** The answer's tables as CSV: one block per table, a header row, quoted cells. */
export function answerCsv(a: Answer): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return a.tables.map(t => [q(t.title), t.columns.map(q).join(","), ...t.rows.map(r => r.map(c => q(c.text)).join(","))].join("\n")).join("\n\n") + "\n";
}
