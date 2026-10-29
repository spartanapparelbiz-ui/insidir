/* The words for splits (lib/smart/splits.ts), pure: card lines, alerts and links. Always the two real numbers side by
 * side; never a tip. */
import type { SplitKind } from "@/lib/db/schema";

export interface SplitLike {
  id: string; kind: SplitKind; subject: string; title: string; subtitle: string | null; crowd: number | null; smart: number | null; gap: number;
  smartSide: string; detail: Record<string, unknown>;
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
const money = (n: number): string => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;

/** The YES side's name when it isn't just "Yes" ("Brewers", "Above $100K"). */
export function yesName(d: Record<string, unknown>): string | null {
  const y = typeof d.yesLabel === "string" ? d.yesLabel.trim() : "";
  return y && !/^yes$/i.test(y) ? y : null;
}

/** "Crowd 62% · Smart money 81%" (a game: "Big bets 70% · Proven traders 30%"), with the side when it's named. */
export function splitLine(s: Pick<SplitLike, "kind" | "crowd" | "smart" | "detail">): string {
  if (s.crowd === null || s.smart === null) return stockLine(s.detail, s.kind);
  const on = yesName(s.detail);
  const [a, b] = s.kind === "bigmoney" ? ["Big bets", "Proven traders"] : ["Crowd", "Smart money"];
  return `${a} ${pct(s.crowd)} · ${b} ${pct(s.smart)}${on ? ` on ${on}` : ""}`;
}

/** "Insiders bought $2.1M while it fell 18% in 30 days" / "3 big funds added $40M in a quarter it fell 14%". */
export function stockLine(d: Record<string, unknown>, kind: SplitKind): string {
  const v = money(Number(d.value ?? 0));
  if (kind === "fund_add") {
    const n = Array.isArray(d.funds) ? d.funds.length : 0;
    return `${n === 1 ? "A big fund" : `${n} big funds`} added ${v} in a quarter it fell`;
  }
  const n = Array.isArray(d.owners) ? d.owners.length : 0;
  return `${n === 1 ? "An insider" : `${n} insiders`} bought ${v} after a 30-day fall`;
}

/** "19 pts apart" for markets, "−18% in 30 days" for stocks. */
export function gapLabel(s: Pick<SplitLike, "kind" | "gap">): string {
  if (s.kind === "insider_dip") return `−${s.gap}% in 30 days`;
  if (s.kind === "fund_add") return `−${s.gap}% that quarter`;
  return `${Math.round(s.gap)} pts apart`;
}

export const KIND_NAME: Record<SplitKind, string> = { crowd: "Smart money vs. the crowd", bigmoney: "Big bets vs. proven traders", insider_dip: "Insiders buying the dip", fund_add: "Funds adding while it falls" };

export function splitHref(s: Pick<SplitLike, "kind" | "subject" | "detail">): string {
  if (s.kind === "insider_dip" || s.kind === "fund_add") return `/insider-trading/${encodeURIComponent(String(s.detail.ticker ?? s.subject.split(":")[0]))}`;
  return `/market/${encodeURIComponent(s.subject)}`;
}

/** The push alert for a new split. */
export function splitMessage(s: SplitLike, appUrl: string): { title: string; body: string; url: string } {
  const head = s.kind === "crowd" || s.kind === "bigmoney" ? `${KIND_NAME[s.kind]}: ${Math.round(s.gap)} pts` : `${KIND_NAME[s.kind]}: ${s.subtitle ?? ""}`.trim();
  const who = s.kind === "crowd" || s.kind === "bigmoney" ? ` (${Number(s.detail.wallets ?? 0)} proven traders)` : ` (−${s.gap}%)`;
  return { title: head, body: `${s.title}. ${splitLine(s)}${who}. Data, not a recommendation.`, url: `${appUrl}${splitHref(s)}?from=split` };
}
