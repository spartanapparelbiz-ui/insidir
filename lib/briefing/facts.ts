/* A Bet Briefing's facts: everything it may say about one market, computed in code from Insidir's data and the
 * venues', each section a list of true template sentences (lib/briefing/write.ts may only rephrase them). In order:
 *   rules          what you're actually betting on: Polymarket's own rules (gamma `description`), the deadline and the
 *                  resolution source
 *   cost           what it costs and what it pays, per $100 (and the viewer's own position, when given)
 *   history        the price 1, 7 and 30 days ago, and the biggest moves with their exact windows (never why)
 *   who            per side, the $1M+ wallets and their money; the top wallets by tier and short address only, their
 *                  settled record in this category ($100 on each) and how big this bet is for them
 *   playing        ladders and hedges: the same wallets' open positions across related markets in the event, with
 *                  profit or loss per outcome (spread and total lines, or one event's exclusive outcomes)
 *   timing         when the money came in, against the price now
 *   price_compare  Kalshi against Polymarket for the same market (approved twins only)
 *   read           the strongest case for each side and what the money says, from the facts above only
 * Each side-revealing section also gets a side-neutral line (`free`): what a visitor sees before the market settles
 * (lib/briefing/gate.ts). The builders below the reads are pure (tested). Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { twinOf, type MarketTwin } from "@/lib/entities/market";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { memo } from "@/lib/memo";
import { humanLine } from "@/lib/markets/title";
import { infoFor, priceHistory } from "@/lib/markets/info";
import { outcomeNames } from "@/lib/millionaires/queries";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";
import { cents, earlyLateLine, entryProfile, exclusiveLadder, ladderLine, marginLabel, moveLine, numericLadder, payout, pctText, priceAt, priceMoves, signed, sizeVsUsual, totalLabel, type Entry, type ExclusiveLeg, type LineLeg, type PricePoint } from "./math";
import { walletFacts, walletName, type WalletFacts } from "./wallets";
import type { FactSection } from "./write";

export const SECTION_KEYS = ["rules", "cost", "history", "who", "playing", "timing", "price_compare", "read"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_TITLES: Record<SectionKey, string> = {
  rules: "What you're actually trading on",
  cost: "What it costs and what it pays",
  history: "How we got here",
  who: "Who's on each side",
  playing: "How they're playing it",
  timing: "Early or late money",
  price_compare: "Better price",
  read: "The honest read",
};
/** Sections whose lines say which side a wallet or its money is on: visitors get their `free` line until it settles. */
export const SIDE_SECTIONS: ReadonlySet<SectionKey> = new Set(["who", "playing", "timing", "read"]);

export type Side = "yes" | "no";
export interface Labels { yes: string; no: string }
export interface UserPosition { side: Side; price: number; amount: number }
export interface BriefingFacts {
  marketId: string; title: string; event: string; category: string; categoryName: string; labels: Labels;
  /** The side asked about (a viewer's own bet), else null. */
  side: Side | null;
  /** YES's price on Polymarket now, 0..1; null before it was read. */
  price: number | null;
  result: Side | "void" | null;
  sections: FactSection[];
  /** Side-neutral first lines for visitors (lib/briefing/gate.ts). */
  free: Partial<Record<SectionKey, string>>;
  /** What the facts came from (positions and their amounts), for the cache key. */
  positions: Array<{ wallet: string; side: Side; dollars: number }>;
  at: number;
}

const DAY = 86_400_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentences = (s: string): string[] => s.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map(x => x.trim()).filter(Boolean);
const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** "December 31, 2026, 12:00 PM ET". */
export const etDeadline = (ms: number): string => `${ET_DATE.format(new Date(ms))} ET`;
/** "if it resolves Yes" for a Yes/No market, "if Colts win" otherwise. */
const winsIf = (label: string) => (label === "Yes" || label === "No" ? `if it resolves ${label}` : `if ${label} wins`);
const upper = (label: string) => (label === "Yes" || label === "No" ? label.toUpperCase() : label);

/* ---------- 1. rules ---------- */

