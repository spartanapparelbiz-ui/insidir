/* One receipt's rule texts, loaded when its ledger row is expanded (rule texts are long; the page doesn't carry them
 * for every row). Same paywall as the page: a receipt this viewer can't see answers 404. */
import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth/viewer";
import { marketKey } from "@/lib/engines/common";
import { accessFor, ledgerRows, rulesFor, visibleTo } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only. Get Insidir · $39/mo." }, { status: 401 });
  const access = accessFor(viewer.plan, Date.now());
  const row = visibleTo(await ledgerRows(access.sinceMs, access.untilMs), access, viewer.region).find(r => r.id === id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rules = await rulesFor(row.snapshot.legs);
  return NextResponse.json({ rules: row.snapshot.legs.map(l => rules[marketKey(l.venue, l.marketId)] ?? null) }, { headers: { "cache-control": "no-store" } });
}
