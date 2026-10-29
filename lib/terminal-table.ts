/* The Terminal table's client-side controls, pure: filter the rows the server sent (category, minimum ROI, minimum
 * size, safety light, search) and sort them. The server has already applied the plan, the region and the member's
 * saved settings; these only narrow what's on screen. A locked (free) row has no size, so a size filter leaves it
 * alone rather than guessing. */
import type { FeedRow } from "./feed";
import type { Safety } from "./types";

export type SortKey = "perDay" | "profit" | "roi" | "newest";
export const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "perDay", label: "Net P&L per day" }, { key: "profit", label: "Net P&L after fees" }, { key: "roi", label: "ROI" }, { key: "newest", label: "Newest" },
];

export interface TableFilter {
  category: string;
  /** A fraction: 0.02 = 2%. */
  minRoi: number;
  minSize: number;
  safety: Safety | "";
  q: string;
}
export const NO_FILTER: TableFilter = { category: "", minRoi: 0, minSize: 0, safety: "", q: "" };

export function filterRows(rows: readonly FeedRow[], f: TableFilter): FeedRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(r =>
    (!f.category || r.categories.includes(f.category))
    && (f.minRoi <= 0 || r.kind === "second_opinion" || r.roi >= f.minRoi)
    && (f.minSize <= 0 || r.cost === null || r.cost + (r.fees ?? 0) >= f.minSize)
    && (!f.safety || r.safety === f.safety)
    && (!q || r.title.toLowerCase().includes(q) || r.play.toLowerCase().includes(q)));
}

const val = (r: FeedRow, k: SortKey): number =>
  k === "newest" ? r.foundAt : k === "roi" ? r.roi : k === "profit" ? (r.profit ?? r.roi) : (r.profitPerDay ?? r.roi);

/** Live rows before stale ones, second opinions (not locks) last, then by the chosen key, best first. */
export function sortRows(rows: readonly FeedRow[], k: SortKey): FeedRow[] {
  return [...rows].sort((a, b) => Number(a.stale) - Number(b.stale)
    || Number(a.kind === "second_opinion") - Number(b.kind === "second_opinion")
    || val(b, k) - val(a, k) || b.roi - a.roi);
}

/** Categories present in the rows, for the filter menu. */
export const categoriesOf = (rows: readonly FeedRow[]): string[] => [...new Set(rows.flatMap(r => r.categories))].sort();

/** The play as the table writes it: "YES Kalshi 55¢ + NO Polymarket US 40¢". */
export function playShort(r: Pick<FeedRow, "kind" | "legs" | "gapCents">): string {
  if (r.kind === "second_opinion") return `${r.gapCents ?? 0}¢ apart: ${r.legs.map(l => `${l.venueName} ${Math.round(l.priceCents)}¢`).join(" vs ")}`;
  return r.legs.map(l => `${l.side.toUpperCase()} ${l.venueName} ${Number.isInteger(l.priceCents) ? l.priceCents : l.priceCents.toFixed(1)}¢`).join(" + ");
}
