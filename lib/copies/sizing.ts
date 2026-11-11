/* Your size (how much): a wallet's trade as a share of its bankroll (lib/verified: the most it has held in open positions
 * at once in 90 days, or its holdings now), and the same share of the member's bankroll, never above their max per
 * trade. "They put in 2%. Your size: $40." It's a matched size, not advice. Pure. */

export interface CopySettings { bankroll: number; maxTrade: number; dropCents: number | null }
export const MIN_BANKROLL = 10, MAX_BANKROLL = 10_000_000;
export const DEFAULT_DROP_CENTS = 10;
export const SIZE_LABEL = "matched size, not advice";

export function validCopySettings(v: unknown): CopySettings | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, bankroll = Number(o.bankroll), maxTrade = Number(o.maxTrade);
  const drop = o.dropCents === null || o.dropCents === undefined || o.dropCents === "" ? null : Number(o.dropCents);
  if (!Number.isFinite(bankroll) || bankroll < MIN_BANKROLL || bankroll > MAX_BANKROLL) return null;
  if (!Number.isFinite(maxTrade) || maxTrade < 1 || maxTrade > bankroll) return null;
  if (drop !== null && (!Number.isFinite(drop) || drop < 1 || drop > 99)) return null;
  return { bankroll: Math.round(bankroll * 100) / 100, maxTrade: Math.round(maxTrade * 100) / 100, dropCents: drop === null ? null : Math.round(drop) };
}

export interface YourSize { theirPct: number; yours: number; capped: boolean }

/** Their share and your size, in whole dollars (at least $1); null without both bankrolls. */
export function matchedSize(theirAmount: number, walletBankroll: number | null, mine: CopySettings | null): YourSize | null {
  if (!mine || !walletBankroll || walletBankroll <= 0 || !(theirAmount > 0)) return null;
  const theirPct = Math.min(1, theirAmount / Math.max(walletBankroll, theirAmount));
  const raw = theirPct * mine.bankroll, yours = Math.max(1, Math.round(Math.min(raw, mine.maxTrade)));
  return { theirPct, yours, capped: raw > mine.maxTrade };
}

/** "2%", "0.4%", "<0.1%". */
export function pctText(p: number): string {
  const v = p * 100;
  return v < 0.1 ? "<0.1%" : v < 10 ? `${(Math.round(v * 10) / 10).toString()}%` : `${Math.round(v)}%`;
}

/** "They put in 2%. Your size: $40." */
export function sizeLine(s: YourSize): string {
  return `They put in ${pctText(s.theirPct)}. Your size: $${s.yours.toLocaleString("en-US")}${s.capped ? " (your max)" : ""}.`;
}
