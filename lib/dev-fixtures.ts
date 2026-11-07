/* Example data for the share-card preview (/dev/share) only: never imported by a real page. Every value here is
 * made up to show the card, and it 404s in production (app/dev/gallery.ts). */
import type { ShareCardData } from "@/lib/share-card";

const MIN = 60_000;

export const SHARE: ShareCardData = {
  title: "Will the Jets win on Nov 9?", legs: [{ venueName: "Kalshi", side: "yes", priceCents: 48 }, { venueName: "Polymarket US", side: "no", priceCents: 46 }],
  keep: 24.1, keepAt: 500, lifeMs: 4 * MIN + 8_000, settled: "same",
};
