/* Bet Briefings, cached (terminal.briefings): one per market, side and position hash. A briefing is rebuilt only when
 * the positions on the market changed (a wallet in, out, or its money moved) or the price moved 3¢ or more since it
 * was written; otherwise the stored one is served. The model's spend counts against its own monthly key, capped at a
 * third of the analyst's monthly cap (ANALYST_MONTHLY_USD); past it, and without a model, the template writes it.
 * Also "What we told you" (terminal.told_log): each member's briefing logged once per market per day. Server only. */
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { analystConfigured } from "@/lib/analyst/llm";
import { notesCapUsd } from "@/lib/analyst/store";
import { dbUsageStore } from "@/lib/worker/store";
import { buildBriefingFacts, SECTION_KEYS, SECTION_TITLES, type BriefingFacts, type BuildOpts, type SectionKey, type Side, type UserPosition } from "./facts";
import { writeSections } from "./write";

export const REPRICE = 0.03;
export interface Briefing {
  marketId: string; title: string; labels: BriefingFacts["labels"]; side: Side | null; price: number | null; result: BriefingFacts["result"];
  sections: Array<{ key: SectionKey; title: string; lines: string[] }>;
  free: BriefingFacts["free"];
  origin: "model" | "template"; createdAt: number;
}

/** What the briefing's numbers depend on besides the price: every open position's wallet, side and money, and the
 *  viewer's own position. */
export function positionHash(positions: BriefingFacts["positions"], position?: UserPosition | null, result: BriefingFacts["result"] = null): string {
  const key = positions.map(p => `${p.wallet}:${p.side}:${p.dollars}`).sort().join("|") + (position ? `#${position.side}:${position.price}:${position.amount}` : "") + (result ? `!${result}` : "");
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/** Whether a stored briefing is still good: same positions, price within 3¢ (and both with or both without a price). Pure. */
export function stillGood(stored: { positionHash: string; price: number | null }, hash: string, price: number | null): boolean {
  if (stored.positionHash !== hash) return false;
  if (stored.price === null || price === null) return stored.price === price;
  return Math.abs(stored.price - price) < REPRICE;
}

const monthKey = (now: number) => `${new Date(now).toISOString().slice(0, 7)}:briefing`;

function toBriefing(f: BriefingFacts, sections: Record<string, string[]>, origin: "model" | "template", createdAt: number): Briefing {
  return {
    marketId: f.marketId, title: f.title, labels: f.labels, side: f.side, price: f.price, result: f.result, free: f.free, origin, createdAt,
    sections: SECTION_KEYS.map(k => ({ key: k, title: SECTION_TITLES[k], lines: sections[k] ?? f.sections.find(s => s.key === k)?.lines ?? [] })),
  };
}

/** The briefing for a market (and side, and the viewer's position), from the cache or built now. Null when Insidir has
 *  no bet on the market at all. */
export async function getBriefing(db: Db, marketId: string, now: number, o: BuildOpts = {}): Promise<Briefing | null> {
  const facts = await buildBriefingFacts(db, marketId, now, o);
  if (!facts) return null;
  const hash = positionHash(facts.positions, o.position, facts.result);
  const key = `${marketId}|${o.side ?? "-"}|${hash}`;
  const row = (await db.execute(sql`select position_hash, price, sections, origin, created_at from terminal.briefings where key = ${key}`).catch(() => ({ rows: [] }))).rows[0] as
    { position_hash: string; price: number | null; sections: Record<string, string[]>; origin: "model" | "template"; created_at: string } | undefined;
  if (row && stillGood({ positionHash: row.position_hash, price: row.price === null ? null : Number(row.price) }, hash, facts.price)) {
    return toBriefing(facts, row.sections, row.origin, new Date(row.created_at).getTime());
  }
  const usage = dbUsageStore(db);
  const over = (await usage.getMonthSpendUsd(monthKey(now)).catch(() => 0)) >= notesCapUsd() / 3;
  const w = await writeSections(facts.sections, { allowModel: analystConfigured() && !over });
  if (w.costUsd) await usage.addSpendUsd(monthKey(now), w.costUsd).catch(() => undefined);
  await db.execute(sql`insert into terminal.briefings (key, market_id, side, position_hash, price, facts, sections, origin, model, cost_usd, created_at)
    values (${key}, ${marketId}, ${o.side ?? null}, ${hash}, ${facts.price}, ${JSON.stringify(facts)}::jsonb, ${JSON.stringify(w.sections)}::jsonb, ${w.origin}, ${w.model}, ${w.costUsd}, ${new Date(now)})
    on conflict (key) do update set price = excluded.price, facts = excluded.facts, sections = excluded.sections, origin = excluded.origin, model = excluded.model,
      cost_usd = terminal.briefings.cost_usd + excluded.cost_usd, created_at = excluded.created_at`).catch(e => console.error("briefing save", e instanceof Error ? e.message : e));
  return toBriefing(facts, w.sections, w.origin, now);
}

/** "What we told you": a member's briefing, once per market per ET day. */
export async function logTold(db: Db, userId: string, b: Briefing, now: number): Promise<void> {
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const seen = (await db.execute(sql`select 1 from terminal.told_log where user_id = ${userId} and kind = 'briefing' and market_id = ${b.marketId}
    and (created_at at time zone 'America/New_York')::date = ${day}::date limit 1`)).rows.length;
  if (seen) return;
  const read = b.sections.find(s => s.key === "read")?.lines ?? [];
  await db.execute(sql`insert into terminal.told_log (id, user_id, kind, market_id, market_title, side, price, headline, body, facts, created_at)
    values (${"tl_" + randomBytes(9).toString("base64url")}, ${userId}, 'briefing', ${b.marketId}, ${b.title}, ${b.side}, ${b.price},
      ${b.side ? `${b.title}: ${b.labels[b.side]}` : b.title}, ${read.join(" ")}, ${JSON.stringify({ sections: b.sections.map(s => ({ key: s.key, lines: s.lines })) })}::jsonb, ${new Date(now)})`);
}
