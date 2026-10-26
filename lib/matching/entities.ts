/* Entity extraction for matching: which teams, people, assets, institutions, places, dates, numbers and
 * thresholds a market is about, what type of market it is (winner, total, spread, threshold, yes/no event), and
 * which outcome its YES side pays on (the "yes subject"), so two venues' markets can be compared and oriented.
 * Pure. */
import type { Strike, VMarket } from "@/lib/types";
import { CONFLICT_GROUPS, FUTURES_WORDS, LEAGUE_HINTS, LEAGUES, OTHER_LEAGUE_HINTS, type League } from "./aliases";
import {
  contentTokens,
  deaccent,
  findAliases,
  findCaseSensitiveAliases,
  normalize,
  normalizePhrase,
  type AliasHit,
  type AliasRef,
  type DateMention,
  type NumberMention,
  type Normalized,
  type TimeMention,
  type Unit,
} from "./normalize";

/** How many characters of the rules are scanned for a league hint ("professional basketball game"). */
const RULES_LEAGUE_SCAN_CHARS = 600;
/** How many characters of the rules are scanned for the event's scheduled date (it is stated early). */
const RULES_DATE_SCAN_CHARS = 800;
/** Max capitalised words in a generic person name ("Alexandria Ocasio Cortez"). */
const MAX_NAME_WORDS = 3;

export type MarketType = "winner" | "total" | "spread" | "threshold" | "event";
export type Direction = "above" | "below" | "between";

export interface Threshold {
  /** "ou" = an over/under line whose side is set by the YES label ("Over"/"Under"). */
  direction: Direction | "ou" | null;
  value: number;
  upper: number | null;
  unit: Unit | null;
  /** True for "at least / or more", false for "above / more than", null when unknown. */
  inclusive: boolean | null;
}

/** What a market's YES (or NO) side pays on. */
export interface Subject {
  /** Entity keys ("team:nba:lal", "person:vance"). */
  ids: string[];
  /** Content tokens of the label ("cut"), for labels that name no entity. */
  text: string[];
  /** "Over"/"Above" vs "Under"/"Below" labels. */
  direction: "above" | "below" | null;
}

export interface Entities {
  /** "nba:lal". */
  teams: string[];
  /** Alias ids ("trump") or a generic surname ("buttigieg"). */
  people: string[];
  assets: string[];
  orgs: string[];
  places: string[];
  league: League | "other" | null;
  /** Dates in the title / event title / YES label. */
  dates: DateMention[];
  /** Full dates (with a day) near the start of the rules ("originally scheduled for Nov 5, 2026"). */
  ruleDates: DateMention[];
  /** Times of day near the start of the rules ("before 5 PM EST"). */
  ruleTimes: TimeMention[];
  years: number[];
  times: TimeMention[];
  /** Quantities that are not thresholds and not counters. */
  numbers: NumberMention[];
  /** Counters ("Week 9" → 9). */
  counters: number[];
  thresholds: Threshold[];
  /** Quoted words ("Will Trump say 'tariff'"). */
  quotes: string[];
  /** Mutually exclusive condition words present (see CONFLICT_GROUPS). */
  conditions: string[];
  /** A season-level market (championship, MVP, playoffs). */
  futures: boolean;
  negated: boolean;
  type: MarketType;
  yesSubject: Subject | null;
  noSubject: Subject | null;
  /** The YES label is a plain "Yes". */
  genericYes: boolean;
  /** Content tokens (title + YES label) for similarity, with entity phrases removed. */
  tokens: string[];
  /** The title's normalised tokens in order (for "is the label's team before the win verb"). */
  titleTokens: string[];
}

export type MatchInput = Pick<VMarket, "title" | "eventTitle" | "yesLabel" | "noLabel" | "category" | "seriesId" | "closeTime" | "strike" | "rules">;

const GENERIC_LABEL_RE = /^\s*(yes|no|y|n|true|false)?\s*$/i;
export function isGenericLabel(s: string | null | undefined): boolean {
  return s === null || s === undefined || GENERIC_LABEL_RE.test(s);
}