export interface GammaRules { description: string | null; endDate: string | null; resolutionSource: string | null; question?: string | null; conditionId?: string | null; closed?: boolean;
  /** YES's price (outcomePrices[0]) and the YES token (clobTokenIds[0], for the price history). */
  yes?: number | null; yesToken?: string | null }

const jsonList = (v: unknown): unknown[] => { try { return Array.isArray(v) ? v : typeof v === "string" ? (JSON.parse(v) as unknown[]) : []; } catch { return []; } };
/** A settled market's winner from its final prices (1 and 0); null while it trades. Pure. */
export function gammaWinner(g: Pick<GammaRules, "closed" | "yes"> | null): Side | null {
  if (!g?.closed || g.yes === null || g.yes === undefined) return null;
  return g.yes >= 0.999 ? "yes" : g.yes <= 0.001 ? "no" : null;
}

/** The rules' first sentences (up to 3, about 520 characters), then the deadline and the resolution source. */
export function rulesSection(g: GammaRules | null): { lines: string[]; notes: string[] } {
  if (!g?.description) return { lines: ["Polymarket's rules for this market couldn't be read just now."], notes: [] };
  const all = sentences(g.description);
  const lines: string[] = [];
  let len = 0;
  for (const s of all) {
    if (lines.length >= 3 || (lines.length && len + s.length > 520)) break;
    lines.push(s.length > 300 ? `${s.slice(0, 297).replace(/\s+\S*$/, "")}…` : s);
    len += s.length;
  }
  const end = g.endDate ? Date.parse(g.endDate) : NaN;
  const src = g.resolutionSource && g.resolutionSource !== "None" && g.resolutionSource.trim() ? g.resolutionSource.trim() : null;
  const tail = [Number.isFinite(end) ? `Deadline: ${etDeadline(end)}.` : null, src ? `Resolves from ${src.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}.` : "It resolves from the sources the rules name."].filter(Boolean).join(" ");
  return { lines: [...lines, tail], notes: [g.description, ...(src ? [src] : [])] };
}

/* ---------- 2. cost ---------- */

/** One side at its price: "76¢ means the market says 76% for Colts. $100 on Colts buys 131 shares. They pay $131 if Colts wins, $0 if not." */
export function costLine(price: number, label: string): string {
  const p = payout(price);
  const n = (x: number) => x.toLocaleString("en-US");
  return `${cents(price)} means the market says ${p.impliedPct}% for ${label}. $100 on ${label} buys ${n(p.shares)} shares. They pay $${n(p.pays)} ${winsIf(label)}, $0 if not.`;
}

export function costSection(yes: number | null, labels: Labels, side: Side | null, result: Side | "void" | null, position?: UserPosition | null): string[] {
  if (result) return [result === "void" ? "This market was voided: every trade was refunded." : `This market has settled: ${labels[result]} won. Each ${labels[result]} share paid $1.`];
  if (yes === null || !(yes > 0 && yes < 1)) return ["There's no price on Polymarket for this market right now."];
  const px = { yes, no: 1 - yes };
  const order: Side[] = side ? [side, side === "yes" ? "no" : "yes"] : ["yes", "no"];
  const lines = order.map(s => costLine(px[s], labels[s]));
  if (position && position.price > 0 && position.amount > 0) {
    const shares = position.amount / position.price, value = shares * px[position.side];
    lines.push(`Your ${dollars(position.amount)} on ${labels[position.side]} at ${cents(position.price)} is ${Math.floor(shares)} shares, worth ${dollars(value)} now (${signed(value - position.amount)}).`);
  }
  return lines;
}

/* ---------- 3. history ---------- */

