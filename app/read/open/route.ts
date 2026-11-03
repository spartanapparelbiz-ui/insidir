/* GET /read/open?pick=polymarket:<id>: a market tapped on the board, a category page or the member home opens as a Read
 * (/read/<id>). The same rules as POST /api/read with a pick: members any market; visitors and free accounts their free
 * Read, after which they land on /go. A Read made in the last minute for the same person and market is reused. */
import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isPaid } from "@/lib/plans";
import { cachedRead, FREE_READS, lineFor, readsUsed, saveRead } from "@/lib/read/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const back = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
  const m = /^(polymarket|kalshi):([A-Za-z0-9._-]{3,120})$/.exec(req.nextUrl.searchParams.get("pick") ?? "");
  if (!m || !hasDatabase()) return back("/");
  const venue = m[1] as "polymarket" | "kalshi", id = m[2]!;
  const db = getDb(), now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const userId = viewer.user?.id ?? null, visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
  const key = venue === "polymarket" ? `p:${id}` : `k:${id}`;
  const who = userId ? sql`user_id = ${userId}` : visitorId ? sql`visitor_id = ${visitorId}` : null;
  if (who) {
    const r = await db.execute(sql`select id from terminal.reads where market_key = ${key} and ${who} and created_at > ${new Date(now - 60_000)} order by created_at desc limit 1`);
    const hit = (r.rows[0] as { id: string } | undefined)?.id;
    if (hit) return back(`/read/${hit}`);
  }
  if (!paid && (await readsUsed(db, { userId, visitorId })) >= FREE_READS) return back(`/go?from=read`);
  try {
    const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
    const t0 = Date.now();
    const base = await cachedRead(db, clients, venue, id, now);
    const line = paid && userId ? await lineFor(db, base, userId, now) : null;
    const data = { ...base, line: line ? { text: line.text, origin: line.origin, model: line.model } : null };
    const readId = await saveRead(db, { userId, visitorId: userId ? null : visitorId, input: "pick", data, ms: Date.now() - t0 }, now);
    return back(`/read/${readId}`);
  } catch {
    return back("/?read=failed");
  }
}
