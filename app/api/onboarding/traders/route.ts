/* GET /api/onboarding/traders?tabs=sports,markets&leagues=NFL&topics=politics: onboarding's "Follow 3 top traders",
 * five real top traders from what they picked, with their real record. Members only. */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { walletLabel } from "@/lib/moves/records";
import { topTradersFor } from "@/lib/moves/store";
import { parsePicks, topicCategories } from "@/lib/picks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ traders: [] });
  const q = req.nextUrl.searchParams, list = (k: string) => (q.get(k) ?? "").split(",").filter(Boolean);
  const picks = parsePicks({ tabs: list("tabs"), leagues: list("leagues"), topics: list("topics") }) ?? { tabs: [], leagues: [], topics: [] };
  const traders = await topTradersFor(getDb(), { tabs: picks.tabs, leagues: picks.leagues, categories: topicCategories(picks.topics) }, 5).catch(() => []);
  return NextResponse.json({ traders: traders.map(t => ({ wallet: t.wallet, name: walletLabel(t.wallet, t.name), won: t.won, resolved: t.resolved, profit: t.profit })) });
}
