/* "Watch my bet": the positions a member asked Insidir to watch (terminal.watched_bets). Two ways in:
 *   addManual      a market (an Insidir or Polymarket link, a slug or a condition id), a side, the price paid and the
 *                  dollars in; shares = dollars ÷ price
 *   importAddress  their public Polymarket address: every open position from data-api.polymarket.com/v2/positions
 *                  (read-only, no keys; the v1 endpoints return 410), kept in sync on each import
 * and list (each with the price now and profit or loss) and remove. Server only, except readV2Positions (pure). */
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { watchedBets } from "@/lib/db/schema";
import { categoryOf, isCategory } from "@/lib/brand/categories";
import { resolveMarketSlug } from "@/lib/entities/resolve";
import { pnlNow } from "@/lib/briefing/math";

const DATA_API = "https://data-api.polymarket.com";
const GAMMA = "https://gamma-api.polymarket.com";
export const MAX_WATCHED = 200;
export const isAddress = (a: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const newId = () => "wb_" + randomBytes(9).toString("base64url");

/* ---------- Polymarket v2 positions (pure) ---------- */

export interface V2Position {
  conditionId: string; title: string; slug: string | null; eventSlug: string | null; outcome: string; side: "yes" | "no";
  size: number; avgPrice: number; cost: number; currentPrice: number | null; value: number | null; pnl: number | null;
  status: string; endDate: string | null;
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** One page of GET /v2/positions: {data: [...], pagination: {has_more, next_cursor}}. Names and pictures are dropped. */
export function readV2Positions(json: unknown): { positions: V2Position[]; next: string | null } {
  const o = typeof json === "object" && json ? (json as Record<string, unknown>) : {};
  const data = Array.isArray(o.data) ? o.data : [];
  const positions: V2Position[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || !raw) continue;
    const r = raw as Record<string, unknown>;
    const conditionId = str(r.condition_id), size = num(r.current_size) ?? num(r.size), avg = num(r.avg_price);
    if (!conditionId || !/^0x[0-9a-fA-F]{64}$/.test(conditionId) || size === null || avg === null) continue;
    const idx = num(r.outcome_index);
    positions.push({
      conditionId: conditionId.toLowerCase(), title: str(r.title) ?? "", slug: str(r.slug), eventSlug: str(r.event_slug), outcome: str(r.outcome) ?? (idx === 1 ? "No" : "Yes"),
      side: idx === 1 ? "no" : "yes", size, avgPrice: avg, cost: num(r.total_cost_usdc) ?? num(r.entry_cost_usdc) ?? size * avg,
      currentPrice: num(r.current_price), value: num(r.current_value), pnl: num(r.total_pnl) ?? num(r.unrealized_pnl), status: str(r.status) ?? "OPEN", endDate: str(r.end_date),
    });
  }
  const p = typeof o.pagination === "object" && o.pagination ? (o.pagination as Record<string, unknown>) : {};
  return { positions, next: p.has_more === true ? str(p.next_cursor) : null };
}

/** Every open position of an address (up to `maxPages` pages of 500). */
export async function fetchPositions(address: string, f: typeof fetch = fetch, maxPages = 10): Promise<V2Position[]> {
  const out: V2Position[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ user: address.toLowerCase(), limit: "500" });
    if (cursor) q.set("cursor", cursor);
    const res = await f(`${DATA_API}/v2/positions?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`positions: HTTP ${res.status}`);
    const page = readV2Positions(await res.json());
    out.push(...page.positions);
    if (!page.next) break;
    cursor = page.next;
  }
  return out.filter(p => p.status === "OPEN" && p.size > 0.5);
}

/* ---------- markets ---------- */

export interface MarketPick { id: string; title: string; yesLabel: string; noLabel: string; category: string; price: number | null }

const parseJsonList = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };

async function gammaMarket(slug: string, f: typeof fetch): Promise<{ id: string; title: string; outcomes: string[]; prices: number[]; event: string | null } | "several" | null> {
  const get = async (url: string) => { const r = await f(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };
  const pick = (m: Record<string, unknown>) => ({ id: String(m.conditionId).toLowerCase(), title: String(m.question ?? ""), outcomes: parseJsonList(m.outcomes), prices: parseJsonList(m.outcomePrices).map(Number), event: null });
  for (const closed of ["", "&closed=true"]) {
    const ms = await get(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}${closed}`);
    if (Array.isArray(ms) && ms[0]?.conditionId) return pick(ms[0]);
  }
  const ev = await get(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`);
  const markets = Array.isArray(ev) && Array.isArray(ev[0]?.markets) ? ev[0].markets as Array<Record<string, unknown>> : [];
  if (markets.length === 1 && markets[0]!.conditionId) return pick(markets[0]!);
  return markets.length > 1 ? "several" : null;
}

/** The market a member typed: an Insidir link, a Polymarket link, a slug or a condition id. */
export async function findMarket(db: Db, input: string, f: typeof fetch = fetch): Promise<MarketPick | { error: string }> {
  const raw = input.trim();
  if (!raw) return { error: "Paste a market link." };
  let slug = raw;
  const insidir = /\/market\/([^/?#\s]+)/.exec(raw);
  const poly = /polymarket\.com\/(?:[a-z-]+\/)?(?:event|market)\/([^?#\s]+)/i.exec(raw);
  let g: { id: string; title: string; outcomes: string[]; prices: number[] } | null = null;
  if (insidir) slug = insidir[1]!;
  else if (poly) {
    const parts = poly[1]!.split("/").filter(Boolean);
    const found = await gammaMarket(parts[parts.length - 1]!, f);
    if (found === "several") return { error: "That link is an event with several markets. Paste the market's own link (open the market, then copy its link)." };
    if (found) { g = found; slug = found.id; }
  }
  const ref = await resolveMarketSlug(db, slug).catch(() => null);
  const id = (ref?.id ?? g?.id ?? null)?.toLowerCase() ?? null;
  if (!id) return { error: "We couldn't find that market. Paste its Polymarket or Insidir link." };
  const h = (await db.execute(sql`select max(category) as category, coalesce(max(yes_label), max(case when outcome_side = 'yes' then outcome end)) as yes_label,
      coalesce(max(no_label), max(case when outcome_side = 'no' then outcome end)) as no_label, max(event_title) as event
    from terminal.millionaire_bets where market_id = ${id}`)).rows[0] as Record<string, string | null> | undefined;
  const info = (await db.execute(sql`select yes_price from terminal.market_info where source = 'polymarket' and market_id = ${id}`)).rows[0] as { yes_price: number | null } | undefined;
  const title = ref?.title ?? g?.title ?? id;
  const cat = h?.category && isCategory(h.category) ? h.category : categoryOf({ title, event: h?.event ?? null });
  const price = info?.yes_price ?? (g && Number.isFinite(g.prices[0]) ? g.prices[0]! : null);
  return { id, title, yesLabel: h?.yes_label ?? g?.outcomes[0] ?? "Yes", noLabel: h?.no_label ?? g?.outcomes[1] ?? "No", category: cat, price: price === null ? null : Number(price) };
}

/* ---------- watched bets ---------- */

export interface AddInput { market: string; side: "yes" | "no"; price: number; amount: number }
export async function addManual(db: Db, userId: string, input: AddInput, f: typeof fetch = fetch): Promise<{ id: string } | { error: string }> {
  if (!(input.price > 0 && input.price < 1)) return { error: "The price you paid is between 1¢ and 99¢." };
  if (!(input.amount > 0 && input.amount <= 10_000_000)) return { error: "Enter the dollars you put in." };
  const open = Number(((await db.execute(sql`select count(*)::int as n from terminal.watched_bets where user_id = ${userId} and removed_at is null and result is null`)).rows[0] as { n: number }).n);
  if (open >= MAX_WATCHED) return { error: `You're watching ${MAX_WATCHED} already.` };
  const m = await findMarket(db, input.market, f);
  if ("error" in m) return m;
  const id = newId();
  await db.insert(watchedBets).values({
    id, userId, marketId: m.id, marketTitle: m.title, category: m.category, side: input.side, outcome: input.side === "yes" ? m.yesLabel : m.noLabel,
    price: input.price, amount: input.amount, shares: input.amount / input.price, origin: "manual", lastPrice: null,
  });
  return { id };
}

