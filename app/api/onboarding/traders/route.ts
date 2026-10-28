/* GET /api/onboarding/traders?tabs=sports,markets&leagues=NFL&topics=politics: onboarding's "Who to follow", five real
 * top traders from what they picked, with their real record, plus from SEC filings (lib/profiles/store.ts
 * stockSuggestions): the insiders and companies with the most open-market buying in the last 30 days, and the funds
 * we track. Members only. */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { compactDollars } from "@/lib/home/curate";
import { walletLabel } from "@/lib/moves/records";
import { topTradersFor } from "@/lib/moves/store";
import { parsePicks, topicCategories } from "@/lib/picks";
import { personName, roleOf } from "@/lib/profiles/name";
import { stockSuggestions } from "@/lib/profiles/store";
import type { StockPick } from "@/lib/follows";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ traders: [], stocks: [] });
  const q = req.nextUrl.searchParams, list = (k: string) => (q.get(k) ?? "").split(",").filter(Boolean);
  const picks = parsePicks({ tabs: list("tabs"), leagues: list("leagues"), topics: list("topics") }) ?? { tabs: [], leagues: [], topics: [] };
  const db = getDb();
  const [traders, sec] = await Promise.all([
    topTradersFor(db, { tabs: picks.tabs, leagues: picks.leagues, categories: topicCategories(picks.topics) }, 5).catch(() => []),
    stockSuggestions(db, new Date(Date.now() - 30 * 86_400_000)).catch(() => null),
  ]);
  const stocks: StockPick[] = sec ? [
    ...sec.insiders.map(i => ({ kind: "insider" as const, target: i.cik, name: personName(i.name), line: `${roleOf(i.role)} of ${i.company} · bought ${compactDollars(i.bought)} this month` })),
    ...sec.companies.map(c => ({ kind: "company" as const, target: c.cik, name: c.ticker ? `${c.company} (${c.ticker})` : c.company,
      line: `${c.insiders} ${c.insiders === 1 ? "insider" : "insiders"} bought ${compactDollars(c.bought)} in 30 days` })),
    ...sec.funds.map(f => ({ kind: "fund" as const, target: f.cik, name: f.name, line: "Every new 13F: biggest adds and new positions" })),
  ] : [];
  return NextResponse.json({ traders: traders.map(t => ({ wallet: t.wallet, name: walletLabel(t.wallet, t.name), won: t.won, resolved: t.resolved, profit: t.profit })), stocks });
}
