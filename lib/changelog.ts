/* The changelog (/changelog): what shipped, newest first, written from the commit history. One entry per day, a few
 * lines each, in the house style. Add a line when something a visitor or member can see ships. */
export interface ChangeDay { date: string; items: string[] }

export const CHANGELOG: ChangeDay[] = [
  { date: "2026-10-31", items: [
    "New pages: Methodology, Status, Security, Disclosures, Credits, Help and this Changelog.",
    "Every number on the home page now says where it comes from and when it was read, in Eastern Time.",
    "Delete your account yourself, from Settings.",
    "The home page leads with three markets (sports, prediction markets, stocks), with a leaderboard preview and a proof strip.",
  ] },
  { date: "2026-10-30", items: [
    "Followable returns: every tracker shows what $100 on each position would have made at the price Insidir showed it, plus one point.",
    "Open now, and a public leaderboard of trackers over 30 days and all time.",
    "Sign-in and payments through Whop.",
    "The home page's interactive laptops: click one to see live positions from that market.",
  ] },
  { date: "2026-10-29", items: [
    "Trackers first: live portfolios of large positions that fit one rule, each with a public record.",
    "Real logos for leagues, teams and companies on cards and trackers.",
    "Check my bet: upload a slip and see where the big money and proven traders are on every leg.",
    "Splits: where proven traders and the crowd disagree, with a public scorecard.",
    "A light redesign, one money format and aligned figures everywhere.",
  ] },
  { date: "2026-10-28", items: [
    "Follow insiders, companies and funds; public pages for SEC filings.",
    "Trader pictures: Polymarket's own public picture, else initials.",
    "Accuracy check: positions are rebuilt from the source, maker fills included, instead of hidden.",
    "Every sports position says its league.",
  ] },
];