export function historySection(points: readonly PricePoint[], yesNow: number | null, label: string, now: number): string[] {
  const pts = points.filter(p => p.t <= now);
  if (pts.length < 2 && yesNow === null) return ["There's no price history for this market yet."];
  const nowP = yesNow ?? pts[pts.length - 1]!.p;
  const first = pts.length ? pts[0]!.t : now;
  const ago = ([1, 7, 30] as const).filter(d => first <= now - d * DAY + 3_600_000).map(d => `${plural(d, "day")} ago ${pctText(priceAt(pts, now - d * DAY)!)}`);
  const head = yesNow === null
    ? `${label} last traded at ${pctText(nowP)}${ago.length ? `: ${ago.join(", ")}` : ""}.`
    : `${label} is at ${pctText(nowP)} now${ago.length ? `: ${ago.join(", ")}` : ""}.`;
  const moves = priceMoves(pts.filter(p => p.t >= now - 30 * DAY));
  const lines = [head];
  if (moves.length) lines.push(`Biggest moves: ${moves.map(m => moveLine(m, now)).join("; ")}${/\.$/.test(moveLine(moves[moves.length - 1]!, now)) ? "" : "."}`);
  else if (pts.length >= 2) lines.push("No move of 5 points or more in the last 30 days.");
  return lines;
}

/* ---------- 4. who ---------- */

export interface Holding { wallet: string; tier: "millionaire" | "pro"; side: Side; dollars: number; price: number }
export interface SideMoney { dollars: number; wallets: number }

/** "Millionaire 0x7c3d…5c6b: $48K at 62¢. 14–6 on Politics, $100 on each: +$880. 3.2× their usual bet." */
export function holdingLine(h: Holding, f: WalletFacts | undefined, categoryName: string): string {
  const name = walletName({ tier: f?.tier ?? h.tier, short: f?.short ?? shortWallet(h.wallet) });
  const parts = [`${name}: ${dollars(h.dollars)} at ${cents(h.price)}.`];
  parts.push(f?.record ? `${f.record.line.replace(/^(\d+–\d+)/, `$1 on ${categoryName}`)}.` : `No settled ${categoryName} trades yet.`);
  const x = sizeVsUsual(h.dollars, f?.usualBet ?? null);
  if (x !== null && x >= 1.5) parts.push(`${x}× their usual trade.`);
  else if (x !== null && x <= 0.5) parts.push(`Smaller than their usual trade.`);
  return parts.join(" ");
}

export function whoSection(labels: Labels, money: Record<Side, SideMoney>, holdings: readonly Holding[], facts: ReadonlyMap<string, WalletFacts>, categoryName: string): string[] {
  const total = money.yes.dollars + money.no.dollars;
  if (!total && !holdings.length) return ["No proven $1M+ wallet holds a position on this market."];
  const lines = [`${labels.yes}: ${plural(money.yes.wallets, "$1M+ wallet")}, ${dollars(money.yes.dollars)}. ${labels.no}: ${plural(money.no.wallets, "$1M+ wallet")}, ${dollars(money.no.dollars)}.`];
  for (const s of ["yes", "no"] as const) {
    const top = holdings.filter(h => h.side === s).sort((a, b) => b.dollars - a.dollars).slice(0, 3);
    if (top.length) lines.push(`On ${labels[s]}: ${top.map(h => holdingLine(h, facts.get(h.wallet), categoryName)).join(" ")}`);
  }
  return lines;
}

/** Visitors: the total only, as the market page shows it ("Members see which side it is on"). */
export const whoFree = (money: Record<Side, SideMoney>): string => {
  const total = money.yes.dollars + money.no.dollars, n = money.yes.wallets + money.no.wallets;
  return total ? `${dollars(total)} from proven $1M+ wallets (${plural(n, "position")}). Members see which side it is on.` : "No proven $1M+ wallet holds a position on this market.";
};

/* ---------- 5. playing (ladders and hedges) ---------- */

/** A position read as a leg on a number or an outcome: spread and moneyline legs on one team's margin, totals on the
 *  total, "Will X win on <date>?" legs on a three-way result. Null when the title can't be read for sure. */
export type ParsedLeg =
  | { kind: "margin"; team: string; other: string; line: number; dir: "over" | "under" }
  | { kind: "total"; line: number; dir: "over" | "under" }
  | { kind: "outcome"; outcome: string; side: Side };

