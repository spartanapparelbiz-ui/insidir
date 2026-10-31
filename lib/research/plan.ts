/* Research's deterministic planner: reads a plain-English question into one tool call (lib/research/tools.ts) without
 * a model, for when the model is off or over its budget, and as the reference the QA suite checks. It refuses advice,
 * picks, forecasts and anything about who is behind an account, and says "Not in Insidir's data." for the rest. Pure. */
import { TRACKERS } from "@/lib/trackers";

export type Plan = { tool: string; args: Record<string, unknown> } | { refuse: "advice" | "identity" | "not_covered" };

export const NOT_COVERED = "Not in Insidir's data.";
export const NO_ADVICE = "Insidir shows what happened in the data. It doesn't give advice, picks or forecasts.";

const ADVICE = /\b(should i|should we|what should|recommend|best bet|which bet|pick(s)? for|tips?\b|lock of|who will win|will .{1,40} win\b|predict\b|predictions?\b(?!\s+markets?)|forecast|is it a good|worth (it|buying|betting)|sure thing|guarantee)/i;
const IDENTITY = /\b(who is behind|who owns|real name|identity|dox|whose wallet|who runs|person behind|address of)\b/i;
const LEAGUES: Array<[RegExp, string]> = [[/\bnba\b|basketball/i, "NBA"], [/\bnfl\b/i, "NFL"], [/\bmlb\b|baseball/i, "MLB"], [/\bnhl\b|hockey/i, "NHL"], [/\bcollege|ncaa|cfb\b/i, "college"],
  [/\bsoccer|premier league|la liga|serie a|champions league|bundesliga|\bmls\b/i, "soccer"], [/\bufc\b|\bmma\b/i, "UFC"], [/\btennis\b/i, "tennis"], [/\bgolf\b|pga\b/i, "golf"]];

