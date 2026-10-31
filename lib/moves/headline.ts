/* The card headline, pure: the amount first, then what the money says in plain English, and the market as a grey
 * subline. claimOf says what the money is on (below, with "$… says" as it reads in a sentence); outcomeOf turns it into
 * the card's headline, the outcome in plain English with no amount ("Warriors to beat the Timberwolves", "No runs in
 * the 1st inning"). One builder per kind of market:
 *   moneyline   "$68K says Brewers win"                          a team as the outcome ("Brewers vs. Cubs")
 *   draw        "$12K says Arsenal vs. Chelsea ends in a draw"
 *   spread      "$40K says Brewers win by 2 or more"             "Spread: Brewers (-1.5)" (never the word spread)
 *               "$40K says Cubs win or lose by 1 or less"        the +1.5 side
 *   totals      "$25K says 9 or more runs"                       "O/U 8.5", Over/Under; runs, goals or points by league
 *   props       "$17K says no runs in the 1st inning"            1st inning / period / half / quarter totals
 *               "$30K says Mahomes over 275.5 passing yards"     player lines
 *   yes/no      "$85K says the Fed will cut rates in December"   "Will …?" with Yes or No
 *   multi       "$200K says Chiefs" on "Who will win the Super Bowl?"
 *   stocks      "$1.4M of Nvidia stock, bought by its CEO" / "$250M more Chevron for Berkshire Hathaway"
 * Facts only: what was bought, never a tip. */
import type { Move } from "./types";
import { niceName } from "@/lib/stocks/names";
import { dollars, quarterOf } from "./copy";

/** "$17K", "$1.4M", "$950". */
export function short(v: number): string {
  return dollars(v);
}

const clean = (t: string) => t.trim().replace(/\s+/g, " ").replace(/\s+([?!.,])/g, "$1");
const isYes = (o: string) => /^yes$/i.test(o.trim());
const isNo = (o: string) => /^no$/i.test(o.trim());

/** What one unit of score is called in a league. */
function unit(league: string | null | undefined, words: string): string {
  if (/\b(maps?)\b/i.test(words)) return "maps";
  if (/\b(kills?)\b/i.test(words)) return "kills";
  if (/\b(sets?)\b/i.test(words)) return "sets";
  if (/\bgames?\b/i.test(words) && league === "tennis") return "games";
  if (/\bruns?\b/i.test(words) || league === "MLB") return "runs";
  if (/\bgoals?\b/i.test(words) || league === "NHL" || league === "soccer") return "goals";
  return "points";
}
const one = (u: string) => u.replace(/s$/, "");

/** Over/Under a line, in whole numbers where the line is a half: O 8.5 → "9 or more", U 8.5 → "8 or fewer";
 *  U 0.5 → "no", O 0.5 → "at least one". */
function overUnder(side: "over" | "under", line: number, u: string): string {
  if (Number.isInteger(line * 2) && !Number.isInteger(line)) {
    if (side === "under") return line === 0.5 ? `no ${u}` : `${Math.floor(line)} or fewer ${u}`;
    return line === 0.5 ? `at least one ${one(u)}` : `${Math.ceil(line)} or more ${u}`;
  }
  return `${side} ${line} ${u}`;
}

const PERIOD = /\b(1st|2nd|3rd|4th|first|second|third|fourth|5th|6th|7th|8th|9th)\s+(inning|period|half|quarter|set|map)\b/i;

