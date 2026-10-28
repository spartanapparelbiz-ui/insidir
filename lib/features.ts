/* The Coming soon rule (docs/INSIDIR-V2.md §2): a feature is ready only when it works end to end on production with real
 * data, passes its tests and the accuracy check. Anything else shows the Coming soon badge and can't be used.
 *
 * Readiness is set per deploy with FEATURES_READY, a comma list of the keys below, after checking each one on
 * production. Unset means the launch default: the feed (with records and follows), which this deploy is checked
 * against. Stocks (SEC Form 4 and 13F) is ready once listed here, after its accuracy check on production. Crypto is
 * never ready before its own launch. Price gaps is never ready while its scanner is off (GAPS_ENABLED, lib/flags.ts),
 * whatever FEATURES_READY says. */
import { gapsEnabled } from "./flags";

export const FEATURES = {
  feed: "The live feed",
  records: "Trader records",
  follows: "Following traders and markets",
  alerts_push: "Phone alerts",
  alerts_email: "Email alerts",
  daily_email: "The daily email",
  custom_rules: "Custom alert rules",
  price_gaps: "Price gaps",
  crypto: "Crypto",
  stocks: "Stocks",
} as const;
export type Feature = keyof typeof FEATURES;

const DEFAULT_READY: Feature[] = ["feed", "records", "follows"];
/** Insidir sends no email, so the email features never switch on; Crypto waits for its own launch. */
const NEVER_YET: Feature[] = ["crypto", "alerts_email", "daily_email"];

export function readyFeatures(env: Record<string, string | undefined> = process.env): Set<Feature> {
  const raw = env.FEATURES_READY;
  const list = raw === undefined ? DEFAULT_READY : raw.split(",").map(s => s.trim()).filter((s): s is Feature => Object.hasOwn(FEATURES, s));
  return new Set(list.filter(f => !NEVER_YET.includes(f) && (f !== "price_gaps" || gapsEnabled(env))));
}

export const isReady = (f: Feature, env?: Record<string, string | undefined>): boolean => readyFeatures(env).has(f);

/** The feed tabs that show moves right now: Sports and Markets always, Stocks and Crypto once ready. */
export function liveTabs(env?: Record<string, string | undefined>): Array<"sports" | "markets" | "stocks" | "crypto"> {
  const r = readyFeatures(env);
  return ["sports", "markets", ...(r.has("stocks") ? ["stocks" as const] : []), ...(r.has("crypto") ? ["crypto" as const] : [])];
}
