/* Ask Insidir's own read-only tools, on top of Research's (lib/research/tools.ts). Each returns a table of rows from
 * Insidir's tables; nothing writes, nothing guesses. A visitor's rows never carry an open position's side.
 *   best_wallets   the best $1M+ wallets in a category over N days by settled record ($100 on each bet), and what
 *                  each is on today
 *   against_my_bet big wallets on the other side of the member's watched bets (or of a market, by words in its title)
 *   price_moves    a market's price 1, 7 and 30 days ago and its biggest moves, with exact ET windows: what moved and
 *                  when, never why
 * Pure helpers (categoryFromWords, subjectOf, planAsk) are exported for tests. Server only otherwise. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { ToolDef } from "@/lib/analyst/llm";
import { category as categoryInfo, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { cents, hundredOnEach, moveLine, pctText, priceAt, priceMoves, signed, type PricePoint } from "@/lib/briefing/math";
import { marketPath } from "@/lib/entities/slug";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { infoFor, priceHistory, readPolyHistory } from "@/lib/markets/info";
import { memo } from "@/lib/memo";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";
import type { Cell, Table, ToolCtx } from "@/lib/research/tools";

export interface AskCtx extends ToolCtx { userId: string | null; member: boolean }
type Args = Record<string, unknown>;

const DAY = 86_400_000;
const POLY = { label: "Polymarket (Polygonscan)", href: "https://polygonscan.com" };
const METHOD = { label: "The record", href: "/record" };

/** League and topic words → the category slug Insidir files them under. Pure. */
const WORDS: Array<[RegExp, CategorySlug]> = [
  [/\b(nfl|football|college football|cfb|super bowl)\b/i, "football"], [/\b(nba|basketball|wnba|march madness|ncaab)\b/i, "basketball"],
  [/\b(mlb|baseball|world series)\b/i, "baseball"], [/\b(nhl|hockey|stanley cup)\b/i, "hockey"],
  [/\b(soccer|premier league|epl|la liga|serie a|bundesliga|champions league|mls|world cup)\b/i, "soccer"], [/\btennis\b/i, "tennis"], [/\b(golf|pga)\b/i, "golf"],
  [/\b(f1|formula 1|nascar|racing)\b/i, "racing"], [/\b(esports?|valorant|league of legends|cs2|dota)\b/i, "esports"],
  [/\b(election|elections|senate race|governor race|primary)\b/i, "elections"], [/\b(politic\w*|congress|white house|cabinet|trump)\b/i, "politics"],
  [/\b(crypto|bitcoin|btc|eth|ethereum|stocks?|fed|rates|markets)\b/i, "markets"], [/\b(weather|temperature)\b/i, "weather"], [/\bhurricane\b/i, "hurricane"],
  [/\b(oil|opec|crude)\b/i, "oil"], [/\b(space|spacex|nasa)\b/i, "space"], [/\b(tech|ai\b|openai|apple|google)\b/i, "tech"], [/\b(culture|oscars|grammys|movies?|music)\b/i, "culture"],
];
export function categoryFromWords(q: string): CategorySlug | null {
  const lower = q.trim().toLowerCase();
  if (isCategory(lower)) return lower;
  return WORDS.find(([re]) => re.test(q))?.[1] ?? null;
}

const STOP = new Set("why did does do the a an odds price prices move moved moving go went jump jumped drop dropped fall fell rise rose market markets on of for in about to is was what happened with my trade trades position anyone big against someone wallets wallet money is are any there who other side opposite".split(" "));
/** The words that name the market in a question ("Why did the Hegseth odds move?" → "hegseth"). Pure. */
export function subjectOf(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).slice(0, 4).join(" ");
}

/** Ask's own routes, before Research's planner: which of these tools a question is for. Pure. */
export function planAsk(q: string): { tool: string; args: Args } | null {
  if (/\b(best|top|leading|hottest)\b[^?]*\b(wallets?|traders?|accounts?|money)\b/i.test(q)) {
    const days = /\b(this|last|past) week\b/i.test(q) ? 7 : /\b(all[- ]time|ever)\b/i.test(q) ? 3650 : 30;
    return { tool: "best_wallets", args: { category: categoryFromWords(q), days } };
  }
  if (/\b(against|other side|opposite side|betting the other way|fading)\b/i.test(q)) return { tool: "against_my_bet", args: { market: subjectOf(q) || undefined } };
  if (/\b(why did|why is|why has|what moved|how did)\b[^?]*\b(odds|price|prices|line|market)\b|\b(odds|price|line)\b[^?]*\b(move|moved|jump\w*|drop\w*|fell|rose|spike\w*)\b/i.test(q)) {
    const subject = subjectOf(q);
    return subject ? { tool: "price_moves", args: { market: subject } } : null;
  }
  return null;
}

