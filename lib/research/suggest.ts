/* Research's suggested questions per page (no imports: the ⌘K palette ships it to the browser). */
/** Suggested questions per page, all answerable from Insidir's data. */
export function suggestionsFor(path: string): string[] {
  if (path.startsWith("/p/")) return ["This account's record on soccer totals", "This account's record in the NBA", "This account's open positions"];
  if (path.startsWith("/stocks") || path.startsWith("/insider")) return ["CEO purchases over $1M in the last 7 days, by sector", "Director purchases in the last 30 days", "Insider sales over $5M this month"];
  if (path.startsWith("/markets")) return ["Open positions over $50K on politics", "Markets with the most large-position money this month", "Trackers on topics by followable ROI"];
  if (path.startsWith("/trackers/")) return ["Trackers with a positive followable ROI", "Largest open positions from winning trackers", "Trackers by 30-day volume"];
  return ["Open positions from trackers with positive followable ROI on tonight's NBA games", "CEO purchases over $1M in the last 7 days, by sector", "Largest open NFL positions this week", "Trackers with a positive followable ROI"];
}