/** Capitalised words that never start or belong to a person's name. */
const NON_NAME_WORDS: ReadonlySet<string> = new Set([
  "will", "the", "who", "what", "which", "how", "does", "is", "can", "did", "should", "when", "where", "why", "in",
  "on", "at", "by", "for", "and", "or", "of", "before", "after", "a", "an", "if", "to", "be", "yes", "no",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
  "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "monday",
  "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "election", "elections", "presidential",
  "president", "party", "democratic", "democrat", "republican", "senate", "house", "court", "cup", "bowl", "series",
  "league", "championship", "finals", "final", "open", "award", "awards", "prize", "prix", "grand", "super", "world",
  "national", "federal", "reserve", "united", "states", "city", "county", "state", "university", "college", "day",
  "week", "game", "match", "price", "rate", "rates", "index", "total", "points", "spread", "winner", "win", "over",
  "under", "above", "below", "governor", "mayor", "primary", "nomination", "nominee", "cabinet", "secretary",
  "speaker", "congress", "senator", "representative", "minister", "prime", "chair", "chairman", "ceo", "best",
  "album", "song", "movie", "film", "show", "tour", "box", "office", "global", "box", "temperature", "high", "low",
  "nfl", "nba", "mlb", "nhl", "wnba", "ncaa", "afc", "nfc", "mvp", "the", "most", "first", "next", "new", "north",
  "south", "east", "west", "central", "republic", "kingdom", "union", "european", "american", "america", "time",
  "person", "year", "trophy", "medal", "olympics", "olympic", "gold", "silver", "bronze", "tie", "draw", "none",
  "other", "another", "someone", "nobody", "neither", "both", "either",
]);

/** Categories where a one-word YES label is usually a surname. */
const SURNAME_LABEL_CATEGORIES: ReadonlySet<string> = new Set(["politics", "geopolitics", "culture", "mentions"]);

export const WIN_VERBS: ReadonlySet<string> = new Set(["win", "beat", "defeat", "nomination", "elected", "champion"]);

const DIR_BEFORE: ReadonlyArray<readonly [readonly string[], "above" | "below", boolean]> = [
  [["at", "least"], "above", true],
  [["more", "than"], "above", false],
  [["greater", "than"], "above", false],
  [["higher", "than"], "above", false],
  [["above"], "above", false],
  [["over"], "above", false],
  [["exceed"], "above", false],
  [["exceeds"], "above", false],
  [["exceeding"], "above", false],
  [["reach"], "above", true],
  [["reaches"], "above", true],
  [["hit"], "above", true],
  [["hits"], "above", true],
  [["at", "most"], "below", true],
  [["less", "than"], "below", false],
  [["fewer", "than"], "below", false],
  [["lower", "than"], "below", false],
  [["below"], "below", false],
  [["under"], "below", false],
];
const DIR_AFTER: ReadonlyArray<readonly [readonly string[], "above" | "below", boolean]> = [
  [["or", "more"], "above", true],
  [["or", "higher"], "above", true],
  [["or", "above"], "above", true],
  [["or", "greater"], "above", true],
  [["and", "above"], "above", true],
  [["or", "over"], "above", true],
  [["plus"], "above", true],
  [["or", "less"], "below", true],
  [["or", "lower"], "below", true],
  [["or", "below"], "below", true],
  [["or", "fewer"], "below", true],
  [["and", "below"], "below", true],
  [["or", "under"], "below", true],
];

function endsWith(tokens: readonly string[], end: number, seq: readonly string[]): boolean {
  if (end - seq.length < 0) return false;
  return seq.every((w, i) => tokens[end - seq.length + i] === w);
}
function startsAt(tokens: readonly string[], start: number, seq: readonly string[]): boolean {
  return seq.every((w, i) => tokens[start + i] === w);
}

interface ParsedNumbers {
  thresholds: Threshold[];
  numbers: NumberMention[];
  counters: number[];
}

