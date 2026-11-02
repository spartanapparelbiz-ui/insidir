/* What a market shows as imagery (pure). Nothing is hotlinked: logos are vendored SVGs (public/logos), portraits are
 * vendored public-domain files (public/people, scripts/people-sync.ts). Anything without a file is drawn: a monogram
 * or a line icon (components/sky/Art.tsx), so no image can break.
 *   teams     a game: both teams' logos (lib/logos.ts matchupOf), with their names for the fallback
 *   people    the members of Congress a market names, with their portrait and party
 *   parties   a party market (Senate control, a state's Senate race, Democrats vs. Republicans): D and R rings
 *   logo      a league or brand the market is about (vendored logo)
 *   icon      everything else: the category's line icon */
import { brandOf, leagueLogo, matchupOf } from "@/lib/logos";
import { peopleIn, type PersonRow } from "./people-match";
import peopleJson from "@/public/people/people.json";

export type IconName = "capitol" | "ballot" | "chart" | "bank" | "globe" | "spark" | "trophy";
export type Party = "D" | "R" | "I";
export interface Person { name: string; party: Party | null; src: string | null }
export type Art =
  | { kind: "teams"; teams: Array<{ name: string; src: string }> }
  | { kind: "people"; people: Person[] }
  | { kind: "parties"; parties: Party[] }
  | { kind: "logo"; name: string; src: string }
  | { kind: "icon"; name: string; icon: IconName };

const PEOPLE = peopleJson as PersonRow[];
const LEAGUE_IDS: Array<[RegExp, string]> = [[/^nfl$/i, "nfl"], [/^nba$/i, "nba"], [/^mlb$/i, "mlb"], [/^nhl$/i, "nhl"], [/college football|ncaaf|cfb/i, "cfb"], [/la liga/i, "laliga"],
  [/premier league|epl/i, "epl"], [/serie a/i, "seriea"], [/bundesliga/i, "bundesliga"], [/ligue 1/i, "ligue1"], [/champions league|ucl/i, "ucl"], [/ufc/i, "ufc"], [/f1|formula 1/i, "f1"]];
const PARTY_WORDS = /\b(democrats?|republicans?|democratic|gop|party|senate control|house control|control of the (senate|house))\b/i;
const STATE_RACE = /\b(senate|house|governor)\b/i;

/** A team's name from its logo path (".../nfl/KC.svg" → "KC"), for the monogram if the file ever fails. */
const teamName = (src: string, title: string, i: number): string => {
  const parts = title.replace(/^[^:]*:\s*/, "").split(/\s+(?:vs\.?|v\.?|at|@)\s+/i);
  return (parts[i] ?? src.split("/").pop()!.replace(/\.svg$/, "")).replace(/\?.*$/, "").trim();
};

export function artFor(m: { tab: string | null; league: string | null; title: string; event: string | null; cat: string | null; yesLabel?: string; noLabel?: string }): Art {
  const text = `${m.event ?? ""} ${m.title} ${m.yesLabel ?? ""} ${m.noLabel ?? ""}`;
  const pair = matchupOf({ tab: m.tab ?? "", league: m.league, marketTitle: m.title, eventTitle: m.event });
  if (pair) return { kind: "teams", teams: pair.map((src, i) => ({ src, name: teamName(src, m.title, i) })) };
  const people = peopleIn(text, PEOPLE).slice(0, 2);
  if (people.length) return { kind: "people", people: people.map(p => ({ name: p.name, party: p.party, src: `/people/${p.bioguide}.jpg` })) };
  if (m.cat === "elections" && (PARTY_WORDS.test(text) || STATE_RACE.test(text))) return { kind: "parties", parties: ["D", "R"] };
  const brand = brandOf(text);
  if (brand) return { kind: "logo", name: brandName(brand), src: brand };
  if (m.tab === "sports" && m.league) for (const [re, id] of LEAGUE_IDS) if (re.test(m.league)) { const src = leagueLogo(id); if (src) return { kind: "logo", name: m.league, src }; }
  if (/(^|[^a-z])(fed|fomc|powell)([^a-z]|$)|federal reserve|interest rate/i.test(text)) return { kind: "icon", name: "The Fed", icon: "bank" };
  const icon: IconName = m.cat === "elections" ? "ballot" : m.cat === "economy" ? "chart" : m.cat === "world" ? "globe" : m.cat === "sports" ? "trophy" : "spark";
  return { kind: "icon", name: m.cat ?? "market", icon };
}

const brandName = (src: string) => { const f = src.split("/").pop()!.replace(/\.(svg|webp|png)$/, ""); return f.charAt(0).toUpperCase() + f.slice(1); };

export { initials } from "./sky-pure";

/** The same art with the side a bet backs first (its badge in the skyline and ticker): the team named in the side
 *  ("Rams", "Chiefs -1.5"), or the party it backs ("Republicans", or YES on "Will Republicans win…"). */
export function sideFirst(art: Art, side: string, title: string): Art {
  const s = side.toLowerCase();
  if (art.kind === "teams") {
    const i = art.teams.findIndex(t => { const last = t.name.toLowerCase().split(/\s+/).pop() ?? ""; return last.length > 1 && s.includes(last); });
    return i > 0 ? { ...art, teams: [art.teams[i]!, ...art.teams.filter((_, j) => j !== i)] } : art;
  }
  if (art.kind === "parties") {
    const named = (t: string): Party | null => (/republican|\bgop\b/i.test(t) ? "R" : /democrat/i.test(t) ? "D" : null);
    let p = named(s);
    if (!p && /^(yes|no)$/.test(s)) { const q = named(title); p = q && s === "no" ? (q === "R" ? "D" : "R") : q; }
    return p ? { ...art, parties: [p, ...art.parties.filter(x => x !== p)] } : art;
  }
  return art;
}
