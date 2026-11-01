/* The Read, the pure parts: the proven-money split, which big bets are unusual, the best price per side, how well a
 * market matches what someone typed, and the facts the analyst line may use (with the template line built from them). */
import type { Facts } from "@/lib/analyst/types";
import type { BigBet, Choice, ProvenMoney, Resolved, SidePrices, Unusual, Venue } from "./types";

/* ---------- proven money ---------- */

/** Proven wallets' open dollars by side → the split. A wallet on both sides counts once in `wallets`. */
export function provenSplit(rows: ReadonlyArray<{ wallet: string; side: "yes" | "no"; dollars: number }>): ProvenMoney {
  const by = { yes: new Map<string, number>(), no: new Map<string, number>() };
  for (const r of rows) if (r.dollars > 0) by[r.side].set(r.wallet, (by[r.side].get(r.wallet) ?? 0) + r.dollars);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const yes = { dollars: sum(by.yes), wallets: by.yes.size }, no = { dollars: sum(by.no), wallets: by.no.size };
  const total = yes.dollars + no.dollars;
  return { yes, no, wallets: new Set([...by.yes.keys(), ...by.no.keys()]).size, yesShare: total > 0 ? yes.dollars / total : null };
}

/* ---------- unusual bets ---------- */

/** A bet this share of the market's last-24h volume or more is big for that market. */
export const BIG_SHARE = 0.2;
/** A side priced at or under this is the long shot. */
export const LONG_SHOT = 0.15;

/** Why a big bet stands out: a wallet with no history, a size large against the market's own day, or the long-shot side.
 *  "Unusual" only describes the data; it never says anyone knows anything. */
export function unusualOf(b: { amount: number; price: number; newWallet?: boolean | null }, volume24h: number | null): { unusual: Unusual[]; ofVolume: number | null } {
  const unusual: Unusual[] = [];
  if (b.newWallet) unusual.push("fresh_wallet");
  const ofVolume = volume24h && volume24h > 0 ? b.amount / volume24h : null;
  if (ofVolume !== null && ofVolume >= BIG_SHARE) unusual.push("big_for_market");
  if (b.price > 0 && b.price <= LONG_SHOT) unusual.push("long_shot");
  return { unusual, ofVolume };
}

export const UNUSUAL_TEXT: Record<Unusual, string> = { fresh_wallet: "fresh wallet", big_for_market: "big for this market", long_shot: "long-shot side" };

/* ---------- prices ---------- */

/** Each side's price on each venue (Kalshi's already turned to the main listing's sides) and the cheaper one. */
export function sidePrices(polyYes: number | null, kalshiYes: number | null): { yes: SidePrices; no: SidePrices } {
  const ok = (p: number | null): p is number => p !== null && Number.isFinite(p) && p > 0 && p < 1;
  const side = (p: number | null, k: number | null): SidePrices => {
    const pp = ok(p) ? p : null, kk = ok(k) ? k : null;
    const best: Venue | null = pp === null && kk === null ? null : pp === null ? "kalshi" : kk === null ? "polymarket" : kk <= pp ? "kalshi" : "polymarket";
    return { polymarket: pp, kalshi: kk, best };
  };
  return { yes: side(polyYes, kalshiYes), no: side(ok(polyYes) ? 1 - polyYes : null, ok(kalshiYes) ? 1 - kalshiYes : null) };
}

/** What a viewer may see: in the US (or an unknown region) Kalshi only, never Polymarket. */
export function pricesFor(p: { yes: SidePrices; no: SidePrices }, us: boolean): { yes: SidePrices; no: SidePrices } {
  if (!us) return p;
  const k = (s: SidePrices): SidePrices => ({ polymarket: null, kalshi: s.kalshi, best: s.kalshi === null ? null : "kalshi" });
  return { yes: k(p.yes), no: k(p.no) };
}

/* ---------- matching what someone typed ---------- */

const STOP = new Set("the a an of on in at to for vs v will win wins who what is be and or by over under tonight today game match market odds bet".split(" "));
export const queryWords = (s: string): string[] => [...new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w)))];

/** 0..1: the share of the typed words found in the market's title and event (whole words, or a 4+ letter prefix). */
export function textScore(q: string, title: string, event: string | null): number {
  const qs = queryWords(q);
  if (!qs.length) return 0;
  const hay = new Set(`${title} ${event ?? ""}`.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/));
  const hit = qs.filter(w => hay.has(w) || (w.length >= 4 && [...hay].some(h => h.startsWith(w) || (h.length >= 4 && w.startsWith(h))))).length;
  return hit / qs.length;
}