/** "Will the Fed cut rates in December?" → "the Fed will cut rates in December" (Yes) / "won't" (No). */
function fromQuestion(q: string, yes: boolean): string | null {
  const m = /^will\s+(.+?)\s+(be|have|win|lose|beat|cut|raise|hike|hold|pass|reach|hit|close|end|say|announce|sign|leave|resign|become|go|get|make|stay|remain|happen|fall|rise|drop|launch|release|score|finish|qualify|advance|default|out|top|pause|lower|increase|decrease|keep|reduce)\b\s*(.*?)\??$/i.exec(q);
  if (m) return `${m[1]} ${yes ? "will" : "won't"} ${m[2]!.toLowerCase()}${m[3] ? ` ${m[3]}` : ""}`;
  // "Brewers win?" / "Team wins?": a statement asked as a question.
  const won = /^(?!will |is |are |does |do |who |what |which )(.+?)\s+(wins?)\??$/i.exec(q);
  if (won) return yes ? `${won[1]} ${won[2]!.toLowerCase()}` : `${won[1]} ${/s$/i.test(won[2]!) ? "doesn't" : "don't"} win`;
  const there = /^will\s+there\s+be\s+(.+?)\??$/i.exec(q);
  if (there) return yes ? `there will be ${there[1]}` : `there won't be ${there[1]}`;
  // "Bitcoin above $100,000 on Friday?": a statement already; No puts "not" before the comparison.
  const cmp = /^(?!is |are |does |do |did |has |have |who |what |which |when |how )(.+?)\s+(above|below|over|under|at least|at most|between|reach(?:es)?|hits?)\s+(.+?)\??$/i.exec(q);
  if (cmp) return yes ? `${cmp[1]} ${cmp[2]} ${cmp[3]}` : `${cmp[1]} not ${cmp[2]} ${cmp[3]}`;
  return null;
}

/** The race in a candidate market's question, as a headline says it: "Will Democrats win the Senate race in
 *  Michigan?" → "the Michigan Senate race"; "Who will win the 2028 presidential election?" → "the 2028 presidential
 *  election"; "Michigan Senate Democratic primary winner?" → "the Michigan Senate Democratic primary". */
