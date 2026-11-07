/* Autopilot rules (/autopilot): what a member wants to bet when a proven wallet bets, in plain controls. Pure: the
 * rule's shape and defaults, whether a wallet's move matches it, the finished Kalshi ticket for a match, and the
 * "too late" guard. The engine (lib/autopilot/engine.ts) feeds these from the database; Insidir never places a bet.
 *
 * Prices are dollars per contract (0..1); the guard's "moved" is in cents for the member's sake. */
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/brand/categories";

export const LEAGUES = [
  { slug: "nba", name: "NBA" }, { slug: "nfl", name: "NFL" }, { slug: "nhl", name: "NHL" }, { slug: "mlb", name: "MLB" },
  { slug: "cfb", name: "College football" }, { slug: "cbb", name: "College basketball" },
  { slug: "epl", name: "Premier League" }, { slug: "ucl", name: "Champions League" }, { slug: "mls", name: "MLS" },
] as const;
export type LeagueSlug = typeof LEAGUES[number]["slug"];
const LEAGUE_SET = new Set<string>(LEAGUES.map(l => l.slug));

export interface RuleSpec {
  wallets: {
    /** "proven": every proven wallet; "followed": only the ones listed. */
    from: "proven" | "followed";
    follow: string[];
    /** At least this many settled positions (30 is what proven already requires). */
    minSettled: number;
  };
  markets: { categories: CategorySlug[]; leagues: LeagueSlug[]; races: string[]; exclude: string[] };
  triggers: {
    /** The wallet's buy is at least this many dollars. */
    minBet: number;
    /** Only the wallet's first entry into the market (an open, not an add). */
    firstEntry: boolean;
    /** Only when 2+ proven wallets took the same side within an hour. */
    consensus: boolean;
  };
  price: {
    /** Never pay more than this on Kalshi (dollars, 0..1). */
    max: number;
    /** The most Kalshi may be above what they paid (cents). */
    maxMoveCents: number;
  };
  stake: { perBet: number; daily: number; weekly: number };
  /** Quiet hours, "HH:MM" in the member's time zone; null for none. Matches still log; they just don't push. */
  quiet: { start: string | null; end: string | null };
}

export const DEFAULT_SPEC: RuleSpec = {
  wallets: { from: "proven", follow: [], minSettled: 30 },
  markets: { categories: [], leagues: [], races: [], exclude: [] },
  triggers: { minBet: 25_000, firstEntry: false, consensus: false },
  price: { max: 0.85, maxMoveCents: 5 },
  stake: { perBet: 25, daily: 100, weekly: 300 },
  quiet: { start: null, end: null },
};

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const strs = (v: unknown, max = 50) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean))].slice(0, max) : [];
const hhmm = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;

/** Anything from a form or the database → a valid rule (clamped, unknowns dropped). Pure. */
export function cleanSpec(raw: unknown): RuleSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const w = r.wallets ?? {}, m = r.markets ?? {}, t = r.triggers ?? {}, p = r.price ?? {}, s = r.stake ?? {}, q = r.quiet ?? {};
  const perBet = num(s.perBet, 1, 10_000, DEFAULT_SPEC.stake.perBet);
  const daily = num(s.daily, perBet, 100_000, Math.max(perBet, DEFAULT_SPEC.stake.daily));
  return {
    wallets: { from: w.from === "followed" ? "followed" : "proven", follow: strs(w.follow).map(x => x.toLowerCase()).filter(x => /^0x[0-9a-f]{40}$/.test(x)), minSettled: Math.round(num(w.minSettled, 30, 10_000, 30)) },
    markets: { categories: strs(m.categories).filter((x): x is CategorySlug => (CATEGORY_SLUGS as readonly string[]).includes(x)),
      leagues: strs(m.leagues).filter((x): x is LeagueSlug => LEAGUE_SET.has(x)), races: strs(m.races, 20), exclude: strs(m.exclude, 20) },
    triggers: { minBet: Math.round(num(t.minBet, 5_000, 10_000_000, DEFAULT_SPEC.triggers.minBet)), firstEntry: t.firstEntry === true, consensus: t.consensus === true },
    price: { max: Math.round(num(p.max, 0.02, 0.99, DEFAULT_SPEC.price.max) * 100) / 100, maxMoveCents: Math.round(num(p.maxMoveCents, 0, 50, DEFAULT_SPEC.price.maxMoveCents)) },
    stake: { perBet, daily, weekly: num(s.weekly, daily, 1_000_000, Math.max(daily, DEFAULT_SPEC.stake.weekly)) },
    quiet: { start: hhmm(q.start), end: hhmm(q.end) },
  };
}

