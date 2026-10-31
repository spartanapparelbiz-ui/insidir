/* Stocks (/stocks): insiders buying and selling their own company's stock, and the biggest funds' holdings, from SEC
 * filings (components/v2/ProductPage.tsx). While Stocks isn't live (lib/features.ts), the page says it's coming. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductPage } from "@/components/v2/ProductPage";
import { isReady } from "@/lib/features";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insider stock trades", description: "Company insiders buying and selling their own stock (SEC Form 4) and the biggest funds' holdings (13F), the day they're filed." };

export default function StocksPage() {
  if (!isReady("stocks")) notFound();
  return <ProductPage copy={{
    tab: "stocks", title: "Stocks",
    line: "When a CEO buys their own company's stock, you'll know the day it's filed. Plus what the biggest funds hold.",
    covers: ["CEO and director trades", "Form 4 filings", "Big funds' 13F holdings", "S&P 500 and well-known names"],
    card: [
      ["Who traded", "The insider, their role and the company. Their name opens everything else they've filed."],
      ["How much, and when", "The dollar amount, the price, and the day of the trade, straight from the filing."],
      ["Fund holdings", "Each quarter's holdings of the biggest funds, with what they added and sold."],
      ["The filing itself", "Every card links the filing on sec.gov, so you can read it yourself."],
    ],
    sources: [
      ["SEC EDGAR: Form 4", "Insiders must report their trades within two business days. We read every filing as it lands."],
      ["SEC EDGAR: 13F", "Big funds report their holdings every quarter, within 45 days of the quarter's end."],
    ],
  }} />;
}
