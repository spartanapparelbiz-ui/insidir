/* Sports (/sports): the biggest bets on games, the second they're placed (components/v2/ProductPage.tsx). */
import type { Metadata } from "next";
import { ProductPage } from "@/components/v2/ProductPage";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sports", description: "The biggest bets on NFL, NBA, MLB, NHL, college, soccer, UFC, tennis and golf, the second they're placed, and whether the bettor usually wins." };

export default function SportsPage() {
  return <ProductPage copy={{
    tab: "sports", photo: BAND.product.sports, title: "Sports",
    line: "The biggest bets on the games, the second they're placed. Who bet, how much, and whether they usually win.",
    covers: ["NFL", "NBA", "MLB", "NHL", "College", "Soccer", "UFC", "Tennis", "Golf"],
    card: [
      ["How much, on what", "The bet in one plain sentence: how much went on which side. $10,000 and up."],
      ["What it pays", "What every $100 pays if they're right, at the price they got."],
      ["Who it is", "The trader's name or wallet, with their record: games won, games lost, all-time profit."],
      ["How it ended", "Every bet is marked won or lost when the game settles. Losses included."],
    ],
    sources: [
      ["Kalshi", "Kalshi's public trade feed. Trades there are anonymous, so we say \"Someone\"."],
      ["Polymarket", "Every trade is public on the Polygon blockchain. Each card links its transaction."],
    ],
  }} />;
}