export function raceOf(title: string): string | null {
  const t = clean(title).replace(/^[“"]|[”"]$/g, "");
  const m = /^(?:will\s+.+?\s+win|who\s+will\s+win)\s+(.+?)\??$/i.exec(t) ?? /^(.+?)\s+winner\??$/i.exec(t);
  if (!m) return null;
  let r = m[1]!.trim().replace(/\s+in\s+(\d{4})$/i, " in $1");
  if (!/\b(race|election|primary|nomination|runoff|seat|governorship|mayoralty|caucus)\b/i.test(r)) return null;
  const moved = /^(?:the\s+)?(.+?)\s+(race|election|primary|seat|runoff)\s+in\s+([A-Z][\w.' -]+?)$/.exec(r);
  if (moved) r = `${moved[3]} ${moved[1]} ${moved[2]}`;
  r = r.replace(/^the\s+/i, "");
  return `the ${r.replace(/\b(Election|Race|Primary|Nomination|Seat|Runoff)\b/g, x => x.toLowerCase())}`;
}

/** What the money says, after "says". */
export function claimOf(m: Pick<Move, "outcome" | "outcomeSide" | "marketTitle" | "eventTitle" | "tab" | "league">): string {
  const o = clean(m.outcome), t = clean(m.marketTitle), words = `${t} ${m.eventTitle}`;
  // Totals and props: "…: O/U 8.5", "1st Inning Runs O/U 0.5", "Mahomes: Passing Yards O/U 275.5"; Over/Under.
  const ou = /(?:o\/u|over\/under|total[^0-9]*)\s*(\d+(?:\.\d+)?)/i.exec(t);
  const side = /^over\b/i.test(o) ? "over" : /^under\b/i.test(o) ? "under" : null;
  const lineInOutcome = /(?:over|under)\s+(\d+(?:\.\d+)?)/i.exec(o);
  if (side && (ou || lineInOutcome)) {
    const line = Number((ou ?? lineInOutcome)![1]);
    const period = PERIOD.exec(words);
    const player = /^([^:]+):\s*([a-z][a-z ]+?)\s*(?:o\/u|over\/under)/i.exec(t);
    if (player && !/\bvs\.?\b/i.test(player[1]!) && !period) return `${player[1]!.trim()} ${side} ${line} ${player[2]!.trim().toLowerCase()}`;
    const u = unit(m.league, words);
    return `${overUnder(side, line, u)}${period ? ` in the ${period[0]!.toLowerCase().replace(/^first/, "1st").replace(/^second/, "2nd")}` : ""}`;
  }
  // Spreads: "Spread: Brewers (-1.5)" or "Brewers (-1.5)", the money on a team.
  const sp = /(?:spread|handicap)?[:\s]*([^()]+?)\s*\(([-+−]\d+(?:\.\d+)?)\)/i.exec(t);
  if (sp && !isYes(o) && !isNo(o)) {
    const fav = sp[1]!.trim(), line = Math.abs(Number(sp[2]!.replace("−", "-"))), u = unit(m.league, words);
    const minus = /^[-−]/.test(sp[2]!);
    const onFav = o.toLowerCase() === fav.toLowerCase();
    const giving = onFav === minus; // the team the money is on gives the points
    const n = Number.isInteger(line) ? line : Math.ceil(line);
    return giving ? `${o} win by ${n} or more` : `${o} win or lose by ${n - 1 || 0} or less`.replace("lose by 0 or less", "tie");
  }
  // Kalshi spreads: "Charlotte wins by over 5.5 points?" with "Charlotte wins by over 5.5 Points" (Yes) or "No".
  const ks = /^(.+?)\s+wins?\s+by\s+over\s+(\d+(?:\.\d+)?)\s+(points?|runs?|goals?)\??$/i.exec(isYes(o) || isNo(o) ? t : o) ?? /^(.+?)\s+wins?\s+by\s+over\s+(\d+(?:\.\d+)?)\s+(points?|runs?|goals?)\??$/i.exec(t);
  if (ks) {
    const n = Math.floor(Number(ks[2])) + 1;
    const no = isNo(o) || (m.outcomeSide === "no" && !/wins? by over/i.test(o));
    return `${ks[1]} ${no ? "don't win" : "win"} by ${n} or more`;
  }
  // Draws.
  if (/^tie$/i.test(o) && m.tab === "sports") return `${m.eventTitle && /\b(vs\.?|at)\b/i.test(m.eventTitle) ? clean(m.eventTitle).replace(/\s+at\s+/i, " vs ") : "it"} ends in a draw`;
  if (/\bdraw\b/i.test(o) || (/\bend in a draw\b/i.test(t) && isYes(o))) return `${m.eventTitle && /\bvs\.?\b/i.test(m.eventTitle) ? clean(m.eventTitle) : "it"} ends in a draw`;
  if (/\bend in a draw\b/i.test(t) && isNo(o)) return "it doesn't end in a draw";
  // "Will Arsenal FC win on 2026-10-30?" Yes / No.
  // Futures keep what they win: "Will the Knicks win the 2027 NBA Finals?" No → "Knicks don't win the 2027 NBA Finals".
  const wins = /^will\s+(.+?)\s+win\b(.*?)\??$/i.exec(t);
  if (wins && (isYes(o) || isNo(o)) && m.tab === "sports") {
    const subj = wins[1]!.replace(/^the\s+/i, ""), rest = wins[2]!.trim();
    const what = !rest || /^on\s+\d{4}-\d{2}-\d{2}$/i.test(rest) ? "" : ` ${rest}`;
    return `${subj} ${isYes(o) ? "win" : "don't win"}${what}`;
  }
  // Yes / No on a question.
  if (isYes(o) || isNo(o)) {
    const q = fromQuestion(t, isYes(o));
    if (q) return q;
    return `${isYes(o) ? "Yes" : "No"} on “${t.replace(/\?$/, "")}?”`;
  }
  // A candidate as the outcome of a race ("Abdul El-Sayed" on "Will Democrats win the Senate race in Michigan?", or on
  // "Who will win the Michigan Senate race?"): "Abdul El-Sayed wins the Michigan Senate race"; the No side "doesn't win".
  if (m.tab !== "sports") { const race = raceOf(t); if (race) return `${o} ${m.outcomeSide === "no" ? "doesn't win" : "wins"} ${race}`; }
  // A team or a name as the outcome: moneylines ("Brewers vs. Cubs") and multi-outcome markets.
  if (m.tab !== "sports") return /\?$/.test(t) && !/^who\b/i.test(t) ? `“${o}” on ${t.replace(/\?$/, "")}` : o;
  return `${o} win${/\b(map|game|set)\s*\d/i.test(t) ? ` ${t.match(/\b(map|game|set)\s*\d+/i)![0]!.replace(/^\w/, c => c.toLowerCase())}` : ""}`;
}

/** The grey line under the headline: the matchup or the question, then the league. */
export function sublineOf(m: Pick<Move, "marketTitle" | "eventTitle" | "tab" | "league"> & { leagueLabel?: string | null }): string {
  const t = clean(m.marketTitle), e = clean(m.eventTitle);
  const main = m.tab === "sports" ? (/\bvs\.?\b/i.test(e) ? e : t) : (e && e !== t && t.length < 40 && !/\?$/.test(t) ? `${e}: ${t}` : t);
  const lg = m.leagueLabel ?? (m.league && m.league !== "other" ? m.league : null);
  return lg && !main.includes(lg) ? `${main} · ${lg}` : main;
}

/** Who at the company bought, for the headline: "its CEO", "a director", "a 10% owner", "an insider". */
export function roleOf(role: string): string {
  const r = role.replace(/^\s*the\s+/i, "").trim();
  if (/\b(ceo|chief executive)\b/i.test(r)) return "its CEO";
  if (/\b(cfo|chief financial)\b/i.test(r)) return "its CFO";
  if (/\b(coo|chief operating)\b/i.test(r)) return "its COO";
  if (/\bpresident\b/i.test(r)) return "its president";
  if (/\bchair/i.test(r)) return "its chair";
  if (/\bdirector\b/i.test(r)) return "a director";
  if (/10\s*%/.test(r)) return "a 10% owner";
  if (/\bofficer\b|\bvp\b|vice president|chief/i.test(r)) return "an officer";
  return "an insider";
}

/** Pro team nicknames take "the" ("to beat the Lakers"); college schools and clubs don't ("to beat Delaware"). */
const US_TEAMS = /^(NFL|NBA|WNBA|MLB|NHL|MLS)$/i;
const cap = (t: string) => t.replace(/^[a-z]/, c => c.toUpperCase());

/** A person in politics by their surname ("James Talarico" → "Talarico"); anything else as written. */
function who(name: string, category: string | null | undefined): string {
  const w = name.trim().split(/\s+/);
  return category === "politics" && w.length >= 2 && w.length <= 3 && w.every(x => /^[A-ZÀ-Ý][\p{L}'.-]+$/u.test(x)) ? w[w.length - 1]! : name;
}
/** Parties read with "the" ("The Republicans"); everything else as written. */
const PARTIES = /^(the\s+)?(republicans|democrats|gop|tories|conservatives|labour|liberals)$/i;
const subjectOf = (s: string) => (PARTIES.test(s.trim()) ? `the ${s.trim().replace(/^the\s+/i, "")}` : s.trim());
/** "the Republicans", "Democrats", "the Knicks": a plural noun, so "win", "don't win". A person's name never is. */
const isPlural = (s: string) => PARTIES.test(s.trim()) || (/^(the\s+)?[A-Z][a-z]+s$/.test(s.trim()) && !/ss$/.test(s.trim()));
const office = (s: string) => s.replace(/\b(Election|Race|Primary|Nomination|Seat|Runoff)\b/g, x => x.toLowerCase());

/** Markets that aren't sports, in plain present tense: "Talarico wins the Texas Senate race", "Mamdani doesn't win the
 *  NYC mayoral election"; a name under an event ("Texas Senate Election Winner", "Who will win the …?") the same way. */
function plain(m: Pick<Move, "outcome" | "marketTitle" | "eventTitle"> & { category?: string | null }, c: string): string {
  const t = clean(m.marketTitle), e = clean(m.eventTitle), o = clean(m.outcome);
  if ((isYes(o) || isNo(o)) && !/\?$/.test(t) && t.split(/\s+/).length <= 5) {
    const what = /^who will win (.+?)\??$/i.exec(e)?.[1] ?? (/^(.+?)\s+winner$/i.exec(e)?.[1] ? `the ${/^(.+?)\s+winner$/i.exec(e)![1]}` : null);
    if (what) return `${who(t, m.category)} ${isYes(o) ? "wins" : "doesn't win"} ${office(what)}`;
  }
  const will = /^(.+?) (will|won't) (win|lose)\b(.*)$/.exec(c);
  if (will) {
    const subj = subjectOf(will[1]!), many = isPlural(subj);
    const verb = will[2] === "will" ? (many ? will[3] : `${will[3]}s`) : `${many ? "don't" : "doesn't"} ${will[3]}`;
    return `${who(subj, m.category)} ${verb}${office(will[4]!)}`;
  }
  return c;
}

/** The outcome the money is on, in plain English: "Warriors to beat the Timberwolves", "Brewers to win by 2 or more",
 *  "No runs in the 1st inning", "Talarico wins the Texas Senate race". The amount is the card's result, not here. */
export function outcomeOf(m: Pick<Move, "outcome" | "outcomeSide" | "marketTitle" | "eventTitle" | "tab" | "league"> & { category?: string | null }): string {
  const c = claimOf(m), o = clean(m.outcome);
  // "Who will win the Super Bowl?" on Chiefs: "Chiefs to win the Super Bowl".
  const whoWins = /^who will (win|be|become|lead|top)\s+(.+?)\??$/i.exec(clean(m.marketTitle));
  if (whoWins && (c === o || c === `${o} win`)) return cap(`${o} to ${whoWins[1]!.toLowerCase()} ${whoWins[2]}`);
  if (/ (wins|doesn't win) the /.test(c) && m.tab !== "sports") return cap(c);
  if (m.tab === "sports") {
    // A moneyline on one side of "A vs. B": "A to beat (the) B".
    const vs = /^(.+?)\s+(?:vs\.?|at)\s+(.+?)$/i.exec(clean(m.eventTitle).replace(/^[^:]*:\s*/, ""));
    if (vs && c === `${o} win`) {
      const [a, b] = [vs[1]!.trim(), vs[2]!.trim()];
      const other = a.toLowerCase() === o.toLowerCase() ? b : b.toLowerCase() === o.toLowerCase() ? a : null;
      if (other) return `${o} to beat ${m.league && US_TEAMS.test(m.league) ? "the " : ""}${other}`;
    }
    const w = /^(.+?) (win|don't win|doesn't win)(.*)$/.exec(c);
    if (w) return cap(`${w[1]} ${w[2] === "win" ? "to win" : "not to win"}${w[3]}`);
    if (/ tie$/.test(c)) return cap(c.replace(/ tie$/, " to win or tie"));
  }
  return cap(plain(m, c));
}

/** A card's headline: the outcome for a bet; for a filing, what was bought and by whom. */
export function headlineOf(m: Move): string {
  if (m.source === "sec" && m.detail) {
    const d = m.detail;
    if (d.kind === "insider") return `${niceName(d.company)} stock, bought by ${roleOf(d.role)}`;
    return `More ${niceName(d.company)} for ${niceName(d.fund)}${d.period ? ` in ${quarterOf(d.period)}` : ""}`;
  }
  return outcomeOf(m);
}

/** "62% chance": the price paid, as the chance the market gave it then. */
export const chance = (p: number): string | null => (p > 0 && p < 1 ? `${Math.round(p * 100)}%` : null);