/** `yesLabel`/`noLabel`: the market's two outcomes (for a spread or moneyline, the two teams, YES first). */
export function parseLeg(title: string, side: Side, yesLabel: string, noLabel: string): ParsedLeg | null {
  const t = title.trim();
  let m = /^Spread:\s*(.+?)\s*\(([+-−]?\d+(?:\.\d+)?)\)$/.exec(t);
  if (m) {
    const team = m[1]!.trim(), spread = Number(m[2]!.replace("−", "-"));
    if (team !== yesLabel || !noLabel || noLabel === "No") return null;
    // The team covers when its margin beats −spread: YES is over that line, NO under.
    return { kind: "margin", team, other: noLabel, line: -spread, dir: side === "yes" ? "over" : "under" };
  }
  m = /:\s*O\/U\s*(\d+(?:\.\d+)?)$/i.exec(t);
  if (m) return { kind: "total", line: Number(m[1]), dir: side === "yes" ? "over" : "under" };
  m = /^Will (.+?) win on \d{4}-\d{2}-\d{2}\?$/.exec(t);
  if (m) return { kind: "outcome", outcome: m[1]!.trim(), side };
  if (/^Will .+ end in a draw\?$/.test(t)) return { kind: "outcome", outcome: "Draw", side };
  m = /^(.+?)\s+vs\.?\s+(.+?)$/.exec(t);
  if (m && yesLabel === m[1]!.trim() && noLabel === m[2]!.trim()) return { kind: "margin", team: yesLabel, other: noLabel, line: 0, dir: side === "yes" ? "over" : "under" };
  return null;
}

export interface LegHolding { title: string; side: Side; yesLabel: string; noLabel: string; dollars: number; price: number }

/** One wallet's ladder across an event's markets: "$406K across 5 Colts lines. Colts lose by exactly 4: −$29K. …".
 *  Null with fewer than 2 legs it can read on the same number. */
export function ladderFor(name: string, legs: readonly LegHolding[]): string | null {
  const parsed = legs.map(l => ({ l, p: parseLeg(l.title, l.side, l.yesLabel, l.noLabel) })).filter((x): x is { l: LegHolding; p: ParsedLeg } => x.p !== null && x.l.price > 0 && x.l.price < 1);
  const money = (xs: Array<{ l: LegHolding }>) => xs.reduce((a, x) => a + x.l.dollars, 0);
  const base = (x: { l: LegHolding }) => ({ label: x.l.title, cost: x.l.dollars, shares: x.l.dollars / x.l.price });
  // Margins: on the first team named, the other team's lines turned around.
  const margins = parsed.filter(x => x.p.kind === "margin");
  if (margins.length >= 2) {
    const ref = (margins[0]!.p as Extract<ParsedLeg, { kind: "margin" }>).team;
    const legsOn: LineLeg[] = margins.flatMap(x => {
      const p = x.p as Extract<ParsedLeg, { kind: "margin" }>;
      if (p.team === ref) return [{ ...base(x), line: p.line, dir: p.dir }];
      if (p.other === ref) return [{ ...base(x), line: -p.line, dir: p.dir === "over" ? "under" : "over" }];
      return [];
    });
    if (legsOn.length >= 2) {
      // A moneyline on a tie settles by its own rules: leave the exact-tie row out rather than guess.
      const rows = numericLadder(legsOn, marginLabel(ref)).filter(r => !(r.from === 0 && r.to === 0));
      return `${name}: ${dollars(legsOn.reduce((a, l) => a + l.cost, 0))} across ${plural(legsOn.length, `${ref} line`)}. ${ladderLine(rows)}`;
    }
  }
  const totals = parsed.filter(x => x.p.kind === "total");
  if (totals.length >= 2) {
    const legsOn: LineLeg[] = totals.map(x => ({ ...base(x), line: (x.p as Extract<ParsedLeg, { kind: "total" }>).line, dir: (x.p as Extract<ParsedLeg, { kind: "total" }>).dir }));
    return `${name}: ${dollars(money(totals))} across ${plural(totals.length, "total line")}. ${ladderLine(numericLadder(legsOn, totalLabel("Total")))}`;
  }
  const outs = parsed.filter(x => x.p.kind === "outcome");
  if (outs.length >= 2) {
    const legsOn: ExclusiveLeg[] = outs.map(x => ({ ...base(x), outcome: (x.p as Extract<ParsedLeg, { kind: "outcome" }>).outcome, side: (x.p as Extract<ParsedLeg, { kind: "outcome" }>).side }));
    const outcomes = [...new Set([...legsOn.map(l => l.outcome), "Draw"])];
    return `${name}: ${dollars(money(outs))} across ${plural(outs.length, "result market")}. ${ladderLine(exclusiveLadder(legsOn, outcomes))}`;
  }
  return null;
}

