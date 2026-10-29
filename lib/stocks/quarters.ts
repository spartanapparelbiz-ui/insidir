/* A fund's 13F quarter against the one before (lib/profiles/sec.ts quarterChanges): the reported value and its change,
 * and how many positions are new, added to, cut or sold out. Pure. */
import { quarterChanges, type HoldingLike } from "@/lib/profiles/sec";

export interface QuarterSummary { value: number; prevValue: number | null; change: number | null; positions: number; new: number; added: number; cut: number; soldOut: number }

export function quarterSummary(cur: readonly HoldingLike[], prev: readonly HoldingLike[] | null): QuarterSummary {
  const value = cur.reduce((s, h) => s + h.value, 0);
  if (!prev) return { value, prevValue: null, change: null, positions: cur.length, new: 0, added: 0, cut: 0, soldOut: 0 };
  const prevValue = prev.reduce((s, h) => s + h.value, 0);
  const { adds, cuts } = quarterChanges(prev, cur, 100_000);
  return { value, prevValue, change: prevValue > 0 ? value / prevValue - 1 : null, positions: cur.length,
    new: adds.filter(a => a.kind === "new").length, added: adds.filter(a => a.kind === "added").length,
    cut: cuts.filter(c => c.kind === "cut").length, soldOut: cuts.filter(c => c.kind === "sold").length };
}