/** Thresholds (numbers with a direction) and plain quantities in a normalised text. */
export function parseNumbers(n: Normalized): ParsedNumbers {
  const thresholds: Threshold[] = [];
  const numbers: NumberMention[] = [];
  const counters: number[] = [];
  const used = new Set<number>();
  const numAt = (i: number): number | null => {
    const t = n.tokens[i];
    const m = t ? /^#n(\d+)$/.exec(t) : null;
    return m ? Number(m[1]) : null;
  };
  for (let i = 0; i < n.tokens.length; i++) {
    const idx = numAt(i);
    if (idx === null || used.has(idx)) continue;
    const mention = n.numbers[idx];
    if (!mention) continue;
    if (mention.counter) {
      counters.push(mention.value);
      used.add(idx);
      continue;
    }
    // Ranges: "between X and Y", "X to Y", "X-Y" (the dash is gone, so "X Y").
    const pairs: Array<[number, number]> = [];
    if (n.tokens[i - 1] === "between" && n.tokens[i + 1] === "and") pairs.push([i, i + 2]);
    if (n.tokens[i + 1] === "to") pairs.push([i, i + 2]);
    pairs.push([i, i + 1]);
    let ranged = false;
    for (const [, j] of pairs) {
      const jdx = numAt(j);
      const other = jdx === null ? undefined : n.numbers[jdx];
      if (jdx === null || !other || other.counter) continue;
      if (other.value > mention.value && (mention.unit === other.unit || mention.unit === null || other.unit === null)) {
        thresholds.push({ direction: "between", value: mention.value, upper: other.value, unit: mention.unit ?? other.unit, inclusive: null });
        used.add(idx);
        used.add(jdx);
        ranged = true;
        break;
      }
    }
    if (ranged) continue;
    let dir: "above" | "below" | "ou" | null = null;
    let inclusive: boolean | null = null;
    for (const [seq, d, inc] of DIR_BEFORE) {
      if (endsWith(n.tokens, i, seq) || (n.tokens[i - 1] === "be" && endsWith(n.tokens, i - 1, seq))) {
        dir = d;
        inclusive = inc;
        break;
      }
    }
    if (!dir) {
      for (const [seq, d, inc] of DIR_AFTER) {
        if (startsAt(n.tokens, i + 1, seq)) {
          dir = d;
          inclusive = inc;
          break;
        }
      }
    }
    if (!dir && n.tokens[i - 1] === "ou") dir = "ou";
    used.add(idx);
    if (dir) thresholds.push({ direction: dir, value: mention.value, upper: null, unit: mention.unit, inclusive });
    else numbers.push(mention);
  }
  return { thresholds, numbers, counters };
}

/** Two numbers are the same strike: within a cent (Kalshi writes "$100,000 or above" as "above 99,999.99"). */
export const NUMBER_EQ_ABS = 0.011;
export function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(NUMBER_EQ_ABS, Math.abs(a) * 1e-9);
}

// Normalised once: hint phrases and futures words, padded for whole-word `includes` checks.
const pad = (h: string) => ` ${normalizePhrase(h)} `;
const OTHER_HINTS_N = OTHER_LEAGUE_HINTS.map(pad);
const LEAGUE_HINTS_N: ReadonlyArray<readonly [League, readonly string[]]> = LEAGUES.map(l => [l, LEAGUE_HINTS[l].map(pad)] as const);
const FUTURES_N = FUTURES_WORDS.map(pad);
const CONFLICT_WORDS = CONFLICT_GROUPS.flat();

function detectLeague(m: MatchInput): League | "other" | null {
  const series = (m.seriesId ?? "").toUpperCase();
  if (/WNBA|NCAA|CFB|CBB|MLS|EPL|UCL|UFC|ATP|WTA|PGA|NASCAR|F1/.test(series)) return "other";
  for (const l of LEAGUES) if (series.includes(l.toUpperCase())) return l;
  const texts = [
    `${m.title} ${m.eventTitle ?? ""} ${m.yesLabel}`,
    (m.rules ?? "").slice(0, RULES_LEAGUE_SCAN_CHARS),
  ];
  for (const t of texts) {
    const p = ` ${normalizePhrase(t)} `;
    if (OTHER_HINTS_N.some(h => p.includes(h))) return "other";
    const found = LEAGUE_HINTS_N.filter(([, hs]) => hs.some(h => p.includes(h)));
    if (found.length === 1) return found[0]?.[0] ?? null;
  }
  return null;
}

interface ResolvedHit {
  start: number;
  end: number;
  /** Which text the hit came from. */
  source: "title" | "event" | "yes" | "no";
  team: string | null;
  others: AliasRef[];
}

