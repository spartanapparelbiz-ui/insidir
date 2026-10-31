/* One deal for the Terminal's detail sheet, as the caller's plan and region allow (lib/deal-view.ts, the same
 * function the deal page uses). Free callers get the delayed, redacted view or "too_new"; nothing paid is sent.
 * Never cached. */
import { NextResponse } from "next/server";
import { unlockHref } from "@/components/app/links";
import { getViewer } from "@/lib/auth/viewer";
import { dealView, type DealResponse } from "@/lib/deal-view";

export const dynamic = "force-dynamic";

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeDecode((await params).id);
  const now = Date.now();
  // Visitors get the 30-minute-delayed view (the plan gates every row); members get it live.
  const viewer = await getViewer();
  const view = await dealView(id, viewer, now);
  const body: DealResponse = { now, view, unlockHref: unlockHref() };
  return NextResponse.json(body, { status: view.state === "not_found" ? 404 : 200, headers: { "Cache-Control": "private, no-store" } });
}
