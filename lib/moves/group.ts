import { dollars } from "@/lib/money";
/* Bets on the same outcome within GROUP_MS of the group's first one become one card, pure: "4 big bets on Brewers ·
 * $68,765", opened to show each bet. Order is kept (newest first); a group sits where its newest bet is. */
export const GROUP_MS = 60 * 60_000;

export interface Groupable { id: string; marketId: string; outcome: string; source: string; at: number; amount: number }

/** Newest-first items in, newest-first groups out (a single bet is a group of one). */
export function groupBets<T extends Groupable>(items: readonly T[], windowMs = GROUP_MS): T[][] {
  const out: T[][] = [];
  const open = new Map<string, T[]>();
  for (const m of items) {
    if (m.source === "sec") { out.push([m]); continue; }
    const k = `${m.source}:${m.marketId}:${m.outcome.toLowerCase()}`;
    const g = open.get(k);
    // The group's oldest bet so far is its last; a bet more than windowMs older starts a new group.
    if (g && g[0]!.at - m.at <= windowMs && g[g.length - 1]!.at - m.at <= windowMs) { g.push(m); continue; }
    const fresh = [m];
    open.set(k, fresh);
    out.push(fresh);
  }
  return out;
}

/** "4 big bets on Brewers · $68,765" */
export function groupTitle(n: number, side: string, total: number): string {
  return `${n} large positions on ${side} · ${dollars(total)}`;
}
