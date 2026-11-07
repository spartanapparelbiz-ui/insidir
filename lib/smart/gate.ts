/* Whether Positioning is public: its scorecard shows a positive edge on 100+ scored calls (lib/smart/splits.ts edgeOf).
 * Until then it's out of the nav and off public pages (members can still open it). Re-read every 10 minutes; the root
 * layout refreshes it. Server only. */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { edgeOf, type Edge } from "./splits";
import { flaggedSplits } from "./store";

export function positioningEdge(db: Db): Promise<Edge> {
  return memo("positioning:edge", 10 * 60_000, async () => {
    return edgeOf(await flaggedSplits(db, 20_000));
  });
}
