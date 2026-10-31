/* A company's link preview (lib/og/entity.tsx): the company, its ticker, and how many insiders bought this month. */
import { getDb, hasDatabase } from "@/lib/db";
import { entityOg, OG_SIZE } from "@/lib/og/entity";
import { parseTicker } from "@/lib/profiles/name";
import { insidersBoughtThisMonth } from "@/lib/profiles/sec";
import { issuerForTicker, issuerTradesFor } from "@/lib/profiles/store";

export const alt = "A company's insider trades on Insidir";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = parseTicker((await params).ticker);
  const co = ticker && hasDatabase() ? await issuerForTicker(getDb(), ticker).catch(() => null) : null;
  if (!co) return entityOg({ kicker: "SEC Form 4", title: ticker ? `${ticker} insider trading` : "Insider trading", line: "Every insider purchase and sale, straight from the filing." });
  const trades = await issuerTradesFor(getDb(), co.issuerCik).catch(() => []);
  const n = insidersBoughtThisMonth(trades, Date.now());
  return entityOg({ kicker: "SEC Form 4", title: `${co.company} (${co.ticker})`, line: "Every insider purchase and sale, straight from the filing.",
    figure: n ? { value: `${n} ${n === 1 ? "insider" : "insiders"}`, label: "bought this month" } : null });
}
