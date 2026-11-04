/* What a market's YES contract actually pays on, read from the venue's own title and labels, so a Polymarket market and
 * a Kalshi market can be compared outcome for outcome:
 *   winner  "Hawks vs. Wizards" (YES Hawks)            ↔ "Atlanta wins"
 *   spread  "Spread: Hawks (-4.5)"                      ↔ "Atlanta wins by over 4.5 points"
 *   total   "Hawks vs. Wizards: O/U 230.5" (YES Over)   ↔ "Full Game: Over 230.5 points scored"
 *   fed     "Will the Fed decrease rates by 25 bps…"     ↔ "Will the Federal Reserve Cut rates by 25bps…"
 *   party   "Will the Democrats win the Florida governor race in 2026?" ↔ "Will the Democratic party win the governorship in Florida"
 * Anything else is "other" and never auto-qualifies. Pure. */
import type { VMarket } from "@/lib/types";
import { TEAMS, type League } from "@/lib/matching/aliases";

export type Contract =
  | { kind: "winner"; team: string; period: Period }
  | { kind: "spread"; team: string; line: number; period: Period }
  | { kind: "total"; side: "over" | "under"; line: number; period: Period; team: string | null }
  | { kind: "fed"; move: "cut" | "hike" | "hold"; bps: number; plus: boolean; approx: boolean }
  | { kind: "party"; party: "D" | "R"; office: string; state: string }
  | { kind: "other"; label: string };

/** Which part of the game a line is on: the whole game, a half or a quarter. A first-half total is never a full-game
 *  or second-half total. */
export type Period = "game" | "h1" | "h2" | "q1" | "q2" | "q3" | "q4";
export function periodOf(text: string): Period {
  const t = text.toLowerCase();
  if (/\b(1h|1st half|first half)\b/.test(t)) return "h1";
  if (/\b(2h|2nd half|second half)\b/.test(t)) return "h2";
  for (const [q, re] of [["q1", /\b(1q|1st quarter|first quarter)\b/], ["q2", /\b(2q|2nd quarter|second quarter)\b/], ["q3", /\b(3q|3rd quarter|third quarter)\b/], ["q4", /\b(4q|4th quarter|fourth quarter)\b/]] as const) if (re.test(t)) return q;
  return "game";
}

export interface Parsed { contract: Contract; event: string | null }

const STATES = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The league a market is in, from Kalshi's series ticker, Polymarket's link, or its words. */
function leagueOf(m: VMarket): League | null {
  const s = `${m.seriesId ?? ""} ${m.eventId} ${m.url}`.toLowerCase();
  for (const l of ["nba", "nfl", "mlb", "nhl"] as const) if (s.includes(`kx${l}`) || s.includes(`/event/${l}-`) || s.includes(`${l}-`)) return l;
  return null;
}

