/* The numbers behind every Bet Briefing, alert and brief line, computed in code (never by the model). Pure; safe on the
 * client. Prices are 0..1 (the side's price: 0.76 = 76¢ = "the market says 76%"); money in dollars.
 *
 *   payout        what a stake buys and pays: "$100 buys 131 shares. They pay $131 if yes, $0 if no."
 *   pnlNow        a position's profit or loss at the price now
 *   ladder        profit or loss per outcome of several positions across related markets (spread or total lines, or one
 *                 event's exclusive outcomes), with outcomes that pay the same merged ("Lose by 1–3: +$160K")
 *   priceMoves    where the price was 1, 7 and 30 days ago, and the biggest moves with their exact windows
 *   entryProfile  when the money came in: its average entry and the price most of it came in under
 *   sizeVsUsual   how big a bet is for that wallet ("3.2× his usual bet")
 *   hundredOnEach what $100 on each settled bet would have made */
import { dollars } from "@/lib/money";

export const cents = (p: number): string => `${Math.round(p * 100)}¢`;
export const pctText = (p: number): string => `${Math.round(p * 100)}%`;
/** Signed money: "+$160K", "−$29K", "$0". */
export const signed = (v: number): string => (Math.round(v) === 0 ? "$0" : v > 0 ? `+${dollars(v)}` : dollars(v));

export interface Payout { impliedPct: number; shares: number; pays: number; profit: number }
/** A stake at a side's price: the shares it buys (each pays $1 if the side wins) and what they pay. */
export function payout(price: number, stake = 100): Payout {
  if (!(price > 0 && price < 1)) throw new RangeError("price must be between 0 and 1");
  const shares = stake / price;
  return { impliedPct: Math.round(price * 100), shares: Math.floor(shares), pays: Math.floor(shares), profit: Math.floor(shares) - stake };
}

/** "76¢ means the market says 76%. $100 buys 131 shares. They pay $131 if yes, $0 if no." */
export function payoutLine(price: number, sideLabel: string, stake = 100): string {
  const p = payout(price, stake);
  return `${cents(price)} means the market says ${p.impliedPct}%. ${dollars(stake)} buys ${p.shares} shares. They pay ${dollars(p.pays)} if ${sideLabel.toLowerCase()}, $0 if not.`;
}

/** A position's value and profit or loss at the price now. */
export function pnlNow(shares: number, cost: number, priceNow: number): { value: number; pnl: number; pnlPct: number } {
  const value = shares * priceNow;
  return { value, pnl: value - cost, pnlPct: cost > 0 ? (value - cost) / cost : 0 };
}

/* ---------- ladders and hedges ---------- */

/** One position in a ladder: what it cost, the shares it holds (each pays $1 if it wins), and when it wins. */
export interface LadderLeg { label: string; cost: number; shares: number }
/** A line on a number (a spread on the margin, or a total): "over" wins when the number is above the line, "under"
 *  when below; exactly on a whole-number line pushes (the money back). */
export interface LineLeg extends LadderLeg { line: number; dir: "over" | "under" }
export interface ScenarioPnl { label: string; pnl: number; from: number | null; to: number | null }

const legPnl = (l: LadderLeg, outcome: "win" | "lose" | "push") => (outcome === "win" ? l.shares - l.cost : outcome === "push" ? 0 : -l.cost);

function lineOutcome(l: LineLeg, x: number): "win" | "lose" | "push" {
  if (x === l.line) return "push";
  return (l.dir === "over" ? x > l.line : x < l.line) ? "win" : "lose";
}

/** Profit or loss per value of an integer number (a game's margin from one team's side, or a total), merged into ranges
 *  where it's the same. `label(from, to)` names a range (to null: and above; from null: and below). */
export function numericLadder(legs: readonly LineLeg[], label: (from: number | null, to: number | null) => string): ScenarioPnl[] {
  if (!legs.length) return [];
  const lines = legs.map(l => l.line);
  const lo = Math.floor(Math.min(...lines)) - 1, hi = Math.ceil(Math.max(...lines)) + 1;
  const rows: Array<{ x: number; pnl: number }> = [];
  for (let x = lo; x <= hi; x++) rows.push({ x, pnl: legs.reduce((a, l) => a + legPnl(l, lineOutcome(l, x)), 0) });
  const out: ScenarioPnl[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && Math.round(last.pnl) === Math.round(r.pnl)) { last.to = r.x; continue; }
    out.push({ label: "", pnl: r.pnl, from: r.x, to: r.x });
  }
  // The ends run on forever.
  out[0]!.from = null; out[out.length - 1]!.to = null;
  for (const s of out) s.label = label(s.from, s.to);
  return out;
}