const str = (a: Args, k: string, max = 80): string | undefined => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string).trim().slice(0, max) : undefined);
const tierName = (t: string | null) => (t === "millionaire" ? "Millionaire" : t === "pro" ? "Pro" : "Wallet");
const table = (c: ToolCtx, tool: string, title: string, columns: string[], numeric: number[], rows: Cell[][], note?: string): Table =>
  ({ tool, title, columns, numeric, rows, sources: [POLY, METHOD], at: c.until, live: c.live, note: note ?? null });

/** Markets whose titles hold every word, most $1M+ money first. */
async function findMarkets(db: Db, words: string, until: number, limit = 3): Promise<Array<{ id: string; title: string; category: string }>> {
  const ws = words.split(/\s+/).filter(Boolean).slice(0, 4);
  if (!ws.length) return [];
  const r = await db.execute(sql`select market_id as id, max(market_title) as title, max(category) as category from terminal.millionaire_bets
    where at <= ${new Date(until)} and ${sql.join(ws.map(w => sql`(market_title ilike ${`%${w}%`} or event_title ilike ${`%${w}%`})`), sql` and `)}
    group by market_id order by max(at) desc, sum(amount) desc limit ${limit}`);
  return (r.rows as Array<{ id: string; title: string; category: string }>).map(x => ({ id: String(x.id), title: String(x.title), category: String(x.category) }));
}

async function bestWallets(c: AskCtx, a: Args): Promise<Table> {
  const raw = str(a, "category");
  const cat = raw ? (isCategory(raw) ? raw : categoryFromWords(raw)) : null;
  const days = Math.min(3650, Math.max(1, Number(a.days) || 30));
  const since = new Date(c.now - days * DAY);
  const r = await c.db.execute(sql`select b.wallet, max(w.tier) as tier, b.price::float as price, b.result from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet
    where b.result in ('won', 'lost', 'void') and b.settled_at >= ${since} ${cat ? sql`and b.category = ${cat}` : sql``}
    group by b.wallet, b.id, b.price, b.result`);
  const by = new Map<string, { tier: string | null; bets: Array<{ price: number; result: "won" | "lost" | "void" }> }>();
  for (const x of r.rows as Array<{ wallet: string; tier: string | null; price: number; result: "won" | "lost" | "void" }>) {
    const e = by.get(x.wallet) ?? { tier: x.tier, bets: [] };
    e.bets.push({ price: Number(x.price), result: x.result });
    by.set(x.wallet, e);
  }
  const ranked = [...by].map(([wallet, e]) => ({ wallet, tier: e.tier, ...hundredOnEach(e.bets) })).filter(x => x.won + x.lost >= 3)
    .sort((p, q) => q.net - p.net || q.won - p.won).slice(0, 5);
  const today = ranked.length ? (await c.db.execute(sql`select wallet, market_id, market_title, outcome, price::float as price, amount::float as amount from terminal.millionaire_bets
    where wallet in (${sql.join(ranked.map(x => sql`${x.wallet}`), sql`, `)}) and result is null and at >= ${new Date(c.until - DAY)} and at <= ${new Date(c.until)}
    order by amount desc`)).rows as Array<{ wallet: string; market_id: string; market_title: string; outcome: string; price: number; amount: number }> : [];
  const label = cat ? categoryInfo(cat).name : "every category";
  const rows: Cell[][] = ranked.map(x => {
    const on = today.filter(t => t.wallet === x.wallet).slice(0, 2);
    const onText = on.length
      ? on.map(t => (c.member ? `${dollars(Number(t.amount))} on ${t.outcome} in “${t.market_title}” at ${cents(Number(t.price))}` : `${dollars(Number(t.amount))} on “${t.market_title}” (side for members)`)).join("; ")
      : "Nothing new today";
    return [
      // The wallet's page carries its full address: members only.
      { text: `${tierName(x.tier)} ${shortWallet(x.wallet)}`, ...(c.member ? { href: `/wallet/${x.wallet}` } : {}) },
      { text: `${x.won}–${x.lost}` },
      { text: signed(x.net), tone: x.net > 0 ? "pos" : x.net < 0 ? "neg" : undefined },
      { text: onText, ...(on[0] ? { href: marketPath(String(on[0].market_id), String(on[0].market_title)) } : {}) },
    ];
  });
  return table(c, "best_wallets", `Best $1M+ wallets in ${label}, ${days >= 3650 ? "all time" : `last ${days} days`}, by $100 on each settled trade`,
    ["Wallet", "Settled W–L", "$100 on each", "On today"], [1, 2], rows, `Wallets with 3+ settled trades. Past results don't predict future ones.`);
}