/** Imports an address's open positions: new ones added, existing ones updated (price, size), none removed here. */
export async function importAddress(db: Db, userId: string, address: string, f: typeof fetch = fetch): Promise<{ added: number; updated: number } | { error: string }> {
  if (!isAddress(address)) return { error: "That isn't a Polymarket address (0x and 40 letters and numbers)." };
  const addr = address.trim().toLowerCase();
  let positions: V2Position[];
  try { positions = await fetchPositions(addr, f); } catch { return { error: "Polymarket didn't answer. Try again in a minute." }; }
  let added = 0, updated = 0;
  for (const p of positions.slice(0, MAX_WATCHED)) {
    if (!(p.avgPrice > 0 && p.avgPrice < 1)) continue;
    const known = (await db.execute(sql`select category, event_title as event from terminal.millionaire_bets where market_id = ${p.conditionId} limit 1`)).rows[0] as { category?: string; event?: string } | undefined;
    const category = known?.category && isCategory(known.category) ? known.category : categoryOf({ title: p.title, event: known?.event ?? null });
    const r = await db.execute(sql`insert into terminal.watched_bets (id, user_id, market_id, market_title, category, side, outcome, price, amount, shares, origin, address, last_price)
      values (${newId()}, ${userId}, ${p.conditionId}, ${p.title}, ${category}, ${p.side}, ${p.outcome}, ${p.avgPrice}, ${p.cost}, ${p.size}, 'address', ${addr}, null)
      on conflict (user_id, address, market_id, side) where address is not null
      do update set price = excluded.price, amount = excluded.amount, shares = excluded.shares, removed_at = null
      returning (xmax = 0) as inserted`);
    if ((r.rows[0] as { inserted?: boolean } | undefined)?.inserted) added++; else updated++;
  }
  return { added, updated };
}

