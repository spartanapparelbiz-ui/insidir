/* POST /api/copies/status { id, status: "placed" | "skipped" }: what the member did with a copy (lib/copies/mine.ts), so
 * their totals count only what they placed. Members only, their own copies. */
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { setCopyStatus } from "@/lib/copies/mine";
import { getDb } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.json({ error: "Members only." }, { status: 401 });
  const b = await req.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = Number(b?.id), status = b?.status;
  if (!Number.isInteger(id) || (status !== "placed" && status !== "skipped")) return NextResponse.json({ error: "Placed or skipped?" }, { status: 400 });
  return (await setCopyStatus(getDb(), viewer.user.id, id, status)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