/** Labels for a margin from one team's side: "Win by 8+", "Lose by exactly 4", "Lose by 1–3", "Tie", "Win". */
export function marginLabel(team: string) {
  const side = (n: number) => (n > 0 ? "Win" : "Lose");
  return (from: number | null, to: number | null): string => {
    if (from === null && to === null) return "Any result";
    if (from === null) return to! < 0 ? `${team} lose by ${-to!}+` : to === 0 ? `${team} lose or tie` : `${team} lose, tie or win by up to ${to}`;
    if (to === null) return from > 0 ? (from === 1 ? `${team} win` : `${team} win by ${from}+`) : from === 0 ? `${team} tie or win` : `${team} lose by up to ${-from} or win`;
    if (from === to) return from === 0 ? "Tie" : `${team} ${side(from).toLowerCase()} by exactly ${Math.abs(from)}`;
    if (from > 0) return `${team} win by ${from}–${to}`;
    if (to < 0) return `${team} lose by ${-to}–${-from}`;
    return `${team} lose by up to ${-from}, tie or win by up to ${to}`;
  };
}

/** Labels for a total: "Total 3 or less", "Total exactly 4", "Total 5–6", "Total 7+". */
export function totalLabel(what = "Total") {
  return (from: number | null, to: number | null): string => {
    if (from === null && to === null) return `Any ${what.toLowerCase()}`;
    if (from === null) return `${what} ${to} or less`;
    if (to === null) return `${what} ${from}+`;
    return from === to ? `${what} exactly ${from}` : `${what} ${from}–${to}`;
  };
}

/** One event's exclusive outcomes (one of them happens): a leg is YES or NO on one outcome. */
export interface ExclusiveLeg extends LadderLeg { outcome: string; side: "yes" | "no" }
export function exclusiveLadder(legs: readonly ExclusiveLeg[], outcomes: readonly string[]): ScenarioPnl[] {
  const all = [...new Set([...outcomes, ...legs.map(l => l.outcome)])];
  const rows = all.map(o => ({ label: o, from: null, to: null, pnl: legs.reduce((a, l) => a + legPnl(l, (l.side === "yes") === (l.outcome === o) ? "win" : "lose"), 0) }));
  // Outcomes no leg names pay the same: one row, "Anything else".
  const named = new Set(legs.map(l => l.outcome));
  const others = rows.filter(r => !named.has(r.label));
  const kept = rows.filter(r => named.has(r.label));
  if (others.length) kept.push({ label: others.length === 1 ? others[0]!.label : "Anything else", from: null, to: null, pnl: others[0]!.pnl });
  return kept;
}

/** "Lose by exactly 4: −$29K. Lose by 1–3: +$160K. Win: +$495K." */
export const ladderLine = (rows: readonly ScenarioPnl[]): string => rows.map(r => `${r.label}: ${signed(r.pnl)}`).join(". ") + ".";

/* ---------- the price over time ---------- */

export interface PricePoint { t: number; p: number }
export interface PriceMove { from: number; to: number; startAt: number; endAt: number }

/** The point at or before `at` (else the first after). */
export function priceAt(points: readonly PricePoint[], at: number): number | null {
  if (!points.length) return null;
  let best: PricePoint | null = null;
  for (const x of points) if (x.t <= at && (!best || x.t > best.t)) best = x;
  return (best ?? points.reduce((a, b) => (b.t < a.t ? b : a))).p;
}

/** The biggest moves: windows of up to `maxSpanMs` with the largest change, at least `minMove` (0.05 = 5 points),
 *  not overlapping, biggest first. */