/** Turns alias hits into teams (with league resolution) and other entities. */
function resolveHits(
  raw: Array<{ source: ResolvedHit["source"]; hit: AliasHit | { start: number; end: number; refs: AliasRef[] } }>,
  hintLeague: League | "other" | null,
  sportsCategory: boolean,
): { hits: ResolvedHit[]; league: League | "other" | null } {
  const nickHits = raw.filter(({ hit }) => hit.refs.some(r => r.kind === "team" && r.strength !== "city" && r.strength !== "abbr")).length;
  // A sports context comes from the category, a league named in the text, or two team nicknames ("Bills vs Jets");
  // one nickname alone ("Senators", "Heat", "Magic") is too often an ordinary word.
  const sports = sportsCategory || (hintLeague !== null && hintLeague !== "other") || nickHits >= 2;
  // League votes from unambiguous full/nick hits.
  let league = hintLeague;
  if (league === null) {
    const votes = new Map<League, number>();
    for (const { hit } of raw) {
      const leagues = new Set(hit.refs.filter(r => r.kind === "team" && (r.strength === "full" || r.strength === "nick")).map(r => r.league));
      if (leagues.size === 1) {
        const l = [...leagues][0];
        if (l) votes.set(l, (votes.get(l) ?? 0) + 1);
      }
    }
    let best: League | null = null;
    let bestVotes = 0;
    for (const [l, v] of votes) if (v > bestVotes) [best, bestVotes] = [l, v];
    league = best;
  }
  const hits: ResolvedHit[] = [];
  for (const { source, hit } of raw) {
    const teamRefs = hit.refs.filter(r => r.kind === "team");
    const others = hit.refs.filter(r => r.kind !== "team");
    let team: string | null = null;
    if (teamRefs.length && sports && league !== "other") {
      const inLeague = league ? teamRefs.filter(r => r.league === league) : teamRefs.filter(r => r.strength === "full" || r.strength === "nick");
      const ids = [...new Set(inLeague.map(r => r.id))];
      if (ids.length === 1) team = ids[0] ?? null;
    }
    // A city that became a team is not also a place.
    hits.push({ start: hit.start, end: hit.end, source, team, others: team ? others.filter(r => r.kind !== "place") : others });
  }
  return { hits, league: sports ? league : hintLeague };
}

