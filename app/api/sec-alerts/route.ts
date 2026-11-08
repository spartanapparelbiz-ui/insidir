/* POST /api/sec-alerts {id} or {all: true}: marks a member's watchlist alerts read (lib/stocks/watchlists.ts). */
import { NextResponse, type NextRequest } from "next/server";
import { MEMBERS_ONLY } from "@/lib/copy";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { markRead } from "@/lib/stocks/watchlists";

export async function POST(req: NextRequest) {
  const v = await memberOrNull();
  if (!v?.user) return NextResponse.json({ error: MEMBERS_ONLY }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: unknown; all?: unknown } | null;
  const id = Number.isInteger(b?.id) ? Number(b!.id) : null;
  if (id === null && b?.all !== true) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await markRead(getDb(), v.user.id, id);
  return NextResponse.json({ ok: true });
}