export function priceMoves(points: readonly PricePoint[], o: { maxSpanMs?: number; minMove?: number; max?: number } = {}): PriceMove[] {
  const span = o.maxSpanMs ?? 12 * 3_600_000, min = o.minMove ?? 0.05, max = o.max ?? 3;
  const pts = [...points].sort((a, b) => a.t - b.t);
  const used: Array<[number, number]> = [];
  const out: PriceMove[] = [];
  while (out.length < max) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length && pts[j]!.t - pts[i]!.t <= span; j++) {
        const a = pts[i]!.t, b = pts[j]!.t;
        if (used.some(([s, e]) => a < e && b > s)) continue;
        const d = Math.abs(pts[j]!.p - pts[i]!.p);
        if (!best || d > best.d + 1e-9) best = { i, j, d };
      }
    }
    if (!best || best.d < min) break;
    // Trim the window to where the move actually happened: the last point before it starts and the first at its end.
    let { i, j } = best;
    const dir = Math.sign(pts[j]!.p - pts[i]!.p);
    while (i + 1 < j && Math.sign(pts[j]!.p - pts[i + 1]!.p) === dir && Math.abs(pts[j]!.p - pts[i + 1]!.p) >= best.d - 1e-9) i++;
    while (j - 1 > i && Math.abs(pts[j - 1]!.p - pts[i]!.p) >= best.d - 1e-9) j--;
    out.push({ from: pts[i]!.p, to: pts[j]!.p, startAt: pts[i]!.t, endAt: pts[j]!.t });
    used.push([pts[i]!.t, pts[j]!.t]);
  }
  return out;
}

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" });
const ET_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
/** "6 p.m.", "6:30 a.m.", "midnight", "noon" (ET). */
export function etClock(ms: number): string {
  const s = ET_HOUR.format(new Date(ms)).toLowerCase();
  if (s === "12:00 am") return "midnight";
  if (s === "12:00 pm") return "noon";
  return s.replace(":00", "").replace(" am", " a.m.").replace(" pm", " p.m.");
}
/** "Thursday 6 p.m.–midnight" (same day), "Thursday 11 p.m.–Friday 2 a.m."; past a week, the date ("Nov 3"). */
export function etWindow(a: number, b: number, now: number): string {
  const day = (ms: number) => (now - ms > 6 * 86_400_000 ? ET_DATE.format(new Date(ms)) : ET_DAY.format(new Date(ms)));
  // Midnight ends the day it closes: "Thursday 6 p.m.–midnight".
  const same = day(a) === day(b) || (etClock(b) === "midnight" && day(a) === day(b - 1));
  return same ? `${day(a)} ${etClock(a)}–${etClock(b)}` : `${day(a)} ${etClock(a)}–${day(b)} ${etClock(b)}`;
}
/** "24% → 40% Thursday 6 p.m.–midnight". */
export const moveLine = (m: PriceMove, now: number): string => `${pctText(m.from)} → ${pctText(m.to)} ${etWindow(m.startAt, m.endAt, now)}`;

/* ---------- when the money came in ---------- */

export interface Entry { price: number; amount: number; at: number }
export interface EntryProfile { dollars: number; avgEntry: number; mostUnder: number | null; firstAt: number; lastAt: number }
/** The money-weighted average entry, and the lowest price (in 5¢ steps) at least half the money came in under. */
export function entryProfile(entries: readonly Entry[]): EntryProfile | null {
  const xs = entries.filter(e => e.amount > 0 && e.price > 0 && e.price < 1);
  const total = xs.reduce((a, e) => a + e.amount, 0);
  if (!total) return null;
  const avg = xs.reduce((a, e) => a + e.price * e.amount, 0) / total;
  let mostUnder: number | null = null;
  for (let c = 5; c <= 95; c += 5) {
    if (xs.filter(e => e.price < c / 100).reduce((a, e) => a + e.amount, 0) / total >= 0.5) { mostUnder = c / 100; break; }
  }
  return { dollars: total, avgEntry: avg, mostUnder, firstAt: Math.min(...xs.map(e => e.at)), lastAt: Math.max(...xs.map(e => e.at)) };
}

/** "Most of the YES money came in under 25¢. You'd be buying at 76¢." */
export function earlyLateLine(p: EntryProfile, sideLabel: string, priceNow: number): string {
  const head = p.mostUnder !== null && p.mostUnder < priceNow
    ? `Most of the ${sideLabel} money came in under ${cents(p.mostUnder)}.`
    : `The ${sideLabel} money came in at ${cents(p.avgEntry)} on average.`;
  return `${head} You'd be buying at ${cents(priceNow)}.`;
}

/* ---------- wallets ---------- */

/** How many times their usual (median) bet this is, to one decimal; null without a usual bet. */
export const sizeVsUsual = (amount: number, usual: number | null): number | null => (usual && usual > 0 ? Math.round((amount / usual) * 10) / 10 : null);

export interface Settled { price: number; result: "won" | "lost" | "void" }
/** $100 on each settled bet at its entry price: what came back, net. */
export function hundredOnEach(bets: readonly Settled[]): { n: number; won: number; lost: number; net: number } {
  let net = 0, won = 0, lost = 0;
  for (const b of bets) {
    if (b.result === "won" && b.price > 0) { net += 100 / b.price - 100; won++; }
    else if (b.result === "lost") { net -= 100; lost++; }
  }
  return { n: bets.length, won, lost, net };
}

/** "14–6", "$100 on each: +$412" */
export const recordLine = (r: { won: number; lost: number; net: number }): string => `${r.won}–${r.lost}, $100 on each: ${signed(r.net)}`;