export const NO_LADDERS = "No ladders or hedges by these wallets in related markets.";
export function playingSection(ladders: readonly (string | null)[]): string[] {
  const xs = ladders.filter((x): x is string => Boolean(x)).slice(0, 3);
  return xs.length ? xs : [NO_LADDERS];
}
export const playingFree = (n: number): string => (n ? `${plural(n, "wallet")} on this market also ${n === 1 ? "holds" : "hold"} positions on related markets in the same event. Members see the profit or loss per outcome.` : NO_LADDERS);

/* ---------- 6. timing ---------- */

const ET_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
export function timingSection(entries: Record<Side, readonly Entry[]>, yes: number | null, labels: Labels): string[] {
  const lines: string[] = [];
  for (const s of ["yes", "no"] as const) {
    const p = entryProfile(entries[s]);
    if (!p) continue;
    const nowP = yes === null ? null : s === "yes" ? yes : 1 - yes;
    lines.push(nowP !== null && nowP > 0 && nowP < 1 ? earlyLateLine(p, upper(labels[s]), nowP) : `The ${upper(labels[s])} money came in at ${cents(p.avgEntry)} on average.`);
  }
  return lines.length ? lines : ["No $1M+ money has come in on this market yet."];
}
export function timingFree(entries: Record<Side, readonly Entry[]>): string {
  const all = [...entries.yes, ...entries.no];
  if (!all.length) return "No $1M+ money has come in on this market yet.";
  const a = Math.min(...all.map(e => e.at)), b = Math.max(...all.map(e => e.at));
  const when = ET_SHORT.format(new Date(a)) === ET_SHORT.format(new Date(b)) ? `on ${ET_SHORT.format(new Date(a))}` : `between ${ET_SHORT.format(new Date(a))} and ${ET_SHORT.format(new Date(b))}`;
  return `The $1M+ money came in ${when}. Members see what price it got against the price now.`;
}

/* ---------- 7. better price ---------- */

export function priceCompareSection(yes: number | null, twin: Pick<MarketTwin, "yes" | "yesAsk" | "noAsk"> | null, labels: Labels): string[] {
  if (!twin) return ["Kalshi doesn't list this market."];
  if (yes === null) return ["Kalshi lists this market, but there's no Polymarket price right now."];
  const k = { yes: twin.yesAsk ?? twin.yes, no: twin.noAsk ?? (twin.yes !== null ? 1 - twin.yes : null) };
  const p = { yes, no: 1 - yes };
  return (["yes", "no"] as const).map(s => {
    const kp = k[s];
    if (kp === null) return `${labels[s]}: Polymarket ${cents(p[s])}. Kalshi has no price right now.`;
    const d = Math.round(kp * 100) - Math.round(p[s] * 100);
    const cheaper = d === 0 ? "the same price" : d < 0 ? `Kalshi is ${-d}¢ cheaper` : `Polymarket is ${d}¢ cheaper`;
    return `${labels[s]}: Polymarket ${cents(p[s])}, Kalshi ${cents(kp)} to buy. ${cheaper[0]!.toUpperCase()}${cheaper.slice(1)}.`;
  });
}

/* ---------- 8. the honest read ---------- */

