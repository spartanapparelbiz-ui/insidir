/* One deal for the Terminal's detail sheet, as the caller's plan and region allow (lib/deal-view.ts, the same
 * function the deal page uses). Free callers get the delayed, redacted view or "too_new"; nothing paid is sent.
 * Never cached. */
import { NextResponse } from "next/server";
import { unlockHref } from "@/components/app/links";
import { memberOrNull } from "@/lib/auth/viewer";
import { dealView, type DealResponse } from "@/lib/deal-view";

export const dynamic = "force-dynamic";

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeDecode((await params).id);
  const now = Date.now();
  const viewer = await memberOrNull();
  if (!viewer) return NextResponse.json({ error: "Members only. Get Insidir · $39/mo." }, { status: 401 });
  const view = await dealView(id, viewer, now);
  const body: DealResponse = { now, view, unlockHref: unlockHref() };
  return NextResponse.json(body, { status: view.state === "not_found" ? 404 : 200, headers: { "Cache-Control": "private, no-store" } });
}
