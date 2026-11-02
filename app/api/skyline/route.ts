/* GET /api/skyline?cats=elections,sports: the money skyline's bets (lib/sky/skyline.ts skyBets), polled every 20s by
 * the 3D hero so new big bets rise in place. Public data only (the same bets the ticker shows); no wallets. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { isCat } from "@/lib/nx/data";
import { skyBets } from "@/lib/sky/skyline";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ bets: [] }, { headers: { "Cache-Control": "no-store" } });
  const cats = (req.nextUrl.searchParams.get("cats") ?? "").split(",").filter(isCat);
  const bets = await skyBets(getDb(), Date.now(), { cats: cats.length ? cats : null }).catch(() => []);
  return NextResponse.json({ bets, at: Date.now() }, { headers: { "Cache-Control": "public, max-age=10" } });
}
