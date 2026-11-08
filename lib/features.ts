/* The Coming soon rule (docs/INSIDIR-V2.md §2): a feature is ready only when it works end to end on production with real
 * data, passes its tests and the accuracy check. Anything else shows the Coming soon badge and can't be used.
 *
 * Readiness is set per deploy with FEATURES_READY, a comma list of the keys below, after checking each one on
 * production. Unset means the launch default: the feed (with records and follows), which this deploy is checked
 * against. Stocks (SEC Form 4 and 13F) is ready once listed here, after its accuracy check on production. Crypto is
 * never ready before its own launch. */
export const FEATURES = {
  feed: "Activity",
  records: "Trader records",
  follows: "Following traders and markets",
  alerts_push: "Phone alerts",
  alerts_email: "Email alerts",
  daily_email: "The daily email",
  custom_rules: "Custom alert rules",
  price_gaps: "Price gaps",
  crypto: "Crypto",
  stocks: "Stocks",
  /** The Form 4 database and insider activity (/filings, /insiders; docs/INSIDIR-V3.md §3). Ready once the 20-row EDGAR
   *  accuracy check (lib/accuracy/filings.ts) passes on production. */
  filings: "SEC filings and insider activity",
  /** Company reports (/company/[ticker]): ready once `npm run check:companies` passes 20 of 20 on production. */
  companies: "Company reports",
  /** People (/people/[cik]): built from the Form 3, 4 and 5 database, so ready with `filings`. */
  people: "People",
  watchlists: "Watchlists and alerts",
  journal: "Research journal",
  /** Autopilot (/autopilot, /t/[id], its worker matching and pushes) and every line built on its Kalshi backtests (the
   *  landing's record, the funnel's and paywall's record line, /results' rules table). Off until a lawyer has
   *  reviewed it: it hands members a finished trade (market, side, limit price, contracts) on CFTC-regulated contracts
   *  and advertises hypothetical returns. Switch on by adding "autopilot" to FEATURES_READY. */
  autopilot: "Autopilot",
  /** The delayed price chart: needs a licensed price vendor (docs/INSIDIR-V3.md §1.2). */
  price_chart: "Price chart",
} as const;
export type Feature = keyof typeof FEATURES;

const DEFAULT_READY: Feature[] = ["feed", "records", "follows"];
/** Insidir sends no email, so the email features never switch on; Crypto waits for its own launch. */
const NEVER_YET: Feature[] = ["crypto", "alerts_email", "daily_email", "price_chart"];

/** The SEC terminal's features (docs/INSIDIR-V3.md §6). They can also be switched on with SEC_FEATURES_READY, a comma
 *  list of these keys only, added to FEATURES_READY, so turning one on never means rewriting the betting product's list. */
export const SEC_FEATURES: readonly Feature[] = ["filings", "companies", "people", "watchlists", "journal"];

export function readyFeatures(env: Record<string, string | undefined> = process.env): Set<Feature> {
  const raw = env.FEATURES_READY;
  const keys = (v: string) => v.split(",").map(s => s.trim()).filter((s): s is Feature => Object.hasOwn(FEATURES, s));
  const list = raw === undefined ? DEFAULT_READY : keys(raw);
  const sec = keys(env.SEC_FEATURES_READY ?? "").filter(f => SEC_FEATURES.includes(f));
  return new Set([...list, ...sec].filter(f => !NEVER_YET.includes(f)));
}

export const isReady = (f: Feature, env?: Record<string, string | undefined>): boolean => readyFeatures(env).has(f);

/** The feed tabs that show moves right now: Sports and Markets always, Stocks and Crypto once ready. */
export function liveTabs(env?: Record<string, string | undefined>): Array<"sports" | "markets" | "stocks" | "crypto"> {
  const r = readyFeatures(env);
  return ["sports", "markets", ...(r.has("stocks") ? ["stocks" as const] : []), ...(r.has("crypto") ? ["crypto" as const] : [])];
}
