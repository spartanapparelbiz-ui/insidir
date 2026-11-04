/* A wallet's share card (1080×1350, lib/og/entity.tsx): never who is behind it, only that it's a verified record and
 * what it is. */
import { getDb, hasDatabase } from "@/lib/db";
import { entityOg, OG_PORTRAIT } from "@/lib/og/entity";
import { parseProfileId } from "@/lib/profiles/name";
import { recordOf } from "@/lib/profiles/store";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";

export const alt = "A trader's record on Insidir";
export const size = OG_PORTRAIT;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const ref = parseProfileId((await params).address);
  const rec = ref?.kind === "trader" && hasDatabase() ? await recordOf(getDb(), ref.wallet).catch(() => null) : null;
  const n = rec ? rec.resolved : 0;
  return entityOg({ kicker: "Wallet record", title: n >= RECORD_MIN_RESOLVED ? "A verified record" : "A trader on Insidir", line: "Every large position, settled from the public record, losses included.",
    figure: rec && n >= RECORD_MIN_RESOLVED ? { value: `Won ${rec.won.toLocaleString("en-US")} of ${n.toLocaleString("en-US")}`, label: "settled markets" } : null }, OG_PORTRAIT);
}
