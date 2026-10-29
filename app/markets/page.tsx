/* Markets (/markets): the biggest bets on prediction markets: politics, the economy, world events
 * (components/v2/ProductPage.tsx). */
import type { Metadata } from "next";
import { ProductPage } from "@/components/v2/ProductPage";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prediction markets", description: "The largest positions on elections, the Fed, the economy and world events on Polymarket and Kalshi, live, with each trader's record." };

export default function MarketsPage() {
  return <ProductPage copy={{
    tab: "markets", photo: BAND.product.markets, title: "Markets",
    line: "Large positions on elections, the Fed, the economy and world events, as they are opened.",
    covers: ["Elections", "The Fed", "Economy", "World events", "Companies", "Culture"],
    card: [
      ["How much, on what", "The position in one plain sentence: how much went on which answer. $10K and up."],
      ["What it pays", "What every $100 pays if they're right, at the price they got."],
      ["Who it is", "Polymarket traders by name or wallet, with their record and all-time net P&L."],
      ["How it ended", "Every market is marked won or lost when it resolves. Losses included."],
    ],
    sources: [
      ["Polymarket", "Every trade is public on the Polygon blockchain. Each card links its transaction."],
      ["Kalshi", "Kalshi's public trade feed. Trades there are anonymous, shown as \"Anonymous · Kalshi\"."],
    ],
  }} />;
}
