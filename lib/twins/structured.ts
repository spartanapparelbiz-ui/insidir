/* Auto-approval for a twin: all five fields must match from the venues' own structured data (VMarket.ids, the event
 * slug and ticker, the resolution sources, the close times), never from a title. Pure.
 *   sports      Polymarket's event slug "nba-atl-was-2026-11-04" and Kalshi's event ticker "KXNBAGAME-26NOV04ATLWAS"
 *               give the league, both teams' codes and the game date: the same game.
 *               Outcome: Polymarket's outcome name (a team, or Over) against Kalshi's ticker suffix ("-ATL", "-WAS27",
 *               "-231") and strike type ("greater" = Over / wins by more than).
 *               Line: Polymarket's line field and Kalshi's floor_strike, the same exact number.
 *   candidates  Polymarket's event slug "texas-senate-election-winner" and Kalshi's event ticker "SENATETX-26": the same
 *               state, office and year; Polymarket's group item "James Talarico (D)" and Kalshi's yes subtitle "James
 *               Talarico": the same candidate.
 *   rules       both venues state a resolution source, on the same domain.
 *   close       both state a close time, within 36 hours.
 * Any field that can't be read this way (missing, or only in the title) leaves the twin for a person in /admin/twins. */
import type { VMarket } from "@/lib/types";
import type { TwinResult } from "./check";
import { TEAMS, type League } from "@/lib/matching/aliases";

export type Field = "event" | "outcome" | "line" | "rules" | "close";
export type Basis = "match" | "differs" | "unknown";
export interface AutoCheck { auto: boolean; kind: "moneyline" | "spread" | "total" | "candidate" | null; fields: Record<Field, Basis>; notes: string[] }

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const CLOSE_MS = 36 * 3_600_000;

/** A team code as either venue writes it ("atl", "WAS", "BKN"/"BRK") → its first code in TEAMS. */
function teamCode(league: League, code: string): string | null {
  const c = code.toUpperCase();
  return TEAMS[league].find(r => r.abbr.includes(c))?.abbr[0] ?? null;
}

interface Game { league: League; date: string; teams: string[] }

/** "nba-atl-was-2026-11-04" → { nba, 2026-11-04, [ATL, WAS] }. */
export function polyGame(slug: string | null | undefined): Game | null {
  const m = /^(nba|nfl|mlb|nhl)-([a-z]{2,4})-([a-z]{2,4})-(\d{4})-(\d{2})-(\d{2})$/.exec(slug ?? "");
  if (!m) return null;
  const league = m[1] as League, a = teamCode(league, m[2]!), b = teamCode(league, m[3]!);
  return a && b ? { league, date: `${m[4]}-${m[5]}-${m[6]}`, teams: [a, b].sort() } : null;
}

/* ---------- Soccer: one league's game on one date, teams by club name ---------- */

/** Polymarket's soccer league prefixes → Kalshi's game series. */
export const SOCCER_SERIES: Record<string, string> = {
  ucl: "KXUCLGAME", uel: "KXUELGAME", epl: "KXEPLGAME", lal: "KXLALIGAGAME", sea: "KXSERIEAGAME", bun: "KXBUNDESLIGAGAME",
  fl1: "KXLIGUE1GAME", mls: "KXMLSGAME", ere: "KXEREDIVISIEGAME", mex: "KXLIGAMXGAME",
};
const SERIES_LEAGUE = Object.fromEntries(Object.entries(SOCCER_SERIES).map(([k, v]) => [v, k]));

/** "ucl-slp-ars-2026-11-04" → { league: "ucl", date }. Pure. */
export function polySoccer(slug: string | null | undefined): { league: string; date: string } | null {
  const m = /^([a-z0-9]+)-[a-z0-9]{2,6}-[a-z0-9]{2,6}-(\d{4}-\d{2}-\d{2})$/.exec(slug ?? "");
  return m && SOCCER_SERIES[m[1]!] ? { league: m[1]!, date: m[2]! } : null;
}
/** "KXUCLGAME-26NOV04SLAARS" → { league: "ucl", date: "2026-11-04" }. Pure. */
export function kalshiSoccer(eventTicker: string): { league: string; date: string } | null {
  const m = /^(KX[A-Z0-9]+GAME)-(\d{2})([A-Z]{3})(\d{2})[A-Z0-9]+$/.exec(eventTicker);
  const league = m ? SERIES_LEAGUE[m[1]!] : undefined;
  if (!m || !league) return null;
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(m[3]!) + 1;
  return mon ? { league, date: `20${m[2]}-${String(mon).padStart(2, "0")}-${m[4]}` } : null;
}