export function readSection(labels: Labels, money: Record<Side, SideMoney>, best: Record<Side, { name: string; record: string | null } | null>, yes: number | null): string[] {
  const caseFor = (s: Side) => {
    const m = money[s];
    if (!m.dollars) return `The case for ${labels[s]}: no $1M+ wallet holds it.`;
    const lead = best[s];
    return `The case for ${labels[s]}: ${plural(m.wallets, "$1M+ wallet")} ${m.wallets === 1 ? "holds" : "hold"} ${dollars(m.dollars)} on it${lead ? `, the biggest ${lead.name}${lead.record ? ` (${lead.record})` : ""}` : ""}.`;
  };
  const total = money.yes.dollars + money.no.dollars;
  let says = "What the money says: no $1M+ money on either side yet.";
  if (total) {
    const s: Side = money.yes.dollars >= money.no.dollars ? "yes" : "no";
    const share = Math.round((money[s].dollars / total) * 100);
    const px = yes === null ? null : s === "yes" ? yes : 1 - yes;
    says = share === 50 ? `What the money says: the $1M+ money is split evenly, ${dollars(money.yes.dollars)} each way.`
      : `What the money says: ${share}% of the $1M+ money (${dollars(money[s].dollars)} of ${dollars(total)}) is on ${labels[s]}${px !== null && px > 0 && px < 1 ? `, priced at ${cents(px)}` : ""}.`;
  }
  return [caseFor("yes"), caseFor("no"), says];
}
export const READ_FREE = "The strongest case for each side, and where the $1M+ money is, for members.";

/* ---------- the reads ---------- */

let clients: { polymarket: PolymarketClient; kalshi: KalshiClient } | null = null;

/** Polymarket's rules for a market slug (gamma ?slug=, then &closed=true), cached 10 minutes. */
export async function gammaRules(slug: string, f: typeof fetch = fetch): Promise<GammaRules | null> {
  return memo(`gamma:rules:${slug}`, 10 * 60_000, async () => {
    for (const closed of [false, true]) {
      const res = await f(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}${closed ? "&closed=true" : ""}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      const body = res && res.ok ? ((await res.json().catch(() => null)) as unknown) : null;
      const m = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
      if (m) return { description: typeof m.description === "string" ? m.description : null, endDate: typeof m.endDate === "string" ? m.endDate : null,
        resolutionSource: typeof m.resolutionSource === "string" ? m.resolutionSource : null, question: typeof m.question === "string" ? m.question : null,
        conditionId: typeof m.conditionId === "string" ? m.conditionId : null, closed: m.closed === true,
        yes: (() => { const x = Number(jsonList(m.outcomePrices)[0]); return Number.isFinite(x) && x >= 0 && x <= 1 ? x : null; })(),
        yesToken: (() => { const t = jsonList(m.clobTokenIds)[0]; return typeof t === "string" ? t : null; })() };
    }
    return null;
  });
}

