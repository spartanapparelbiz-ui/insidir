/* Sports (/sports): the biggest bets on games, the second they're placed (components/v2/ProductPage.tsx). */
import type { Metadata } from "next";
import { ProductPage } from "@/components/v2/ProductPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sports", description: "The largest positions on NFL, NBA, MLB, NHL, college, soccer, UFC, tennis and golf, the second they're placed, and whether the bettor usually wins." };

export default function SportsPage() {
  return <ProductPage copy={{
    tab: "sports", title: "Sports",
    line: "Large positions on the games as they are opened: the account, the size, and its record.",
    covers: ["NFL", "NBA", "MLB", "NHL", "College", "Soccer", "UFC", "Tennis", "Golf"],
    card: [
      ["How much, on what", "The position in one plain sentence: how much went on which side. $10K and up."],
      ["What it pays", "What every $100 pays if they're right, at the price they got."],
      ["Who it is", "The trader's name or wallet, with their record: games won, games lost, all-time net P&L."],
      ["How it ended", "Every position is marked won or lost when the game settles. Losses included."],
    ],
    sources: [
      ["Kalshi", "Kalshi's public trade feed. Trades there are anonymous, shown as \"Anonymous · Kalshi\"."],
      ["Polymarket", "Every trade is public on the Polygon blockchain. Each card links its transaction."],
    ],
  }} />;
}
