/* Curated implication rules for lib/engines/implication.ts: "if A resolves YES, B resolves YES".
 *
 * HOW TO ADD A RULE
 * 1. Write `antecedent.titlePattern`: a RegExp matched against a market title (whitespace collapsed, curly
 *    apostrophes straightened). Use NAMED groups for the parts the consequent needs: (?<team>...).
 *    Anchor it (^...$) and keep it narrow; a loose pattern pairs the wrong markets.
 * 2. Write `consequent.titlePattern`: regex SOURCE (a string), matched case-insensitively against titles on the
 *    same venue. `{team}` inserts the antecedent's `team` capture (escaped); `{team:map}` inserts
 *    entityMap[team in lower case] (escaped). If the map has no entry the rule is skipped for that market.
 * 3. Optional: `antecedent.venue` to limit to one venue; `safety: "yellow"` + `safetyNotes` when the implication
 *    has edge cases; `maxCloseGapMs` to change how far apart the two close times may be (default 180 days).
 * 4. Add a test with synthetic markets in test/engines-implication.test.ts.
 * Only add an implication that holds in EVERY outcome under both markets' rules. If A can happen without B even in
 * theory, mark it yellow and say why. */

import type { ImplicationRule } from "../lib/engines/implication";

/** [city, nickname, conference] for the 30 NBA teams. */
const NBA_TEAMS: ReadonlyArray<[string, string, "Eastern" | "Western"]> = [
  ["Atlanta", "Hawks", "Eastern"], ["Boston", "Celtics", "Eastern"], ["Brooklyn", "Nets", "Eastern"],
  ["Charlotte", "Hornets", "Eastern"], ["Chicago", "Bulls", "Eastern"], ["Cleveland", "Cavaliers", "Eastern"],
  ["Detroit", "Pistons", "Eastern"], ["Indiana", "Pacers", "Eastern"], ["Miami", "Heat", "Eastern"],
  ["Milwaukee", "Bucks", "Eastern"], ["New York", "Knicks", "Eastern"], ["Orlando", "Magic", "Eastern"],
  ["Philadelphia", "76ers", "Eastern"], ["Toronto", "Raptors", "Eastern"], ["Washington", "Wizards", "Eastern"],
  ["Dallas", "Mavericks", "Western"], ["Denver", "Nuggets", "Western"], ["Golden State", "Warriors", "Western"],
  ["Houston", "Rockets", "Western"], ["Los Angeles", "Clippers", "Western"], ["LA", "Clippers", "Western"],
  ["Los Angeles", "Lakers", "Western"], ["LA", "Lakers", "Western"], ["Memphis", "Grizzlies", "Western"],
  ["Minnesota", "Timberwolves", "Western"], ["New Orleans", "Pelicans", "Western"],
  ["Oklahoma City", "Thunder", "Western"], ["Phoenix", "Suns", "Western"], ["Portland", "Trail Blazers", "Western"],
  ["Sacramento", "Kings", "Western"], ["San Antonio", "Spurs", "Western"], ["Utah", "Jazz", "Western"],
];

/** Team (nickname or "city nickname", lower case) → conference. City alone is left out (Los Angeles is two teams). */
export const NBA_CONFERENCE: Record<string, string> = Object.fromEntries(
  NBA_TEAMS.flatMap(([city, nick, conf]) => [[nick.toLowerCase(), conf], [`${city} ${nick}`.toLowerCase(), conf]]),
);
NBA_CONFERENCE["sixers"] = "Eastern";
NBA_CONFERENCE["philadelphia sixers"] = "Eastern";
NBA_CONFERENCE["blazers"] = "Western";

/** Candidate (lower case) → party nomination word. Extend as candidates declare; remove when out of date. */
export const CANDIDATE_PARTY: Record<string, string> = {
  "jd vance": "Republican",
  "j.d. vance": "Republican",
  "marco rubio": "Republican",
  "gavin newsom": "Democratic",
  "josh shapiro": "Democratic",
  "pete buttigieg": "Democratic",
  "alexandria ocasio-cortez": "Democratic",
  "kamala harris": "Democratic",
};

export const IMPLICATION_RULES: ImplicationRule[] = [
  {
    id: "nba-title-implies-conference",
    description: "Winning the NBA title requires winning the conference",
    antecedent: { titlePattern: /^will (?:the )?(?<team>[a-z0-9 .'-]+?) win the (?:(?<season>20\d\d(?:[-–]\d{2,4})?) )?nba (?:finals|championship|title)\??$/i },
    consequent: { titlePattern: "^will (the )?{team} win the ({season} )?{team:map} conference( finals| title| championship)?\\??$" },
    entityMap: NBA_CONFERENCE,
  },
  {
    id: "president-implies-nomination",
    description: "Winning the presidency normally requires winning the party's nomination",
    antecedent: { titlePattern: /^will (?<person>[a-z .'-]+?) win the (?<year>20\d\d) (?:us |u\.s\. )?presidential election\??$/i },
    consequent: { titlePattern: "^will {person} (win|be) the {year} {person:map} (presidential )?(nomination|nominee)\\??$" },
    entityMap: CANDIDATE_PARTY,
    safety: "yellow",
    safetyNotes: ["A candidate could in theory win the presidency without their party's nomination; check both markets' rules."],
    maxCloseGapMs: 400 * 86_400_000,
  },
  {
    id: "world-cup-win-implies-final",
    description: "Winning the World Cup requires reaching the final",
    antecedent: { titlePattern: /^will (?<team>[a-z .'-]+?) win the (?<year>20\d\d) (?:fifa )?world cup\??$/i },
    consequent: { titlePattern: "^will {team} (reach|make|advance to) the {year} (fifa )?world cup final\\??$" },
  },
];