/** Generic "Firstname Lastname" sequences in raw text → surnames. Skips spans that are aliases. */
export function genericNames(raw: string): string[] {
  const words = deaccent(raw).split(/[^A-Za-z.'-]+/).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    while (run.length && NON_NAME_WORDS.has(run[0]!.toLowerCase().replace(/[.'-]/g, ""))) run.shift();
    if (run.length >= 2 && run.length <= MAX_NAME_WORDS && !run.some(w => NON_NAME_WORDS.has(w.toLowerCase().replace(/[.']/g, "")))) {
      const phrase = normalizePhrase(run.join(" "));
      const toks = phrase.split(" ");
      if (findAliases(toks).length === 0) {
        const last = toks[toks.length - 1];
        if (last && last.length >= 2) out.push(last);
      }
    }
    run = [];
  };
  for (const w0 of words) {
    const initials = /^(?:[A-Z]\.){1,2}$/.test(w0);
    const w = w0.replace(/'s$/, "").replace(/[.'-]+$/, "");
    if (initials || /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*$/.test(w)) run.push(initials ? w0 : w);
    else flush();
  }
  flush();
  return [...new Set(out)];
}

function quotes(raw: string): string[] {
  const out: string[] = [];
  const s = deaccent(raw);
  for (const m of s.matchAll(/"([^"]{2,60})"/g)) if (m[1]) out.push(normalizePhrase(m[1]));
  for (const m of s.matchAll(/(?:^|[\s(])'([^']{2,40})'(?=[\s?.,!)]|$)/g)) if (m[1]) out.push(normalizePhrase(m[1]));
  return [...new Set(out.filter(Boolean))];
}

function labelDirection(label: string): "above" | "below" | null {
  const l = normalizePhrase(label);
  if (/^(over|above|more|higher|at least)\b/.test(l) || /\b(or more|or higher|or above|and above|plus)$/.test(l)) return "above";
  if (/^(under|below|less|lower|fewer|at most)\b/.test(l) || /\b(or less|or lower|or below|and below|or fewer)$/.test(l)) return "below";
  return null;
}

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** Extracts every entity a matcher needs from one market. */
export function extractEntities(m: MatchInput): Entities {
  const ref = m.closeTime;
  const title = normalize(m.title, { refTime: ref });
  const event = m.eventTitle && m.eventTitle.trim() !== m.title.trim() ? normalize(m.eventTitle, { refTime: ref }) : null;
  const genericYes = isGenericLabel(m.yesLabel);
  // Kalshi often repeats the YES label as the NO label; that names nothing about the NO side.
  const genericNo = isGenericLabel(m.noLabel) || normalizePhrase(m.noLabel) === normalizePhrase(m.yesLabel);
  const yes = genericYes ? null : normalize(m.yesLabel, { refTime: ref });
  const no = genericNo ? null : normalize(m.noLabel, { refTime: ref });

  const raw: Array<{ source: ResolvedHit["source"]; hit: AliasHit | { start: number; end: number; refs: AliasRef[] } }> = [];
  const add = (source: ResolvedHit["source"], n: Normalized | null, rawText: string | null) => {
    if (!n || rawText === null) return;
    for (const hit of findAliases(n.tokens)) raw.push({ source, hit });
    for (const cs of findCaseSensitiveAliases(rawText)) raw.push({ source, hit: { start: -1, end: -1, refs: cs.refs } });
  };
  add("title", title, m.title);
  add("event", event, m.eventTitle);
  add("yes", yes, genericYes ? null : m.yesLabel);
  add("no", no, genericNo ? null : m.noLabel);

  const { hits, league } = resolveHits(raw, detectLeague(m), m.category.toLowerCase() === "sports");
  const teams = uniq(hits.flatMap(h => (h.team ? [h.team] : [])));
  const of = (kind: AliasRef["kind"]) => uniq(hits.flatMap(h => h.others.filter(r => r.kind === kind).map(r => r.id)));
  const aliasPeople = of("person");
  const namesFrom = (s: string | null) => (s ? genericNames(s) : []);
  const titleNames = namesFrom(m.title);
  const yesNames = genericYes ? [] : namesFrom(m.yesLabel);
  // A one-word surname label in a politics-like market ("Beshear") names a person.
  if (!genericYes && yesNames.length === 0 && SURNAME_LABEL_CATEGORIES.has(m.category.toLowerCase())) {
    const w = m.yesLabel.trim();
    const l = normalizePhrase(w);
    if (/^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*$/.test(w) && !NON_NAME_WORDS.has(l) && !CONFLICT_WORDS.includes(l) && !findAliases([l]).length) yesNames.push(l);
  }
  const noNames = genericNo ? [] : namesFrom(m.noLabel);
  const people = uniq([...aliasPeople, ...titleNames, ...yesNames, ...namesFrom(m.eventTitle)]);
  const assets = of("asset");
  const orgs = of("org");
  const places = of("place");
  const words = of("word");

  // Numbers: title + YES label (+ the venue's structured strike).
  const pt = parseNumbers(title);
  const py = yes ? parseNumbers(yes) : { thresholds: [], numbers: [], counters: [] };
  let thresholds = [...pt.thresholds, ...py.thresholds];
  const labelDir = genericYes ? null : labelDirection(m.yesLabel);
  thresholds = thresholds.map(t => (t.direction === "ou" && labelDir ? { ...t, direction: labelDir } : t));
  // A bare number in the YES label of a threshold-shaped market ("Above $100,000" handled above; "100,000" alone).
  if (m.strike) thresholds = mergeStrike(thresholds, m.strike);
  let numbers = [...pt.numbers, ...py.numbers].filter(x => !thresholds.some(t => sameNumber(t.value, x.value) || (t.upper !== null && sameNumber(t.upper, x.value))));
  numbers = dedupeNumbers(numbers);

  const allTokens = [...title.tokens, ...(yes?.tokens ?? []), ...(event?.tokens ?? [])];
  const tokenSet = new Set([...allTokens, ...words, ...orgs]);
  const conditions = uniq(CONFLICT_WORDS.filter(w => tokenSet.has(w)));
  const phraseAll = ` ${normalizePhrase(`${m.title} ${m.eventTitle ?? ""}`)} `;
  const futures = FUTURES_N.some(w => phraseAll.includes(w));
  const negated = title.tokens.includes("not") || /\bwon'?t\b|\bfails? to\b/i.test(m.title);

  const titleTypeTokens = new Set([...title.tokens, ...(yes?.tokens ?? [])]);
  const type = marketType(titleTypeTokens, thresholds, numbers, teams.length, m, labelDir);
  if (type === "spread") {
    // "Lakers (-5.5)": the favourite covers by more than the line.
    for (const x of numbers.splice(0)) {
      if (x.sign === "-") thresholds.push({ direction: "above", value: x.value, upper: null, unit: x.unit, inclusive: false });
      else numbers.push(x);
    }
  }

  // Subjects.
  const subjectFrom = (source: "yes" | "no", n: Normalized | null, label: string, names: string[]): Subject | null => {
    if (!n) return null;
    const ids = uniq([
      ...hits.filter(h => h.source === source && h.team).map(h => `team:${h.team}`),
      ...hits.filter(h => h.source === source).flatMap(h => h.others.filter(r => r.kind === "person").map(r => `person:${r.id}`)),
      ...names.map(x => `person:${x}`),
    ]);
    return { ids, text: contentTokens(stripSpans(n.tokens, hits.filter(h => h.source === source))), direction: labelDirection(label) };
  };
  let yesSubject = subjectFrom("yes", yes, m.yesLabel, yesNames);
  const noSubject = subjectFrom("no", no, m.noLabel, noNames);
  if (!yesSubject) yesSubject = titleSubject(title, hits.filter(h => h.source === "title"), titleNames);

  const titleHits = hits.filter(h => h.source === "title");
  const yesHits = hits.filter(h => h.source === "yes");
  const nameWords = new Set([...titleNames, ...yesNames]);
  const tokens = uniq([
    ...contentTokens(stripSpans(title.tokens, titleHits)),
    ...(yes ? contentTokens(stripSpans(yes.tokens, yesHits)) : []),
    ...[...pt.counters, ...py.counters].map(c => `ctr${c}`),
  ]).filter(t => !nameWords.has(t));

  const dates = dedupeDates([...title.dates, ...(event?.dates ?? []), ...(yes?.dates ?? [])]);
  const rulesHead = normalize((m.rules ?? "").slice(0, RULES_DATE_SCAN_CHARS), { refTime: ref });
  const years = uniq([...title.years, ...(event?.years ?? []), ...(yes?.years ?? [])]);
  return {
    teams,
    people,
    assets,
    orgs,
    places,
    league,
    dates,
    ruleDates: dedupeDates(rulesHead.dates.filter(d => d.day !== null)),
    ruleTimes: rulesHead.times,
    years,
    times: [...title.times, ...(yes?.times ?? [])],
    numbers,
    counters: uniq([...pt.counters, ...py.counters]),
    thresholds: dedupeThresholds(thresholds),
    quotes: quotes(m.title),
    conditions,
    futures,
    negated,
    type,
    yesSubject,
    noSubject,
    genericYes,
    tokens,
    titleTokens: title.tokens,
  };
}

function stripSpans(tokens: readonly string[], hits: readonly ResolvedHit[]): string[] {
  const drop = new Set<number>();
  for (const h of hits) if (h.start >= 0 && (h.team || h.others.length)) for (let i = h.start; i < h.end; i++) drop.add(i);
  return tokens.filter((_, i) => !drop.has(i));
}

/** "Will the Lakers beat the Celtics?" → the entity just before the first win verb. */
function titleSubject(title: Normalized, hits: readonly ResolvedHit[], names: string[]): Subject | null {
  const verb = title.tokens.findIndex(t => WIN_VERBS.has(t));
  if (verb < 0) return null;
  const before = hits.filter(h => h.start >= 0 && h.end <= verb && (h.team || h.others.some(r => r.kind === "person")));
  const last = before[before.length - 1];
  if (last) {
    const ids = last.team ? [`team:${last.team}`] : last.others.filter(r => r.kind === "person").map(r => `person:${r.id}`);
    return { ids, text: [], direction: null };
  }
  // A generic name right before the verb ("Will Gavin Smith win").
  const prev = title.tokens.slice(0, verb);
  const name = [...names].reverse().find(n => prev.includes(n));
  return name ? { ids: [`person:${name}`], text: [], direction: null } : null;
}

function marketType(
  tokens: ReadonlySet<string>,
  thresholds: readonly Threshold[],
  numbers: readonly NumberMention[],
  teamCount: number,
  m: MatchInput,
  labelDir: "above" | "below" | null,
): MarketType {
  const has = (w: string) => tokens.has(w);
  const labels = `${normalizePhrase(m.yesLabel)} ${normalizePhrase(m.noLabel)}`;
  if (has("ou") || has("total") || has("totals") || has("combined") || (teamCount >= 1 && labelDir !== null && /\b(over|under)\b/.test(labels)))
    return "total";
  const titleNorm = ` ${normalizePhrase(m.title)} `;
  if (has("spread") || has("cover") || has("covers") || has("handicap") || titleNorm.includes(" win by ") || (teamCount >= 1 && numbers.some(n => n.sign !== null)))
    return "spread";
  if (m.strike || thresholds.some(t => t.direction !== null && t.direction !== "ou")) return "threshold";
  if ([...WIN_VERBS].some(has) || (teamCount >= 2 && has("vs"))) return "winner";
  return "event";
}

function mergeStrike(text: Threshold[], strike: Strike): Threshold[] {
  const match = text.find(t => sameNumber(t.value, strike.value));
  const fromStrike: Threshold = {
    direction: strike.kind,
    value: strike.value,
    upper: strike.upper,
    unit: match?.unit ?? null,
    inclusive: match && match.direction === strike.kind ? match.inclusive : null,
  };
  return [fromStrike, ...text.filter(t => !sameNumber(t.value, strike.value) && !(strike.upper !== null && sameNumber(t.value, strike.upper)))];
}

function dedupeThresholds(ts: Threshold[]): Threshold[] {
  const out: Threshold[] = [];
  for (const t of ts) if (!out.some(o => sameNumber(o.value, t.value) && o.direction === t.direction && (o.upper ?? -1) === (t.upper ?? -1))) out.push(t);
  return out;
}
function dedupeNumbers(ns: NumberMention[]): NumberMention[] {
  const out: NumberMention[] = [];
  for (const n of ns) if (!out.some(o => sameNumber(o.value, n.value))) out.push(n);
  return out;
}
function dedupeDates(ds: DateMention[]): DateMention[] {
  const out: DateMention[] = [];
  for (const d of ds) if (!out.some(o => o.key === d.key)) out.push(d);
  return out;
}

/** Two date mentions can be the same day (a missing year or day is a wildcard). */
export function compatibleDates(a: DateMention, b: DateMention): boolean {
  if (a.month !== b.month) return false;
  if (a.year !== null && b.year !== null && a.year !== b.year) return false;
  if (a.day !== null && b.day !== null && a.day !== b.day) return false;
  return true;
}

/** Entity keys with weights, for blocking and weighted overlap. */
export const ENTITY_WEIGHTS = { team: 3, person: 3, asset: 3, org: 2, place: 2, year: 1, date: 2 } as const;

export function entityKeys(e: Entities): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of e.teams) out.set(`team:${t}`, ENTITY_WEIGHTS.team);
  for (const p of e.people) out.set(`person:${p}`, ENTITY_WEIGHTS.person);
  for (const a of e.assets) out.set(`asset:${a}`, ENTITY_WEIGHTS.asset);
  for (const o of e.orgs) out.set(`org:${o}`, ENTITY_WEIGHTS.org);
  for (const p of e.places) out.set(`place:${p}`, ENTITY_WEIGHTS.place);
  for (const y of e.years) out.set(`year:${y}`, ENTITY_WEIGHTS.year);
  for (const d of e.dates) if (d.day !== null) out.set(`date:${d.month}-${d.day}`, ENTITY_WEIGHTS.date);
  return out;
}