/** A team in `league` named in `text` (city, nickname or Kalshi's "Los Angeles L" form): "nba:ATL". */
export function teamIn(text: string, league: League): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, " ")} `;
  const hits = TEAMS[league].filter(r => [r.name, ...(r.extra ?? [])].some(w => t.includes(` ${w.toLowerCase()} `)));
  if (hits.length === 1) return `${league}:${hits[0]!.abbr[0]}`;
  const byCity = TEAMS[league].filter(r => t.includes(` ${r.city.toLowerCase()} `));
  return byCity.length === 1 ? `${league}:${byCity[0]!.abbr[0]}` : null;
}

function teamsIn(text: string, league: League): string[] {
  const t = text.toLowerCase();
  return TEAMS[league].filter(r => [r.name, ...(r.extra ?? [])].some(w => t.includes(w.toLowerCase())) || t.includes(r.city.toLowerCase())).map(r => `${league}:${r.abbr[0]}`);
}

/** The event a market belongs to, as a comparable key: a game (two teams and its league), a Fed meeting, a race. */
function eventKey(m: VMarket, c: Contract, league: League | null): string | null {
  const words = `${m.eventTitle ?? ""} ${m.title} ${m.eventId}`;
  if (league && (c.kind === "winner" || c.kind === "spread" || c.kind === "total")) {
    let teams = [...new Set(teamsIn(`${m.eventTitle ?? ""} ${m.title}`, league))];
    if (teams.length < 2) {
      // Kalshi's event ticker carries both teams' codes ("KXNBAGAME-26NOV04ATLWAS").
      const code = /-\d{2}[A-Z]{3}\d{2}([A-Z]{4,6})$/.exec(m.eventId)?.[1];
      if (code) teams = TEAMS[league].filter(r => r.abbr.some(a => code.startsWith(a) || code.endsWith(a))).map(r => `${league}:${r.abbr[0]}`);
    }
    return teams.length === 2 ? `game:${teams.sort().join("+")}` : null;
  }
  if (c.kind === "fed") {
    const mo = MONTHS.find(x => words.toLowerCase().includes(x)), yr = /\b(20\d{2})\b/.exec(words)?.[1] ?? (/-(\d{2})[A-Z]{3}\b/.exec(m.eventId)?.[1] ? `20${/-(\d{2})[A-Z]{3}\b/.exec(m.eventId)![1]}` : null);
    return mo && yr ? `fed:${mo}-${yr}` : null;
  }
  if (c.kind === "party") {
    const yr = /\b(20\d{2})\b/.exec(words)?.[1] ?? (/-(\d{2})$/.exec(m.eventId)?.[1] ? `20${/-(\d{2})$/.exec(m.eventId)![1]}` : null);
    return `race:${c.state}:${c.office}:${yr ?? "?"}`;
  }
  return null;
}

const num = (s: string) => Number(s.replace(/[^\d.]/g, ""));

export function parseContract(m: VMarket): Parsed {
  const league = leagueOf(m);
  const title = m.title.trim(), yes = m.yesLabel.trim(), low = `${title} ${yes}`.toLowerCase();
  const period = periodOf(title);
  let c: Contract = { kind: "other", label: `${title} | ${yes}` };
  // Spreads.
  const ps = /^Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)/i.exec(title);
  const ks = /^(.+?) wins by over (\d+(?:\.\d+)?) points?/i.exec(title);
  // Totals.
  const pt = /O\/U\s*(\d+(?:\.\d+)?)/i.exec(title);
  const kt = /\b(Over|Under)\s+(\d+(?:\.\d+)?)\s+points?\s+scored/i.exec(title);
  // A team's own total ("New Orleans over 119.5 points scored") is not the game's total.
  const kTeamTotal = league && kt ? teamIn(title.slice(0, kt.index).replace(/^.*?:/, ""), league) : null;
  if (league && ps) {
    const team = teamIn(ps[1]!, league), line = Math.abs(Number(ps[2]));
    // "Spread: Hawks (-4.5)" pays when the Hawks win by more than 4.5; a "+" line is the other team's spread.
    if (team && Number(ps[2]) < 0) c = { kind: "spread", team, line, period };
  } else if (league && ks) {
    const team = teamIn(ks[1]!, league);
    if (team) c = { kind: "spread", team, line: Number(ks[2]), period };
  } else if (league && pt && /^(over|under)$/i.test(yes)) {
    const teamTotal = /team total/i.test(title) ? teamIn(title, league!) : null;
    c = { kind: "total", side: yes.toLowerCase() as "over" | "under", line: Number(pt[1]), period, team: teamTotal };
  } else if (league && kt) {
    c = { kind: "total", side: kt[1]!.toLowerCase() as "over" | "under", line: Number(kt[2]), period, team: kTeamTotal };
  } else if (league && (/ vs\.? | at /i.test(title) && !/:/.test(title) || /^(.+?) wins$/i.test(title))) {
    const team = teamIn(yes, league) ?? teamIn(/^(.+?) wins$/i.exec(title)?.[1] ?? "", league);
    if (team) c = { kind: "winner", team, period };
  } else if (/\bfed(eral reserve)?\b/i.test(low) && /\b(rate|rates|bps)\b/i.test(low)) {
    const hold = /no change|maintain|hike rates by 0 ?bps|holds?|pause/i.test(low);
    const cut = /\b(cut|decrease|lower)/i.test(low), hike = /\b(hike|increase|raise)/i.test(low);
    const bp = /(>|\b)\s*(\d{2,3})\s*\+?\s*bps?/i.exec(low);
    const plus = /\d+\s*\+\s*bps?|\d+\+/i.test(low), gt = />\s*\d+\s*bps?/i.test(low);
    if (hold) c = { kind: "fed", move: "hold", bps: 0, plus: false, approx: false };
    else if ((cut || hike) && bp) {
      // ">25bps" is read as 50+ (the Fed moves in 25bp steps): equivalent in practice, but worded differently, so it is
      // flagged for a person to confirm.
      const bps = gt ? num(bp[2]!) + 25 : num(bp[2]!);
      c = { kind: "fed", move: cut ? "cut" : "hike", bps, plus: plus || gt, approx: gt };
    }
  } else if (/\b(governor|governorship|senate|house)\b/i.test(low) && /\b(democrat|republican)/i.test(low)
    // Only the plain race winner: never a margin, a county, a combination or a "which state" question.
    && !/%|\bmargin\b|\bby (more|less|over|under|at least)\b|\bcounty\b|\bhighest\b|\blowest\b|\bstate with\b|\bcombo\b|\band\b|\bexactly\b|\bseats?\b|\bsweep\b|\bwinner be\b|\bpopular vote\b|\bturnout\b|\bprimary\b|\bnominee\b/i.test(title)) {
    const state = STATES.find(s => low.includes(s));
    const office = /governor/i.test(low) ? "governor" : /senate/i.test(low) ? "senate" : "house";
    const party = /\bdemocrat/i.test(title) ? "D" : /\brepublican/i.test(title) ? "R" : /\(d\)/i.test(yes) ? "D" : /\(r\)/i.test(yes) ? "R" : null;
    if (state && party) c = { kind: "party", party, office, state };
  }
  return { contract: c, event: c.kind === "other" ? null : eventKey(m, c, league) };
}
