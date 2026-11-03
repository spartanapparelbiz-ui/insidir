/* The check's verdict: given the side someone is on, where the millionaire money in that market is. It describes the
 * data and is never advice ("Millionaires agree with you" means the $1M+ wallets' open money is mostly on that side,
 * nothing more). Pure.
 *   agree    65%+ of the millionaire dollars are on their side
 *   against  35% or less
 *   split    in between
 *   none     no millionaire money in this market yet
 * One or two wallets still get a verdict; the evidence line says how many wallets it rests on. */
import { dollars } from "@/lib/money";

export type Side = "yes" | "no";
export type VerdictKind = "agree" | "against" | "split" | "none";
export interface Verdict { kind: VerdictKind; headline: string; evidence: string | null }

export const AGREE_SHARE = 0.65, AGAINST_SHARE = 0.35;

export const HEADLINE: Record<VerdictKind, string> = {
  agree: "Millionaires agree with you",
  against: "Millionaires are on the other side",
  split: "Millionaires are split",
  none: "No millionaire money here yet",
};

export interface VerdictInput {
  /** Millionaire-tier money per side. */
  yes: { dollars: number; wallets: number };
  no: { dollars: number; wallets: number };
  yesLabel: string;
  noLabel: string;
  /** The biggest millionaire wallet's all-time profit on each side, when known. */
  topPnl?: Partial<Record<Side, number | null>>;
}

const w = (n: number) => `${n} ${n === 1 ? "wallet" : "wallets"}`;

/** "1 wallet up $3.1M all-time has $74K on Grizzlies" / "3 wallets with $1M+ all-time profit have $210K on Grizzlies". */
function oneSide(n: number, amount: number, label: string, pnl: number | null | undefined): string {
  if (n === 1) return `1 wallet ${pnl ? `up ${dollars(pnl)} all-time` : "with $1M+ all-time profit"} has ${dollars(amount)} on ${label}`;
  return `${n} wallets with $1M+ all-time profit have ${dollars(amount)} on ${label}`;
}

export function verdict(m: VerdictInput, mine: Side): Verdict {
  const y = m.yes.dollars, n = m.no.dollars, total = y + n;
  if (total <= 0) return { kind: "none", headline: HEADLINE.none, evidence: null };
  const share = (mine === "yes" ? y : n) / total;
  const kind: VerdictKind = share >= AGREE_SHARE ? "agree" : share <= AGAINST_SHARE ? "against" : "split";
  const label = (s: Side) => (s === "yes" ? m.yesLabel : m.noLabel);
  let evidence: string;
  if (!n || !y) {
    const s: Side = y ? "yes" : "no";
    evidence = oneSide(m[s].wallets, m[s].dollars, label(s), m.topPnl?.[s]);
  } else {
    evidence = `${dollars(y)} on ${m.yesLabel} from ${w(m.yes.wallets)}, ${dollars(n)} on ${m.noLabel} from ${w(m.no.wallets)}`;
  }
  return { kind, headline: HEADLINE[kind], evidence };
}

/** The side the most millionaire money is on (the demo picks it, so the demo shows a verdict with real money). */
export const heavierSide = (m: VerdictInput): Side => (m.yes.dollars >= m.no.dollars ? "yes" : "no");

/** One sentence describing where a market's $1M+ money is (the free #1 market's analyst line). Data, not advice. */
export function dataLine(m: VerdictInput & { pro?: { yes: { dollars: number; wallets: number }; no: { dollars: number; wallets: number } } }): string {
  const y = m.yes.dollars, n = m.no.dollars, t = y + n;
  if (!t) return "No $1M+ wallet holds this market yet.";
  const [hi, lo] = y >= n ? (["yes", "no"] as const) : (["no", "yes"] as const);
  const label = (s: Side) => (s === "yes" ? m.yesLabel : m.noLabel);
  const main = !m[lo].dollars
    ? `All ${dollars(m[hi].dollars)} of the millionaire money here is on ${label(hi)}, from ${w(m[hi].wallets)}.`
    : `Millionaire money is ${Math.round((m[hi].dollars / t) * 100)}% on ${label(hi)}: ${dollars(m[hi].dollars)} from ${w(m[hi].wallets)} against ${dollars(m[lo].dollars)} from ${w(m[lo].wallets)}.`;
  const pro = m.pro ? m.pro.yes.dollars + m.pro.no.dollars : 0;
  if (!pro || !m.pro) return main;
  const proHi: Side = m.pro.yes.dollars >= m.pro.no.dollars ? "yes" : "no";
  return `${main} Pro wallets lean ${label(proHi)} with ${dollars(m.pro[proHi].dollars)}.`;
}