/** The answer to a search: one market when it clearly wins, else up to 3 to pick from, else none. */
export function choose(scored: ReadonlyArray<Choice & { score: number; volume: number }>, min = 0.5, margin = 0.2): Resolved {
  const seen = new Set<string>();
  const list = [...scored].filter(c => c.score >= min).sort((a, b) => b.score - a.score || b.volume - a.volume)
    .filter(c => !seen.has(c.key) && Boolean(seen.add(c.key)));
  if (!list.length) return { kind: "none", why: "We couldn't find that market on Polymarket or Kalshi. Try a link, or other words." };
  const [a, b] = list;
  if (!b || (a!.score >= 0.99 && b.score < 0.99) || a!.score - b.score >= margin) return { kind: "market", venue: a!.venue, id: a!.id };
  return { kind: "choices", list: list.slice(0, 3).map(({ score: _s, volume: _v, ...c }) => c) };
}

/* ---------- the analyst line ---------- */

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const cents = (p: number | null): string => (p === null ? "—" : `${Math.round(p * 100)}¢`);
export function usd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${Math.round(a)}`;
}

export interface LineInput { key: string; yesLabel: string; noLabel: string; proven: ProvenMoney; bets: readonly BigBet[]; prices: { yes: SidePrices; no: SidePrices }; at: number }

/** Everything the analyst line may say, as exact texts (the validator holds it to these). */
export function readFacts(r: LineInput): Facts {
  const facts: Facts["facts"] = [];
  const p = r.proven;
  if (p.yesShare !== null) {
    const lead = p.yesShare >= 0.5 ? "yes" : "no";
    const label = lead === "yes" ? r.yesLabel : r.noLabel;
    facts.push({ key: "proven_split", label: "Proven money split", text: `${pct(lead === "yes" ? p.yesShare : 1 - p.yesShare)} of proven money is on ${label}` });
    facts.push({ key: "proven_wallets", label: "Proven wallets", text: `${p.wallets} proven ${p.wallets === 1 ? "wallet" : "wallets"}, ${usd(p.yes.dollars + p.no.dollars)} in all` });
  } else facts.push({ key: "proven_none", label: "Proven money", text: "no proven wallets hold a position" });
  if (r.bets.length) {
    const total = r.bets.reduce((a, b) => a + b.amount, 0);
    facts.push({ key: "bets", label: "Big bets, last 24 hours", text: `${r.bets.length} big ${r.bets.length === 1 ? "bet" : "bets"} in the last 24 hours, ${usd(total)} in all` });
    const top = [...r.bets].sort((a, b) => b.amount - a.amount)[0]!;
    facts.push({ key: "largest", label: "Largest", text: `the largest is ${usd(top.amount)} on ${top.side === "yes" ? r.yesLabel : r.noLabel} at ${cents(top.price)}` });
    const odd = r.bets.filter(b => b.unusual.length).length;
    if (odd) facts.push({ key: "unusual", label: "Unusual", text: `${odd} flagged unusual` });
  } else facts.push({ key: "bets_none", label: "Big bets, last 24 hours", text: "no big bets in the last 24 hours" });
  for (const [side, label] of [["yes", r.yesLabel], ["no", r.noLabel]] as const) {
    const s = r.prices[side];
    const parts = [s.kalshi !== null ? `${cents(s.kalshi)} on Kalshi` : null, s.polymarket !== null ? `${cents(s.polymarket)} on Polymarket` : null].filter(Boolean);
    if (parts.length) facts.push({ key: `price_${side}`, label: `${label} price`, text: `${label} costs ${parts.join(" and ")}` });
  }
  return { moveId: r.key, kind: "bet", names: [r.yesLabel, r.noLabel, "Kalshi", "Polymarket"], facts, at: r.at };
}

/** The line without a model: the facts, in a fixed sentence. Always passes the validator. */
export function templateLine(f: Facts): string {
  const get = (k: string) => f.facts.find(x => x.key === k)?.text ?? null;
  const first = get("proven_split") ?? get("proven_none");
  const second = get("largest") ?? get("bets_none");
  const s = [first, second].filter(Boolean).join("; ");
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : "";
}