/** "$1M", "1 million", "$250K", "50k" after over / above / more than / at least, in dollars. */
export function moneyIn(q: string): number | undefined {
  const m = /(?:over|above|more than|at least|bigger than|larger than|>|\+?)\s*\$\s?(\d+(?:\.\d+)?)\s*(k|m|b|million|thousand|billion)?\b|(\d+(?:\.\d+)?)\s*(k|m|million|thousand)\b/i.exec(q);
  if (!m) return undefined;
  const n = Number(m[1] ?? m[3]), u = (m[2] ?? m[4] ?? "").toLowerCase();
  return n * (u === "k" || u === "thousand" ? 1e3 : u === "m" || u === "million" ? 1e6 : u === "b" || u === "billion" ? 1e9 : 1);
}
function hoursIn(q: string): number | undefined {
  if (/\btonight|this evening\b/i.test(q)) return undefined;
  const n = /\b(?:last|past)\s+(\d+)\s*(hour|day|week|month)s?\b/i.exec(q);
  if (n) return Number(n[1]) * ({ hour: 1, day: 24, week: 168, month: 720 } as Record<string, number>)[n[2]!.toLowerCase()]!;
  if (/\btoday|last 24 hours\b/i.test(q)) return 24;
  if (/\bthis week|last week|past week\b/i.test(q)) return 168;
  if (/\bthis month|last month|past month\b/i.test(q)) return 720;
  return undefined;
}
const leagueIn = (q: string) => LEAGUES.find(([re]) => re.test(q))?.[1];
/** A tracker named in the question: its full name ("Whales ($100K+)", "Fed & Rates") or its slug, not a bare league. */
const trackerIn = (q: string) => TRACKERS.find(t => {
  if (t.group === "Leagues" && !/\btracker\b/i.test(q)) return false;
  const name = t.name.replace(/[()$+.&]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|\\W)${name}(?=$|\\W)`, "i").test(q) || new RegExp(`\\b${t.slug.replace(/-/g, "[- ]")}\\b`, "i").test(q);
})?.slug;

export function planFor(question: string, ctx: { wallet?: string | null } = {}): Plan {
  const q = question.trim();
  if (!q) return { refuse: "not_covered" };
  if (IDENTITY.test(q)) return { refuse: "identity" };
  if (ADVICE.test(q)) return { refuse: "advice" };
  const min = moneyIn(q), hours = hoursIn(q), league = leagueIn(q), tracker = trackerIn(q);
  // Insider filings.
  if (/\b(ceo|cfo|director|insider|form 4|officer)s?\b/i.test(q) || /\b(purchases?|bought|buys?|sales?|sold)\b.*\bstock|stock.*\b(purchases?|buys?)\b/i.test(q)) {
    const role = /\bceo|chief executive/i.test(q) ? "ceo" : /\bcfo|chief financial/i.test(q) ? "cfo" : /\bdirector/i.test(q) ? "director" : "any";
    const ticker = /\$([A-Z]{1,5})\b|\(([A-Z]{1,5})\)|\b([A-Z]{2,5})\b(?= stock| insider)/.exec(q);
    return { tool: "insider_filings", args: { role, min_value: min, since_days: hours ? Math.ceil(hours / 24) : 30, kind: /\b(sales?|sold|selling)\b/i.test(q) ? "sale" : "purchase",
      ticker: ticker ? ticker[1] ?? ticker[2] ?? ticker[3] : undefined, by_sector: /\bsector|industry\b/i.test(q) } };
  }
  // One account's record.
  if (/\brecord|win rate|how has .* done|track record\b/i.test(q) && (/\bthis (account|trader|wallet)\b/i.test(q) || /0x[0-9a-f]{40}/i.test(q))) {
    const w = /0x[0-9a-f]{40}/i.exec(q)?.[0] ?? (ctx.wallet ? "this" : undefined);
    if (!w) return { refuse: "not_covered" };
    return { tool: "account_record", args: { wallet: w, league, market_type: /\btotals?|over\/under|o\/u\b/i.test(q) ? "totals" : /\bspreads?\b/i.test(q) ? "spreads" : /\bmoneyline|to win\b/i.test(q) ? "moneyline" : undefined,
      category: /\bpolitic/i.test(q) ? "politics" : undefined } };
  }
  // A tracker's holdings.
  if (tracker && /\b(hold|holds|holding|own|owns)\b/i.test(q)) return { tool: "tracker_holdings", args: { tracker } };
  // Trackers (not "positions from trackers …", which is about positions).
  if (/\btrackers?\b/i.test(q) && !/\b(positions?|bets?)\b[^.]*\bfrom\b[^.]*\btrackers?\b/i.test(q)) {
    const group = /\bleague|sport/i.test(q) ? "Leagues" : /\btopic|politic|election|fed\b/i.test(q) ? "Topics" : /\bstyle/i.test(q) ? "Styles" : /\bstock|filing/i.test(q) ? "Stocks" : undefined;
    const sort = /\bvolume|money|biggest\b/i.test(q) ? "volume" : /\bmost settled|most positions|busiest\b/i.test(q) ? "settled" : "roi";
    return { tool: "list_trackers", args: { group, sort, positive_only: /\bpositive|winning|profitable|made money\b/i.test(q) } };
  }
  // Markets.
  if (/\bmarkets?\b/i.test(q) && /\b(most|biggest|largest|top)\b.*\bmoney|\bmoney\b.*\bmarkets?\b|which markets\b/i.test(q)) {
    const about = /\b(?:on|about|for)\s+([a-z0-9 .'-]{3,40}?)(?:\s+markets?)?[?.]?$/i.exec(q)?.[1];
    return { tool: "find_markets", args: { query: about } };
  }
  // Positions (the default when the question is about bets, positions, money, wallets or a league).
  if (/\b(positions?|bets?|money|wagers?|whales?|trades?|largest|biggest)\b/i.test(q) || league || tracker) {
    const tab = league ? "sports" : /\bpolitic|election|fed|rates|crypto|bitcoin|prediction markets?\b/i.test(q) ? "markets" : /\bstocks?\b/i.test(q) ? "stocks" : undefined;
    return { tool: "find_positions", args: {
      tab, league, tracker: tracker && !/positions? from trackers/i.test(q) ? tracker : undefined, min_amount: min, since_hours: hours,
      status: /\bopen|still open|unsettled|live\b/i.test(q) ? "open" : /\bsettled|won|lost|results?\b/i.test(q) ? "settled" : "any",
      winning_trackers_only: /\b(positive|winning|profitable) (followable )?(roi|trackers?)|trackers with (a )?positive|from winning\b/i.test(q) || undefined,
      starts_within_hours: /\btonight|this evening\b/i.test(q) ? 12 : /\btoday'?s games|games today\b/i.test(q) ? 24 : undefined,
      wallet: /\bthis (account|trader|wallet)\b/i.test(q) && ctx.wallet ? "this" : undefined,
    } };
  }
  return { refuse: "not_covered" };
}

export { suggestionsFor } from "./suggest";