async function againstMyBet(c: AskCtx, a: Args): Promise<Table> {
  const words = str(a, "market");
  type Mine = { id: string; market_id: string; market_title: string; side: "yes" | "no"; outcome: string };
  let mine: Mine[] = [];
  if (c.userId) {
    const r = await c.db.execute(sql`select id, market_id, market_title, side, outcome from terminal.watched_bets where user_id = ${c.userId} and result is null and removed_at is null
      ${words ? sql`and (${sql.join(words.split(/\s+/).map(w => sql`market_title ilike ${`%${w}%`} or outcome ilike ${`%${w}%`}`), sql` or `)})` : sql``}
      order by created_at desc limit 10`);
    mine = r.rows as Mine[];
  }
  const rows: Cell[][] = [];
  if (mine.length) {
    for (const m of mine) {
      const r = await c.db.execute(sql`select b.wallet, max(b.tier) as tier, sum(b.amount)::float as amount, max(b.outcome) as outcome, max(b.at) as at from terminal.millionaire_bets b
        where b.market_id = ${m.market_id} and b.outcome_side <> ${m.side} and b.result is null and b.at <= ${new Date(c.until)} group by b.wallet order by sum(b.amount) desc limit 5`);
      for (const x of r.rows as Array<{ wallet: string; tier: string; amount: number; outcome: string; at: string }>) {
        rows.push([{ text: `${m.outcome} in “${m.market_title}”`, href: marketPath(m.market_id, m.market_title) }, { text: `${tierName(x.tier)} ${shortWallet(x.wallet)}` },
          { text: `${dollars(Number(x.amount))} on ${x.outcome}` }, { text: new Date(x.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" }]);
      }
    }
    return table(c, "against_my_bet", "Big wallets on the other side of your watched trades", ["Your trade", "Wallet", "Against you", "Latest"], [], rows,
      rows.length ? undefined : "No $1M+ or $100K+ wallet holds the other side of your watched trades.");
  }
  // No watched bet matches: the market by its words, both sides (a visitor: money only, no side).
  const markets = words ? await findMarkets(c.db, words, c.until, 1) : [];
  for (const m of markets) {
    const r = await c.db.execute(sql`select b.outcome, b.outcome_side, sum(b.amount)::float as amount, count(distinct b.wallet)::int as wallets from terminal.millionaire_bets b
      where b.market_id = ${m.id} and b.result is null and b.at <= ${new Date(c.until)} group by b.outcome, b.outcome_side order by sum(b.amount) desc`);
    for (const x of r.rows as Array<{ outcome: string; outcome_side: string; amount: number; wallets: number }>) {
      rows.push([{ text: `“${m.title}”`, href: marketPath(m.id, m.title) }, { text: `${x.wallets} ${Number(x.wallets) === 1 ? "wallet" : "wallets"}` },
        { text: c.member ? `${dollars(Number(x.amount))} on ${x.outcome}` : `${dollars(Number(x.amount))} (side for members)` }, { text: "Open" }]);
    }
  }
  return table(c, "against_my_bet", c.userId ? "You aren't watching a trade on that: the big money on the market" : "The big money on the market", ["Market", "Wallets", "Money", "Status"], [], rows,
    c.userId ? "Watch the trade (/watch) to see who's against it." : "Members can watch a trade and see who's against it.");
}

let clients: { polymarket: PolymarketClient; kalshi: KalshiClient } | null = null;

/** An outcome token of the market from a stored fill (millionaire_bets.raw), and whether it is the NO token. */
async function tokenOf(db: Db, marketId: string): Promise<{ asset: string; no: boolean } | null> {
  const r = await db.execute(sql`select raw from terminal.millionaire_bets where market_id = ${marketId} and raw is not null order by at desc limit 5`);
  for (const row of r.rows as Array<{ raw: Record<string, unknown> | null }>) {
    for (const v of Object.values(row.raw ?? {})) {
      const f = v as Record<string, unknown> | null;
      if (f && typeof f === "object" && typeof f.asset === "string" && /^\d{10,}$/.test(f.asset)) return { asset: f.asset, no: Number(f.outcomeIndex) === 1 };
    }
  }
  return null;
}

async function priceMovesTool(c: AskCtx, a: Args): Promise<Table> {
  const words = str(a, "market") ?? "";
  const [m] = words ? await findMarkets(c.db, words, c.until, 1) : [];
  if (!m) return table(c, "price_moves", "Price moves", ["When", "Move"], [], []);
  const info = (await infoFor(c.db, "polymarket", [m.id]).catch(() => new Map())).get(m.id) ?? null;
  const cl = (clients ??= { polymarket: new PolymarketClient(), kalshi: new KalshiClient() });
  let points: PricePoint[] = info?.historyKey ? await memo(`ask-history:${m.id}`, 5 * 60_000, () => priceHistory(cl, "polymarket", m.id, info, c.now - 31 * DAY, c.now)).catch(() => []) : [];
  // No history key read yet: the token a watched wallet bought (its fill's raw record) gives the same history, the NO
  // token's turned into the YES price.
  if (!points.length) {
    const tok = await tokenOf(c.db, m.id);
    if (tok) points = await memo(`ask-history:${m.id}:${tok.asset}`, 5 * 60_000, async () => readPolyHistory(await cl.polymarket.getPriceHistory(tok.asset)).map(p => ({ t: p.t, p: tok.no ? 1 - p.p : p.p }))).catch(() => []);
  }
  const pts = points.filter(p => p.t <= c.until);
  const rows: Cell[][] = [];
  if (pts.length) {
    const now = pts[pts.length - 1]!.p;
    for (const [label, ago] of [["1 day ago", DAY], ["7 days ago", 7 * DAY], ["30 days ago", 30 * DAY]] as const) {
      const p = priceAt(pts, c.until - ago);
      if (p !== null && pts[0]!.t <= c.until - ago + DAY) rows.push([{ text: label }, { text: `${pctText(p)} → ${pctText(now)} now` }]);
    }
    for (const mv of priceMoves(pts.filter(p => p.t >= c.until - 30 * DAY))) rows.push([{ text: "Biggest move" }, { text: moveLine(mv, c.now) }]);
  }
  return table(c, "price_moves", `How “${m.title}” moved (YES price)`, ["When", "Move"], [], rows,
    "Times are ET. Insidir shows what moved and when, not why.");
}

export const ASK_TOOLS: Record<string, (c: AskCtx, a: Args) => Promise<Table>> = { best_wallets: bestWallets, against_my_bet: againstMyBet, price_moves: priceMovesTool };

export const ASK_TOOL_DEFS: ToolDef[] = [
  { type: "function", function: { name: "best_wallets", description: "The best $1M+ wallets in a category over a number of days, by settled record ($100 on each trade), and what each is on today. Categories: football (NFL, college), basketball (NBA), baseball, hockey, soccer, tennis, golf, racing, esports, elections, politics, markets (crypto, Fed), weather, oil, tech, culture, world.", parameters: { type: "object", additionalProperties: false, properties: { category: { type: "string" }, days: { type: "number" } } } } },
  { type: "function", function: { name: "against_my_bet", description: "Big wallets on the other side of the asker's watched trades, optionally only trades whose market or side matches these words.", parameters: { type: "object", additionalProperties: false, properties: { market: { type: "string" } } } } },
  { type: "function", function: { name: "price_moves", description: "A market's price 1, 7 and 30 days ago and its biggest moves with exact times. It never says why a price moved.", parameters: { type: "object", additionalProperties: false, required: ["market"], properties: { market: { type: "string", description: "Words from the market's title" } } } } },
];
