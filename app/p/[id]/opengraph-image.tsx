/* A trader's link preview (lib/og/entity.tsx): never who they are, only that it's a verified record and what it is. */
import { getDb, hasDatabase } from "@/lib/db";
import { entityOg, OG_SIZE } from "@/lib/og/entity";
import { parseProfileId } from "@/lib/profiles/name";
import { recordOf } from "@/lib/profiles/store";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";

export const alt = "A trader's record on Insidir";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const ref = parseProfileId((await params).id);
  const rec = ref?.kind === "trader" && hasDatabase() ? await recordOf(getDb(), ref.wallet).catch(() => null) : null;
  const n = rec ? rec.resolved : 0;
  return entityOg({ kicker: "Trader record", title: n >= RECORD_MIN_RESOLVED ? "A verified record" : "A trader on Insidir", line: "Every large position, settled from the public record, losses included.",
    figure: rec && n >= RECORD_MIN_RESOLVED ? { value: `Won ${rec.won.toLocaleString("en-US")} of ${n.toLocaleString("en-US")}`, label: "settled markets" } : null });
}