/** Club names as both venues write them, reduced to one form ("SK Slavia Praha" and "Slavia Prague" → "slavia prague";
 *  "Arsenal FC" → "arsenal"). Only these exact forms count as the same club. Pure. */
const CLUB_WORDS = new Set(["fc", "cf", "sc", "sk", "afc", "ac", "as", "ss", "ssc", "rc", "rcd", "cd", "ud", "sd", "sv", "fk", "nk", "bk", "if", "club", "de", "calcio", "1", "cp", "sl", "sad", "us", "osc", "ogc", "fsv", "tsg", "vfb", "vfl", "bsc", "sporting club"]);
const CITY: Record<string, string> = { praha: "prague", munchen: "munich", koln: "cologne", lisboa: "lisbon", milano: "milan", torino: "turin", sevilla: "seville", roma: "rome", napoli: "naples", firenze: "florence", genova: "genoa", internazionale: "inter", wien: "vienna", bruxelles: "brussels", kobenhavn: "copenhagen", athina: "athens", psv: "eindhoven" };
export function clubName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter(w => w && !CLUB_WORDS.has(w) && !/^\d+$/.test(w)).map(w => CITY[w] ?? w).join(" ").trim();
}

/** The same club: the same reduced name, or one's words all in the other's ("dortmund" in "bv borussia dortmund",
 *  "leipzig" in "rb leipzig"), the shorter with a word of 4+ letters. Pure. */
export function sameClub(a: string, b: string): boolean {
  const x = clubName(a), y = clubName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  const sw = s.split(" "), lw = new Set(l.split(" "));
  return sw.some(w => w.length >= 4) && sw.every(w => lw.has(w));
}
const teamsOf = (eventTitle: string | null | undefined): [string, string] | null => {
  const m = /^(.+?)\s+vs\.?\s+(.+?)$/i.exec((eventTitle ?? "").trim());
  return m ? [m[1]!, m[2]!] : null;
};
/** Both clubs of one game are both clubs of the other, in either order. Pure. */
const sameGame = (p: [string, string], k: [string, string]) => (sameClub(p[0], k[0]) && sameClub(p[1], k[1])) || (sameClub(p[0], k[1]) && sameClub(p[1], k[0]));

/** "KXNBAGAME-26NOV04ATLWAS" → { nba, 2026-11-04, [ATL, WAS], GAME }. The two team codes split where both halves are
 *  codes of that league. */
export function kalshiGame(eventTicker: string): (Game & { type: "GAME" | "SPREAD" | "TOTAL" }) | null {
  const m = /^KX(NBA|NFL|MLB|NHL)(GAME|SPREAD|TOTAL)-(\d{2})([A-Z]{3})(\d{2})([A-Z]{4,8})$/.exec(eventTicker);
  if (!m || !MONTHS[m[4]!]) return null;
  const league = m[1]!.toLowerCase() as League, codes = m[6]!;
  for (let i = 2; i <= codes.length - 2; i++) {
    const a = teamCode(league, codes.slice(0, i)), b = teamCode(league, codes.slice(i));
    if (a && b) return { league, date: `20${m[3]}-${MONTHS[m[4]!]}-${m[5]}`, teams: [a, b].sort(), type: m[2] as "GAME" | "SPREAD" | "TOTAL" };
  }
  return null;
}

/** A team named exactly as the venue's outcome ("Hawks", or "Atlanta Hawks") → its code. */
function teamByName(league: League, name: string): string | null {
  const n = name.trim().toLowerCase();
  const hit = TEAMS[league].filter(r => r.name.toLowerCase() === n || `${r.city} ${r.name}`.toLowerCase() === n);
  return hit.length === 1 ? hit[0]!.abbr[0]! : null;
}

const STATES: Record<string, string> = { AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire", NJ: "new-jersey", NM: "new-mexico", NY: "new-york", NC: "north-carolina", ND: "north-dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode-island", SC: "south-carolina", SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming" };

/** "SENATETX-26" / "KXGOVFL-26" → texas senate 2026; "texas-senate-election-winner" → texas senate (the year from the
 *  close time, both venues). */