/** The market slug in a Polymarket link: https://polymarket.com/event/<event>/<market> (else the event slug). */
export const slugOfUrl = (url: string | null): string | null => {
  const m = /polymarket\.com\/(?:[a-z]{2}\/)?event\/([^/?#]+)(?:\/([^/?#]+))?/i.exec(url ?? "");
  return m ? (m[2] ?? m[1])! : null;
};
/** An event's slug, with Polymarket's "-more-markets" page folded into the event. */
const eventSlug = (url: string | null): string | null => (/polymarket\.com\/(?:[a-z]{2}\/)?event\/([^/?#]+)/i.exec(url ?? "")?.[1] ?? null)?.replace(/-more-markets$/, "") ?? null;

/** A market Insidir has no bet on (a pasted link): its title, link, outcomes and price from Polymarket. */
export interface MarketFallback { title: string; url: string | null; yesLabel: string; noLabel: string; yes: number | null; category?: string }
export interface BuildOpts { side?: Side | null; position?: UserPosition | null; fetchFn?: typeof fetch; history?: PricePoint[]; fallback?: MarketFallback | null }

export async function buildBriefingFacts(db: Db, marketId: string, now: number, o: BuildOpts = {}): Promise<BriefingFacts | null> {
  const head = (await db.execute(sql`select max(market_title) as title, max(event_title) as event, max(category) as category, max(url) as url,
      coalesce(max(yes_label), max(case when outcome_side = 'yes' then outcome end)) as yes_label,
      coalesce(max(no_label), max(case when outcome_side = 'no' then outcome end)) as no_label,
      max(outcome_side) filter (where result = 'won') as won_side, max(outcome_side) filter (where result = 'lost') as lost_side, bool_or(result = 'void') as void
    from terminal.millionaire_bets where market_id = ${marketId}`)).rows[0] as Record<string, unknown> | undefined;
  const fb = !head?.title ? o.fallback ?? null : null;
  if (!head?.title && !fb) return null;
  const rawTitle = String(head?.title ?? fb!.title), cat = String(head?.category ?? fb?.category ?? "world"), url = head?.url ? String(head.url) : fb?.url ?? null;
  const n = outcomeNames(humanLine({ title: rawTitle }), String(head?.yes_label ?? fb?.yesLabel ?? "Yes"), String(head?.no_label ?? fb?.noLabel ?? "No"));
  const labels: Labels = { yes: n.yesLabel, no: n.noLabel };
  let result: BriefingFacts["result"] = !head ? null : head.void ? "void" : head.won_side === "yes" || head.lost_side === "no" ? "yes" : head.won_side === "no" || head.lost_side === "yes" ? "no" : null;
  const categoryName = isCategory(cat) ? categoryInfo(cat).name : cat;

  // Open positions per wallet and side (any tier), and every open entry (for timing), on this market.
  const holdRows = (await db.execute(sql`select wallet, max(tier) as tier, outcome_side, sum(amount)::float as dollars,
      (sum(amount) / nullif(sum(amount / nullif(price, 0)), 0))::float as price
    from terminal.millionaire_bets where market_id = ${marketId} and result is null group by wallet, outcome_side order by dollars desc limit 40`)).rows as Array<Record<string, unknown>>;
  const holdings: Holding[] = holdRows.map(x => ({ wallet: String(x.wallet), tier: x.tier === "millionaire" ? "millionaire" : "pro", side: x.outcome_side === "no" ? "no" : "yes", dollars: Number(x.dollars), price: Number(x.price) }));
  const money: Record<Side, SideMoney> = { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } };
  for (const h of holdings) if (h.tier === "millionaire") { money[h.side].dollars += h.dollars; money[h.side].wallets += 1; }
  const entryRows = (await db.execute(sql`select outcome_side, price, amount, at from terminal.millionaire_bets
    where market_id = ${marketId} and result is null and tier = 'millionaire'`)).rows as Array<Record<string, unknown>>;
  const entries: Record<Side, Entry[]> = { yes: [], no: [] };
  for (const e of entryRows) entries[e.outcome_side === "no" ? "no" : "yes"].push({ price: Number(e.price), amount: Number(e.amount), at: new Date(String(e.at)).getTime() });

  const slug = slugOfUrl(url);
  const [infos, rules] = await Promise.all([
    infoFor(db, "polymarket", [marketId]).catch(() => new Map()),
    slug ? gammaRules(slug, o.fetchFn).catch(() => null) : Promise.resolve(null),
  ]);
  const stored = infos.get(marketId) ?? null;
  // Polymarket's own answer fills in what Insidir hasn't read yet: the price, the token for its history, a result.
  const info = stored?.historyKey ? stored : rules?.yesToken ? { source: "polymarket" as const, marketId, yesPrice: rules.yes ?? null, startAt: null, closed: Boolean(rules.closed), historyKey: rules.yesToken, updatedAt: now } : stored;
  if (!result) result = gammaWinner(rules);
  const yes = result ? null : typeof stored?.yesPrice === "number" ? stored.yesPrice : rules && !rules.closed && typeof rules.yes === "number" ? rules.yes : fb?.yes ?? null;
  const [history, twins, wf] = await Promise.all([
    o.history ? Promise.resolve(o.history) : info?.historyKey ? memo(`briefing-history:${marketId}`, 5 * 60_000, () => priceHistory((clients ??= { polymarket: new PolymarketClient(), kalshi: new KalshiClient() }), "polymarket", marketId, info, now - 31 * DAY, now)).catch(() => []) : Promise.resolve([] as PricePoint[]),
    twinOf(db, [marketId]).catch(() => new Map<string, MarketTwin>()),
    walletFacts(db, holdings.map(h => h.wallet), cat).catch(() => new Map<string, WalletFacts>()),
  ]);

  // Ladders: the top wallets here, with 2+ open positions across this event's markets.
  const ev = eventSlug(url);
  const top = [...new Set(holdings.slice().sort((a, b) => b.dollars - a.dollars).map(h => h.wallet))].slice(0, 6);
  let ladders: Array<string | null> = [], related = 0;
  if (ev && top.length) {
    const legRows = (await db.execute(sql`select wallet, market_id, max(market_title) as title, outcome_side,
        coalesce(max(yes_label), max(case when outcome_side = 'yes' then outcome end)) as yes_label,
        coalesce(max(no_label), max(case when outcome_side = 'no' then outcome end)) as no_label,
        sum(amount)::float as dollars, (sum(amount) / nullif(sum(amount / nullif(price, 0)), 0))::float as price
      from terminal.millionaire_bets where result is null and wallet in (${sql.join(top.map(w => sql`${w}`), sql`, `)})
        and (url like ${`%/event/${ev}/%`} or url like ${`%/event/${ev}-more-markets/%`} or url like ${`%/event/${ev}`})
      group by wallet, market_id, outcome_side`)).rows as Array<Record<string, unknown>>;
    // The yes/no labels per market (any wallet's bet on it names them).
    for (const w of top) {
      const mine = legRows.filter(r => r.wallet === w);
      if (new Set(mine.map(r => r.market_id)).size < 2) continue;
      related++;
      const f = wf.get(w), tier = holdings.find(h => h.wallet === w)!.tier;
      ladders.push(ladderFor(walletName({ tier: f?.tier ?? tier, short: f?.short ?? shortWallet(w) }), mine.map(r => {
        const nn = outcomeNames(String(r.title), String(r.yes_label ?? "Yes"), String(r.no_label ?? "No"));
        return { title: String(r.title), side: r.outcome_side === "no" ? "no" : "yes", yesLabel: nn.yesLabel, noLabel: nn.noLabel, dollars: Number(r.dollars), price: Number(r.price) };
      })));
    }
    ladders = ladders.filter(Boolean);
  }

  const best = (s: Side) => {
    const h = holdings.filter(x => x.side === s && x.tier === "millionaire").sort((a, b) => b.dollars - a.dollars)[0];
    if (!h) return null;
    const f = wf.get(h.wallet);
    return { name: walletName({ tier: f?.tier ?? h.tier, short: f?.short ?? shortWallet(h.wallet) }), record: f?.record ? `${f.record.won}–${f.record.lost} on ${categoryName}` : null };
  };
  const ruleS = rulesSection(rules);
  const twin = twins.get(marketId) ?? null;
  const sections: FactSection[] = [
    { key: "rules", title: SECTION_TITLES.rules, lines: ruleS.lines, notes: ruleS.notes },
    { key: "cost", title: SECTION_TITLES.cost, lines: costSection(yes, labels, o.side ?? null, result, o.position) },
    { key: "history", title: SECTION_TITLES.history, lines: historySection(history, yes, labels.yes, now) },
    { key: "who", title: SECTION_TITLES.who, lines: whoSection(labels, money, holdings, wf, categoryName) },
    { key: "playing", title: SECTION_TITLES.playing, lines: playingSection(ladders) },
    { key: "timing", title: SECTION_TITLES.timing, lines: timingSection(entries, yes, labels) },
    { key: "price_compare", title: SECTION_TITLES.price_compare, lines: result ? ["This market has settled."] : priceCompareSection(yes, twin, labels) },
    { key: "read", title: SECTION_TITLES.read, lines: readSection(labels, money, { yes: best("yes"), no: best("no") }, yes) },
  ];
  return {
    marketId, title: humanLine({ title: rawTitle }), event: String(head?.event ?? ""), category: cat, categoryName, labels, side: o.side ?? null, price: yes, result, sections,
    free: { who: whoFree(money), playing: playingFree(related), timing: timingFree(entries), read: READ_FREE },
    positions: holdings.map(h => ({ wallet: h.wallet, side: h.side, dollars: Math.round(h.dollars) })),
    at: now,
  };
}
