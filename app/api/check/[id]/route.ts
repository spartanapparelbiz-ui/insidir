/* GET /api/check/<read id>: what the inline check needs for a check just made (POST /api/read gave the id): the market,
 * its two outcome names, the millionaire money per side (and the biggest wallet's all-time profit on each, for the
 * evidence line), Pro money, and the price now with the better venue (in the US, Kalshi only). Anyone with the id sees
 * it, like the check page. No wallets, bets or analyst line: those are members'. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { categoryOf } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { marketMoney, outcomeNames, positions } from "@/lib/millionaires/queries";
import { pricesFor } from "@/lib/read/math";
import { getRead } from "@/lib/read/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { id } = await params;
  const db = getDb(), now = Date.now();
  const r = await getRead(db, id).catch(() => null);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const d = r.data, pid = d.polymarket?.id ?? null;
  const [m, pos, viewer] = await Promise.all([
    pid ? marketMoney(db, { marketIds: [pid], now }).then(x => x[0] ?? null).catch(() => null) : Promise.resolve(null),
    pid ? positions(db, pid).catch(() => []) : Promise.resolve([]),
    getViewer(),
  ]);
  const top = (s: "yes" | "no") => pos.filter(p => p.tier === "millionaire" && p.side === s).sort((a, b) => b.dollars - a.dollars)[0]?.pnl ?? null;
  const zero = { yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } };
  const us = viewer.region !== "non_us";
  return NextResponse.json({
    id, question: d.question, key: d.key, category: categoryOf({ title: d.question, event: d.event, url: d.polymarket?.url ?? null }),
    // Both outcome names, never "Yes"/"No" beside a team or player (outcomeNames).
    ...outcomeNames(d.question, d.yesLabel, d.noLabel),
    millionaire: m?.millionaire ?? zero, pro: m?.pro ?? zero, topPnl: { yes: top("yes"), no: top("no") },
    prices: pricesFor(d.prices, us), us,
  }, { headers: { "Cache-Control": "no-store" } });
}
