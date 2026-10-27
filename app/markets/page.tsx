/* Markets (/markets): the biggest bets on prediction markets: politics, the economy, world events
 * (components/v2/ProductPage.tsx). */
import type { Metadata } from "next";
import { ProductPage } from "@/components/v2/ProductPage";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prediction markets", description: "The biggest bets on elections, the Fed, the economy and world events on Polymarket and Kalshi, live, with each trader's record." };

export default function MarketsPage() {
  return <ProductPage copy={{
    tab: "markets", photo: BAND.product.markets, title: "Markets",
    line: "Big money on elections, the Fed, the economy and world events, the moment it moves.",
    covers: ["Elections", "The Fed", "Economy", "World events", "Companies", "Culture"],
    card: [
      ["How much, on what", "The bet in one plain sentence: how much went on which answer. $10,000 and up."],
      ["What it pays", "What every $100 pays if they're right, at the price they got."],
      ["Who it is", "Polymarket traders by name or wallet, with their record and all-time profit."],
      ["How it ended", "Every market is marked won or lost when it resolves. Losses included."],
    ],
    sources: [
      ["Polymarket", "Every trade is public on the Polygon blockchain. Each card links its transaction."],
      ["Kalshi", "Kalshi's public trade feed. Trades there are anonymous, so we say \"Someone\"."],
    ],
  }} />;
}
