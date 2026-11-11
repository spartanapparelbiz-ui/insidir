/* The SEC research terminal's words (docs/INSIDIR-V3.md §0, as adopted), said once here and used by /sec. Prices come
 * from lib/plans.ts. Each module names the feature (lib/features.ts) that says whether it's live; one that isn't wears
 * the Coming soon badge. */
import type { Feature } from "@/lib/features";
import { PLANS, TRIAL } from "@/lib/plans";

export const SEC_TITLE = "Insidir: SEC research terminal";
export const SEC_LEAD = "Insider filings, financials and announcements straight from SEC EDGAR, on one dense screen. Terminal-grade SEC data for $39 a month.";
export const SEC_MODULES: ReadonlyArray<{ name: string; line: string; href: string; feature: Feature; also?: Feature }> = [
  { name: "Company reports", line: "Delayed price chart, trailing-twelve-month financials, filings and insider history on one page", href: "/company/NVDA", feature: "companies", also: "price_chart" },
  { name: "SEC filings", line: "A searchable Form 4 database, each row linked to the original filing on sec.gov", href: "/filings", feature: "filings" },
  { name: "Insider activity", line: "Open-market buys and sells by officers and directors, kept separate from option exercises and stock grants", href: "/insiders", feature: "filings" },
  { name: "People", line: "Officers, directors and 10% owners, across every board they sit on", href: "/insiders", feature: "people" },
  { name: "Watchlists and signals", line: "Save tickers and get an in-app signal within minutes of a filing reaching EDGAR", href: "/watchlists", feature: "watchlists" },
  { name: "Research journal", line: "Tag companies Researching, Watching or Passed, with private notes next to the filings", href: "/journal", feature: "journal" },
];
export const SEC_PROMISE = "Every number comes from an official SEC filing. No AI summaries, no price targets, nothing simulated.";
export const SEC_PRICE = `$${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price} a month. Cancel any time.`;
export const SEC_LEGAL = "Research software from Aethric LLC. Not a broker or investment adviser. Information, not advice.";