export async function removeWatched(db: Db, userId: string, id: string): Promise<boolean> {
  const r = await db.update(watchedBets).set({ removedAt: new Date() }).where(and(eq(watchedBets.userId, userId), eq(watchedBets.id, id), isNull(watchedBets.removedAt))).returning({ id: watchedBets.id });
  return r.length > 0;
}

export interface WatchedView {
  id: string; marketId: string; title: string; category: string | null; side: "yes" | "no"; outcome: string; price: number; amount: number; shares: number;
  origin: "manual" | "address"; address: string | null; priceNow: number | null; value: number | null; pnl: number | null;
  result: "won" | "lost" | "void" | "sold" | null; settledAt: number | null; createdAt: number;
}

/** The member's watched bets, open first (newest first), then settled; each with the side's price now and P&L. */
export async function listWatched(db: Db, userId: string): Promise<WatchedView[]> {
  const rows = await db.select().from(watchedBets).where(and(eq(watchedBets.userId, userId), isNull(watchedBets.removedAt))).orderBy(desc(watchedBets.createdAt)).limit(400);
  const ids = [...new Set(rows.map(r => r.marketId))];
  const infos = ids.length ? (await db.execute(sql`select market_id, yes_price from terminal.market_info where source = 'polymarket' and market_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)).rows as Array<{ market_id: string; yes_price: number | null }> : [];
  const yes = new Map(infos.map(i => [i.market_id, i.yes_price === null ? null : Number(i.yes_price)]));
  const out = rows.map(r => {
    const y = yes.get(r.marketId) ?? null;
    const now = r.result === "won" ? 1 : r.result === "lost" ? 0 : y !== null ? (r.side === "yes" ? y : 1 - y) : r.lastPrice;
    const p = now === null ? null : pnlNow(r.shares, r.amount, now);
    return {
      id: r.id, marketId: r.marketId, title: r.marketTitle, category: r.category, side: r.side, outcome: r.outcome, price: r.price, amount: r.amount, shares: r.shares,
      origin: r.origin, address: r.address, priceNow: now, value: p?.value ?? null, pnl: p?.pnl ?? null, result: r.result, settledAt: r.settledAt?.getTime() ?? null, createdAt: r.createdAt.getTime(),
    };
  });
  return [...out.filter(r => !r.result), ...out.filter(r => r.result)];
}