export function kalshiRace(eventTicker: string): { state: string; office: "senate" | "governor"; year: string } | null {
  const m = /^(?:KX)?(SENATE|GOV)([A-Z]{2})-(\d{2})$/.exec(eventTicker);
  return m && STATES[m[2]!] ? { state: STATES[m[2]!]!, office: m[1] === "GOV" ? "governor" : "senate", year: `20${m[3]}` } : null;
}
export function polyRace(slug: string | null | undefined): { state: string; office: "senate" | "governor" } | null {
  const m = /^([a-z-]+)-(senate|governor)-election-winner$/.exec(slug ?? "");
  return m && Object.values(STATES).includes(m[1]!) ? { state: m[1]!, office: m[2] as "senate" | "governor" } : null;
}
/** "James Talarico (D)" → "james talarico". */
const person = (s: string | null | undefined) => (s ?? "").replace(/\s*\((?:D|R|I|L|G)\)\s*$/i, "").trim().toLowerCase().replace(/\s+/g, " ");

/** A time's date in US Eastern time, "2026-11-05". */
export const etDate = (ms: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

const domain = (s: string | null | undefined): string[] => [...(s ?? "").matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map(m => m[1]!.toLowerCase());

export function autoCheck(poly: VMarket, kalshi: VMarket): AutoCheck {
  const fields: Record<Field, Basis> = { event: "unknown", outcome: "unknown", line: "unknown", rules: "unknown", close: "unknown" };
  const notes: string[] = [];
  const p = poly.ids ?? {}, k = kalshi.ids ?? {};
  let kind: AutoCheck["kind"] = null;
  const pg = polyGame(p.eventSlug), kg = kalshiGame(kalshi.eventId);
  if (pg && kg) {
    // Kalshi's ticker carries the game's US Eastern date; Polymarket's slug sometimes the UTC one (a 8:15pm ET Thursday
    // game is "…-2026-11-06" on Polymarket and "26NOV05" on Kalshi). Either is the same game when the teams match.
    const sameDay = pg.date === kg.date || (poly.closeTime !== null && etDate(poly.closeTime) === kg.date);
    fields.event = pg.league === kg.league && sameDay && pg.teams.join() === kg.teams.join() ? "match" : "differs";
    const suffix = kalshi.id.slice(kalshi.eventId.length + 1);
    const kTeam = teamCode(kg.league, suffix.replace(/\d+$/, ""));
    const outcomes = p.outcomes ?? [];
    if (p.sportsMarketType === "moneyline" && kg.type === "GAME") {
      kind = "moneyline";
      const yes = outcomes[0] ? teamByName(pg.league, outcomes[0]) : null;
      fields.outcome = yes && kTeam ? (yes === kTeam ? "match" : "differs") : "unknown";
      fields.line = "match"; // a moneyline has no line on either venue
    } else if (p.sportsMarketType === "spreads" && kg.type === "SPREAD") {
      kind = "spread";
      const yes = outcomes[0] ? teamByName(pg.league, outcomes[0]) : null;
      fields.outcome = yes && kTeam && k.strikeType === "greater" && typeof p.line === "number" && p.line < 0 ? (yes === kTeam ? "match" : "differs") : "unknown";
      fields.line = typeof p.line === "number" && typeof k.floorStrike === "number" ? (Math.abs(p.line) === k.floorStrike ? "match" : "differs") : "unknown";
    } else if (p.sportsMarketType === "totals" && kg.type === "TOTAL") {
      kind = "total";
      fields.outcome = outcomes[0]?.toLowerCase() === "over" && k.strikeType === "greater" ? "match" : outcomes[0]?.toLowerCase() === "under" ? "differs" : "unknown";
      fields.line = typeof p.line === "number" && typeof k.floorStrike === "number" ? (p.line === k.floorStrike ? "match" : "differs") : "unknown";
    } else notes.push("Not a full-game moneyline, spread or total on both venues");
  } else if (polySoccer(p.eventSlug) && kalshiSoccer(kalshi.eventId)) {
    // Soccer: same league and date, the same two clubs; a club's win for that club, the draw for the tie. 90 minutes on
    // both venues.
    const ps = polySoccer(p.eventSlug)!, ks = kalshiSoccer(kalshi.eventId)!;
    const sameDay = ps.date === ks.date || (poly.closeTime !== null && etDate(poly.closeTime) === ks.date);
    const pt = teamsOf(poly.eventTitle), kt = teamsOf(kalshi.eventTitle);
    fields.event = ps.league === ks.league && sameDay && pt && kt ? (sameGame(pt, kt) ? "match" : "differs") : "unknown";
    if (p.sportsMarketType === "moneyline") {
      kind = "moneyline";
      const draw = /^draw\b/i.test(p.group ?? "") || /end in a draw/i.test(poly.title);
      const tie = /^tie$/i.test(k.yesSub ?? "");
      fields.outcome = draw || tie ? (draw && tie ? "match" : "differs") : p.group && k.yesSub ? (sameClub(p.group, k.yesSub) ? "match" : "differs") : "unknown";
      fields.line = "match";
    } else notes.push("Not a full-game moneyline on both venues");
  } else {
    const pr = polyRace(p.eventSlug), kr = kalshiRace(kalshi.eventId);
    if (pr && kr) {
      kind = "candidate";
      const pYear = poly.closeTime ? String(new Date(poly.closeTime).getUTCFullYear()) : null;
      fields.event = pr.state === kr.state && pr.office === kr.office && pYear === kr.year ? "match" : "differs";
      fields.outcome = p.group && k.yesSub ? (person(p.group) === person(k.yesSub) ? "match" : "differs") : "unknown";
      fields.line = "match"; // a race winner has no line
    } else notes.push("No structured game or race id on both venues");
  }
  const dp = domain(poly.resolutionSource), dk = domain(kalshi.resolutionSource);
  fields.rules = dp.length && dk.length ? (dp.some(d => dk.some(e => d === e || d.endsWith(`.${e}`) || e.endsWith(`.${d}`))) ? "match" : "differs") : "unknown";
  // Soccer: the venues cite different reporters (the governing body's statistics, ESPN/Fox) of the same fact; what
  // must match is the basis, the result after 90 minutes plus stoppage time, stated in both venues' rules.
  if (kind === "moneyline" && polySoccer(p.eventSlug)) {
    const ninety = (t: string | null | undefined) => /90 minutes/i.test(t ?? "") && /stoppage/i.test(t ?? "");
    fields.rules = ninety(poly.rules) && ninety(kalshi.rules) ? "match" : poly.rules && kalshi.rules ? "differs" : "unknown";
  }
  if (fields.rules === "unknown") notes.push("A venue states no resolution source");
  fields.close = poly.closeTime !== null && kalshi.closeTime !== null ? (Math.abs(poly.closeTime - kalshi.closeTime) <= CLOSE_MS ? "match" : "differs") : "unknown";
  if (fields.close === "differs") notes.push("Close times more than 36 hours apart");
  const auto = kind !== null && Object.values(fields).every(b => b === "match");
  return { auto, kind, fields, notes };
}

const KIND = { moneyline: "winner", spread: "spread", total: "total", candidate: "party" } as const;

/** The twin test's result for a pair whose five fields all match from structured data: an exact candidate. (The title
 *  reading in lib/twins/check.ts can't read every venue's wording, e.g. Kalshi's "Los Angeles L wins" or NHL "goals";
 *  for a game read from slugs, tickers, outcome names and line fields it isn't needed.) */
export function structuredResult(a: AutoCheck): TwinResult {
  return { verdict: "candidate", confidence: 0.99, checks: { event: true, outcome: true, line: true, rules: true, close: true }, notes: ["All five fields from the venues' structured data"], kind: KIND[a.kind!] };
}

/** Each Polymarket market's single Kalshi twin among `kalshi`: all five fields match from structured data. Pure. */
export function pairByStructure(poly: readonly VMarket[], kalshi: readonly VMarket[]) {
  const out: Array<{ poly: VMarket; kalshi: VMarket; result: TwinResult }> = [];
  const taken = new Set<string>();
  for (const pm of poly) {
    const hits = kalshi.map(km => ({ km, a: autoCheck(pm, km) })).filter(x => x.a.auto);
    if (hits.length === 1 && !taken.has(hits[0]!.km.id)) { taken.add(hits[0]!.km.id); out.push({ poly: pm, kalshi: hits[0]!.km, result: structuredResult(hits[0]!.a) }); }
  }
  return out;
}

/** Every game both venues list, paired market by market from structured data alone (games keyed by league and teams;
 *  autoCheck then holds them to the same date). Pure. */
export function structuredTwins(poly: readonly VMarket[], kalshi: readonly VMarket[]) {
  const key = (g: { league: string; teams: string[] }) => `${g.league}|${g.teams.join("-")}`;
  const kBy = new Map<string, VMarket[]>();
  for (const k of kalshi) { const g = kalshiGame(k.eventId); if (g) { const l = kBy.get(key(g)) ?? []; l.push(k); kBy.set(key(g), l); } }
  const pBy = new Map<string, VMarket[]>();
  for (const p of poly) { const g = polyGame(p.ids?.eventSlug); if (g) { const l = pBy.get(key(g)) ?? []; l.push(p); pBy.set(key(g), l); } }
  return [...pBy].flatMap(([k, ps]) => pairByStructure(ps, kBy.get(k) ?? []));
}