/** The league in a Polymarket event URL ("…/event/nba-mia-lal-2026-11-04"), or null. Pure. */
export function leagueOf(url: string | null): LeagueSlug | null {
  const p = /\/event\/([a-z]+)-/.exec(url ?? "")?.[1] ?? "";
  return LEAGUE_SET.has(p) ? p as LeagueSlug : null;
}

/** A wallet's buy, as the engine sees it. */
export interface Move {
  id: string;
  wallet: string;
  kind: "open" | "add" | "trim" | "exit";
  marketId: string;
  side: "yes" | "no";
  outcome: string;
  title: string;
  eventTitle: string;
  category: string;
  url: string | null;
  amount: number;
  /** What they paid, per contract. */
  price: number;
  at: number;
  /** The wallet: proven now, its settled positions. */
  proven: boolean;
  settled: number | null;
  /** Distinct proven wallets on this market and side in the hour up to this move, this one included. */
  sameSide: number;
}

/** Why a move doesn't match a rule, or null when it does. Buys only. Pure. */
export function mismatch(spec: RuleSpec, m: Move): string | null {
  if (m.kind !== "open" && m.kind !== "add") return "not a buy";
  if (spec.wallets.from === "followed" ? !spec.wallets.follow.includes(m.wallet.toLowerCase()) : !m.proven) return "wallet";
  if ((m.settled ?? 0) < spec.wallets.minSettled) return "record";
  if (spec.markets.categories.length && !spec.markets.categories.includes(m.category as CategorySlug)) return "category";
  if (spec.markets.leagues.length) { const l = leagueOf(m.url); if (!l || !spec.markets.leagues.includes(l)) return "league"; }
  const text = `${m.eventTitle} ${m.title} ${m.outcome}`.toLowerCase();
  if (spec.markets.races.length && !spec.markets.races.some(r => text.includes(r.toLowerCase()))) return "race";
  if (spec.markets.exclude.some(x => text.includes(x.toLowerCase()))) return "excluded";
  if (m.amount < spec.triggers.minBet) return "size";
  if (spec.triggers.firstEntry && m.kind !== "open") return "not first entry";
  if (spec.triggers.consensus && m.sameSide < 2) return "no consensus";
  return null;
}

interface Ticket { limit: number; contracts: number; cost: number }

/** The finished Kalshi order: limit = min(rule max, Kalshi ask), as many whole contracts as the stake buys. Pure. */
export function ticketFor(spec: RuleSpec, ask: number, stake = spec.stake.perBet): Ticket | null {
  const limit = Math.round(Math.min(spec.price.max, ask) * 100) / 100;
  if (!(limit > 0)) return null;
  const contracts = Math.floor(stake / limit + 1e-9);
  return contracts >= 1 ? { limit, contracts, cost: Math.round(contracts * limit * 100) / 100 } : null;
}

const c = (p: number) => `${Math.round(p * 100)}¢`;

/** The too-late guard: why not to push at this Kalshi ask, or null. Pure. */
export function tooLate(spec: RuleSpec, theirPrice: number, ask: number | null): string | null {
  if (ask === null) return "Skipped: Kalshi has no offer on this side right now";
  if (ask - theirPrice > spec.price.maxMoveCents / 100 + 1e-9) return `Skipped: they paid ${c(theirPrice)}, Kalshi is ${c(ask)} now`;
  if (ask > spec.price.max + 1e-9) return `Skipped: Kalshi is ${c(ask)}, over your ${c(spec.price.max)} limit`;
  return null;
}

/** What's left of the daily and weekly caps after `spentToday` / `spentWeek`; the stake for the next match, or 0. Pure. */
export function stakeLeft(spec: RuleSpec, spentToday: number, spentWeek: number): number {
  return Math.max(0, Math.min(spec.stake.perBet, spec.stake.daily - spentToday, spec.stake.weekly - spentWeek));
}

/** One line a member reads for a rule ("Proven wallets · $25K+ · NBA · up to 85¢ · $25 a bet"). Pure. */
export function describe(spec: RuleSpec): string {
  const k = (n: number) => n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
  const parts = [spec.wallets.from === "followed" ? `${spec.wallets.follow.length} followed ${spec.wallets.follow.length === 1 ? "wallet" : "wallets"}` : "Proven wallets",
    `bets of ${k(spec.triggers.minBet)}+`];
  if (spec.triggers.firstEntry) parts.push("first entry");
  if (spec.triggers.consensus) parts.push("2+ wallets agree");
  const where = [...spec.markets.leagues.map(l => LEAGUES.find(x => x.slug === l)!.name), ...spec.markets.categories, ...spec.markets.races];
  if (where.length) parts.push(where.slice(0, 3).join(", ") + (where.length > 3 ? ` +${where.length - 3}` : ""));
  parts.push(`up to ${c(spec.price.max)}`, `$${spec.stake.perBet} a bet`);
  return parts.join(" · ");
}
