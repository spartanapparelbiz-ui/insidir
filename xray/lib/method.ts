/* The Method section, written from the same constants the scoring uses, so the page never drifts from the code. */
import { money, cents } from "./format";
import {
  FLOW_HOURS, FLOW_QUIET_USD, INSIDER_FEW_MARKETS, INSIDER_LONG_SHOT_PRICE, INSIDER_MIN_FILL_USD, INSIDER_NEW_WALLET_HOURS,
  INSIDER_LOOKBACK_HOURS, INSIDER_TOP_WALLETS, RECORD_POSITIONS, SHARP_MIN_DECIDED, SHARP_MIN_PROFIT_USD, SHARP_MIN_WIN_RATE,
  VERDICT_MIN_USD, VERDICT_MIN_WALLETS,
} from "./score";

export interface MethodItem { title: string; text: string }

export const METHOD: readonly MethodItem[] = [
  {
    title: "Proven wallets",
    text: `We read the last ${RECORD_POSITIONS} closed positions of each top holder. A position that made money is a win, one that lost money is a loss. ` +
      `A wallet counts as proven with at least ${SHARP_MIN_DECIDED} wins and losses, a win rate of ${Math.round(SHARP_MIN_WIN_RATE * 100)}% or more, ` +
      `and at least ${money(SHARP_MIN_PROFIT_USD)} in total realized profit. This market itself is left out of every record.`,
  },
  {
    title: "Sharp money",
    text: `For each proven wallet among the top 20 holders of each outcome, we value its position at shares times the outcome's current price, ` +
      `and add the values up per outcome. We only make a call with at least ${VERDICT_MIN_WALLETS} proven wallets holding ${money(VERDICT_MIN_USD)} or more. ` +
      `Once a market is resolved, its prices are 0 and 1, so we compare shares held instead.`,
  },
  {
    title: "Insider patterns",
    text: `We read every buy of ${money(INSIDER_MIN_FILL_USD)} or more in the last ${INSIDER_LOOKBACK_HOURS / 24} days and check the ${INSIDER_TOP_WALLETS} biggest buyers. ` +
      `A buy is flagged when the wallet's first-ever Polymarket trade came no more than ${INSIDER_NEW_WALLET_HOURS} hours before its first buy here. ` +
      `It is marked in red when the average price was ${cents(INSIDER_LONG_SHOT_PRICE)} or less, a long shot. We also note wallets that have traded ${INSIDER_FEW_MARKETS} markets or fewer. ` +
      `An insider pattern is a pattern in public data, not proof of insider trading.`,
  },
  {
    title: "Last 24 hours",
    text: `For each outcome we add up the cash spent buying it in the last ${FLOW_HOURS} hours and subtract the cash received selling it. ` +
      `Under ${money(FLOW_QUIET_USD)} net into any outcome reads as quiet. For a closed market, both windows end when it closed.`,
  },
  {
    title: "Source",
    text: "Everything comes from Polymarket's public APIs, read when you open the page and kept for up to a minute (wallet records for up to 6 hours). " +
      "Top holders are limited to the 20 largest per outcome.",
  },
];
