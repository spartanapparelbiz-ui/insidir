/* GET /api/share/<moveId>: the move as a 1080×1920 PNG (lib/move-card.tsx). Paid data stays paid: a move younger
 * than the free delay is 404 for anyone not on a paid plan, and the trader's record is only drawn for paid viewers
 * or once the move has settled (settled top-trader moves are public on Results). */
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { moveCardImage } from "@/lib/move-card";
import { movePlan } from "@/lib/moves/gate";
import { moveById, recordsFor } from "@/lib/moves/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ moveId: string }> }) {
  const { moveId } = await params;
  if (!hasDatabase()) return new Response("Not found", { status: 404 });
  const viewer = await getViewer();
  const plan = movePlan(viewer.plan);
  const db = getDb();
  const m = await moveById(db, decodeURIComponent(moveId));
  if (!m || m.at > Date.now() - plan.delayMs) return new Response("Not found", { status: 404 });
  const record = m.wallet && (plan.records || m.result) ? (await recordsFor(db, [m.wallet])).get(m.wallet) ?? null : null;
  const img = await moveCardImage(m, record);
  img.headers.set("Cache-Control", "private, max-age=300");
  img.headers.set("Content-Disposition", `inline; filename="insidir-move.png"`);
  return img;
}
