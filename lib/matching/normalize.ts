/* Text normalisation for matching. Turns a venue's title into a token stream where dates, times, years and
 * numbers are parsed into structured mentions (and replaced by placeholder tokens "#d0", "#t0", "#y2026", "#n0"),
 * so "Nov 5", "11/5" and "November 5th, 2026" compare equal, "$100k", "100,000" and "100K" compare equal, and
 * "vs", "v.", "@" and "versus" are one token. Also finds alias phrases (teams, people, assets, orgs, places).
 * Pure: the only "clock" is the optional reference time used to infer a missing year. */
import {
  ASSETS,
  CASE_SENSITIVE_ALIASES,
  LEAGUES,
  ORGS,
  PEOPLE,
  PLACES,
  PROTECTED_PHRASES,
  TEAMS,
  WORD_MAP,
  type League,
} from "./aliases";

/** Function words dropped before token similarity. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "will", "the", "a", "an", "be", "by", "of", "in", "on", "at", "to", "for", "is", "are", "was", "were", "does",
  "do", "did", "this", "that", "these", "those", "it", "its", "as", "with", "from", "and", "has", "have", "had",
  "any", "who", "what", "which", "when", "where", "how", "there", "their", "his", "her", "he", "she", "they",
  "after", "before", "s", "market", "markets", "question", "contract", "today", "tomorrow", "yes", "no", "end",
  "get", "next", "us", "we", "i", "you", "our", "if", "then", "else", "into", "out", "up", "down", "per", "via",
  "et", "edt", "est", "pt", "ct", "utc", "gmt", "am", "pm", "time", "close", "closing", "price", "official",
]);

/** Words that describe the market type or a direction. Compared separately (type, thresholds), so they are left
 *  out of token similarity. */
export const TYPE_WORDS: ReadonlySet<string> = new Set([
  "win", "beat", "defeat", "vs", "over", "under", "ou", "total", "totals", "spread", "cover", "covers", "above",
  "below", "between", "more", "less", "fewer", "than", "least", "most", "higher", "greater", "exceed", "exceeds",
  "reach", "reaches", "hit", "hits", "or", "game", "match", "matchup", "points", "moneyline", "deg", "f", "c",
  "pct", "bps", "percent", "usd", "be", "not",
]);

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
/** Full month names that may stand alone ("the December meeting"); May and March are also common words. */
const LONE_MONTH_RE = /\b(January|February|April|June|July|August|September|October|November|December)\b(?!\s*\d)/g;

/** Words before a number that make it a counter ("Week 9"), not a quantity to compare. */
const COUNTER_WORDS_RE = /\b(week|round|matchday|gameweek|stage|leg|episode|season|chapter|wave|phase|day)\s*$/i;

export interface DateMention {
  year: number | null;
  month: number;
  day: number | null;
  /** "2026-11-05", "2026-11", "*-11-05" or "*-11". */
  key: string;
}

export interface TimeMention {
  /** Minutes after midnight in the stated timezone. */
  minutes: number;
  /** Normalised timezone ("ET", "CT", "MT", "PT", "UTC") or null when not stated. */
  tz: string | null;
  /** Minutes after midnight UTC when the timezone is known (ET treated as UTC−5 for comparison). */
  utcMinutes: number | null;
}

export type Unit = "usd" | "pct" | "deg" | "count";

export interface NumberMention {
  value: number;
  unit: Unit | null;
  /** An explicit leading sign ("-5.5" in a spread). */
  sign: "+" | "-" | null;
  /** A counter ("Week 9", "Game 7"): kept as a token, not compared as a quantity. */
  counter: boolean;
  raw: string;
}

export interface Normalized {
  /** Lower-case tokens in order. Placeholders: "#d<i>" date, "#t<i>" time, "#n<i>" number, "#y<yyyy>" year. */
  tokens: string[];
  dates: DateMention[];
  times: TimeMention[];
  numbers: NumberMention[];
  years: number[];
}

/** Strips accents and unifies quotes and dashes. */
export function deaccent(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-");
}

/** Normalises an alias phrase or a short label the same way as `normalize` does for words: lower case,
 *  punctuation to spaces, word map applied. Digits are kept as they are. */
export function normalizePhrase(s: string): string {
  let t = deaccent(s);
  for (const [re, rep] of PROTECTED_PHRASES) t = t.replace(re, rep);
  return t
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => WORD_MAP[w] ?? w)
    .join(" ");
}

function dateKey(year: number | null, month: number, day: number | null): string {
  const y = year === null ? "*" : String(year);
  const m = String(month).padStart(2, "0");
  return day === null ? `${y}-${m}` : `${y}-${m}-${String(day).padStart(2, "0")}`;
}

/** The year that puts month/day closest to the reference time. */
function inferYear(month: number, day: number | null, refTime: number | null | undefined): number | null {
  if (refTime === null || refTime === undefined || !Number.isFinite(refTime)) return null;
  const refYear = new Date(refTime).getUTCFullYear();
  let best: number | null = null;
  let bestGap = Infinity;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const gap = Math.abs(Date.UTC(y, month - 1, day ?? 15) - refTime);
    if (gap < bestGap) {
      bestGap = gap;
      best = y;
    }
  }
  return best;
}

function validDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

const TZ_OFFSETS: Readonly<Record<string, number>> = { ET: -5, CT: -6, MT: -7, PT: -8, UTC: 0 };
function normTz(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.toUpperCase();
  if (/^(ET|EST|EDT|EASTERN)$/.test(t)) return "ET";
  if (/^(CT|CST|CDT|CENTRAL)$/.test(t)) return "CT";
  if (/^(MT|MST|MDT|MOUNTAIN)$/.test(t)) return "MT";
  if (/^(PT|PST|PDT|PACIFIC)$/.test(t)) return "PT";
  if (/^(UTC|GMT|Z)$/.test(t)) return "UTC";
  return null;
}
function timeMention(h: number, m: number, ampm: string | undefined, tzRaw: string | undefined): TimeMention | null {
  let hour = h;
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (hour > 23 || m > 59) return null;
  const minutes = hour * 60 + m;
  const tz = normTz(tzRaw);
  const off = tz === null ? undefined : TZ_OFFSETS[tz];
  const utcMinutes = off === undefined ? null : (((minutes - off * 60) % 1440) + 1440) % 1440;
  return { minutes, tz, utcMinutes };
}

const TZ_RE = "(ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|GMT|Eastern|Central|Mountain|Pacific)";
const TIME_RES: readonly RegExp[] = [
  new RegExp(String.raw`\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?(?:\s*(?:\(|in the\s+)?${TZ_RE}\b(?:\s*timezone)?\)?)?`, "gi"),
  new RegExp(String.raw`\b(\d{1,2}):(\d{2})\b()(?:\s*(?:\(|in the\s+)?${TZ_RE}\b(?:\s*timezone)?\)?)?`, "gi"),
  new RegExp(String.raw`\b(noon|midnight)()()(?:\s*(?:\(|in the\s+)?${TZ_RE}\b(?:\s*timezone)?\)?)?`, "gi"),
];

/** Times of day in a text ("5pm EDT", "11:59 PM ET", "12:00 in the ET timezone", "noon ET"). */
export function extractTimes(text: string): TimeMention[] {
  return extractTimesWithSpans(deaccent(text)).map(x => x.t);
}

function extractTimesWithSpans(s: string): { t: TimeMention; start: number; end: number }[] {
  const out: { t: TimeMention; start: number; end: number }[] = [];
  const taken: [number, number][] = [];
  for (const re of TIME_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const word = m[1] ?? "";
      let t: TimeMention | null;
      if (/^noon$/i.test(word)) t = timeMention(12, 0, undefined, m[4]);
      else if (/^midnight$/i.test(word)) t = timeMention(0, 0, undefined, m[4]);
      else t = timeMention(Number(word), m[2] ? Number(m[2]) : 0, m[3] || undefined, m[4]);
      if (!t) continue;
      taken.push([start, end]);
      out.push({ t, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

interface Span<T> {
  start: number;
  end: number;
  value: T;
}

function dateSpans(s: string, refTime: number | null | undefined): Span<DateMention>[] {
  const out: Span<DateMention>[] = [];
  const taken = (a: number, b: number) => out.some(x => a < x.end && b > x.start);
  const push = (start: number, end: number, year: number | null, month: number, day: number | null) => {
    if (taken(start, end)) return;
    const y = year ?? inferYear(month, day, refTime);
    out.push({ start, end, value: { year: y, month, day, key: dateKey(y, month, day) } });
  };
  const run = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) f(m);
  };
  run(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?\b/g, m => {
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (validDay(mo, d)) push(m.index, m.index + m[0].length, Number(m[1]), mo, d);
  });
  run(new RegExp(String.raw`\b${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4})\b)?`, "gi"), m => {
    const mo = MONTHS[(m[1] ?? "").toLowerCase()];
    const d = Number(m[2]);
    if (mo && validDay(mo, d)) push(m.index, m.index + m[0].length, m[3] ? Number(m[3]) : null, mo, d);
  });
  run(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH_RE}\b\.?(?:,?\s*(\d{4})\b)?`, "gi"), m => {
    const mo = MONTHS[(m[2] ?? "").toLowerCase()];
    const d = Number(m[1]);
    if (mo && validDay(mo, d)) push(m.index, m.index + m[0].length, m[3] ? Number(m[3]) : null, mo, d);
  });
  run(new RegExp(String.raw`\b${MONTH_RE}\.?,?\s+(\d{4})\b`, "gi"), m => {
    const mo = MONTHS[(m[1] ?? "").toLowerCase()];
    if (mo) push(m.index, m.index + m[0].length, Number(m[2]), mo, null);
  });
  run(/(?<![\d/.$])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g, m => {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (!validDay(mo, d)) return;
    const yRaw = m[3];
    const y = yRaw === undefined ? null : yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    push(m.index, m.index + m[0].length, y, mo, d);
  });
  run(LONE_MONTH_RE, m => {
    const mo = MONTHS[(m[1] ?? "").toLowerCase()];
    if (mo) push(m.index, m.index + m[0].length, null, mo, null);
  });
  return out.sort((a, b) => a.start - b.start);
}

const MULT: Readonly<Record<string, number>> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, trillion: 1e12,
};
const NUMBER_RE =
  /(?<![\w.])([+-])?(\$|€|£)?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(k|mm|mn|m|bn|b|t|thousand|million|billion|trillion)(?![a-z0-9]))?(?:\s?(%|percent|pct|bps|basis points?|°\s?[fc]?|deg(?:rees?)?(?:\s?[fc](?![a-z]))?|points?|pts|goals?|runs?|yards?|games?|seats?|votes?|touchdowns?))?(?![a-z0-9])/gi;

function unitOf(u: string | undefined, currency: string | undefined): Unit | null {
  if (currency) return "usd";
  if (!u) return null;
  const l = u.toLowerCase();
  if (l === "%" || l === "percent" || l === "pct" || l === "bps" || l.startsWith("basis")) return "pct";
  if (l.startsWith("°") || l.startsWith("deg")) return "deg";
  return "count";
}

/** Normalises a title (or any short text). `refTime` (epoch ms) infers the year of "Nov 5". */
export function normalize(raw: string, opts: { refTime?: number | null } = {}): Normalized {
  let s = deaccent(raw);
  for (const [re, rep] of PROTECTED_PHRASES) s = s.replace(re, rep);
  s = s
    .replace(/\bover\s*\/\s*under\b/gi, " ou ")
    .replace(/\bo\s*\/\s*u\b/gi, " ou ")
    .replace(/\s@\s/g, " vs ")
    .replace(/\bvs?\.(?=\s)/gi, " vs ")
    .replace(/≥|>=/g, " at least ")
    .replace(/≤|<=/g, " at most ")
    .replace(/>/g, " above ")
    .replace(/</g, " below ")
    .replace(/(\d)\s?\+(?![\d])/g, "$1 or more ")
    .replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1");

  const dates: DateMention[] = [];
  const times: TimeMention[] = [];
  const numbers: NumberMention[] = [];
  const years: number[] = [];

  // Dates first (they contain numbers), then times, then numbers and years. Each is replaced by a placeholder.
  const dSpans = dateSpans(s, opts.refTime);
  s = replaceSpans(s, dSpans, (d, i) => {
    dates.push(d);
    if (d.year !== null) years.push(d.year);
    return ` qdate${i}q `;
  });
  const tSpans = extractTimesWithSpans(s).map(x => ({ start: x.start, end: x.end, value: x.t }));
  s = replaceSpans(s, tSpans, (t, i) => {
    times.push(t);
    return ` qtime${i}q `;
  });
  s = s.replace(NUMBER_RE, (match: string, sign: string | undefined, cur: string | undefined, int: string, frac: string | undefined, mult: string | undefined, unit: string | undefined, offset: number) => {
    const base = Number(`${int.replace(/,/g, "")}${frac ?? ""}`);
    if (!Number.isFinite(base)) return match;
    const before = s.slice(0, offset);
    const isYear =
      !cur && !mult && !unit && !frac && !int.includes(",") && !sign && base >= 1900 && base <= 2199 &&
      !/(above|below|over|under|than|least|most|reach|hit|exceed)\s*$/i.test(before);
    if (isYear) {
      years.push(base);
      return ` qyear${base}q `;
    }
    let value = base * (mult ? (MULT[mult.toLowerCase()] ?? 1) : 1);
    const u = unit?.toLowerCase();
    if (u === "bps" || u?.startsWith("basis")) value = value / 100;
    numbers.push({
      value: round9(value),
      unit: unitOf(unit, cur),
      sign: sign === "+" || sign === "-" ? sign : null,
      counter: COUNTER_WORDS_RE.test(before) || /\bgame\s*$/i.test(before),
      raw: match.trim(),
    });
    return ` qnum${numbers.length - 1}q `;
  });

  const tokens = s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => {
      const ph = /^q(date|time|num|year)(\d+)q$/.exec(w);
      if (ph) return `#${ph[1] === "date" ? "d" : ph[1] === "time" ? "t" : ph[1] === "num" ? "n" : "y"}${ph[2]}`;
      return WORD_MAP[w] ?? w;
    });
  return { tokens, dates, times, numbers, years: [...new Set(years)] };
}

function round9(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

function replaceSpans<T>(s: string, spans: Span<T>[], f: (v: T, i: number) => string): string {
  let out = "";
  let pos = 0;
  spans.forEach((sp, i) => {
    out += s.slice(pos, sp.start) + f(sp.value, i);
    pos = sp.end;
  });
  return out + s.slice(pos);
}

/** Tokens that carry content for similarity: no placeholders, stopwords or type words. */
export function contentTokens(tokens: readonly string[]): string[] {
  return tokens.filter(t => !t.startsWith("#") && t.length >= 2 && !STOPWORDS.has(t) && !TYPE_WORDS.has(t));
}

// ---------------------------------------------------------------------------------------------------------------
// Aliases

export type AliasKind = "team" | "person" | "asset" | "org" | "place" | "word";

export interface AliasRef {
  kind: AliasKind;
  /** "nba:lal", "trump", "btc", "fed", "ny". */
  id: string;
  league?: League;
  /** For teams: how the phrase names the team. "city" alone is ambiguous across leagues. */
  strength?: "full" | "nick" | "city" | "abbr";
}

export interface AliasHit {
  /** Token index range [start, end) in `Normalized.tokens`. */
  start: number;
  end: number;
  phrase: string;
  refs: AliasRef[];
}

interface AliasIndex {
  phrases: Map<string, AliasRef[]>;
  maxLen: number;
  caseSensitive: Map<string, AliasRef[]>;
}

let INDEX: AliasIndex | null = null;

function addRef(map: Map<string, AliasRef[]>, phrase: string, ref: AliasRef): void {
  if (!phrase) return;
  const list = map.get(phrase) ?? [];
  if (!list.some(r => r.kind === ref.kind && r.id === ref.id)) list.push(ref);
  map.set(phrase, list);
}

/** Builds (once) the phrase → refs index from aliases.ts. */
export function aliasIndex(): AliasIndex {
  if (INDEX) return INDEX;
  const phrases = new Map<string, AliasRef[]>();
  const caseSensitive = new Map<string, AliasRef[]>();
  for (const league of LEAGUES) {
    const rows = TEAMS[league];
    const cityCount = new Map<string, number>();
    for (const r of rows) cityCount.set(r.city, (cityCount.get(r.city) ?? 0) + 1);
    for (const r of rows) {
      const id = `${league}:${(r.abbr[0] ?? r.name).toLowerCase()}`;
      const team = (strength: AliasRef["strength"]): AliasRef => ({ kind: "team", id, league, strength });
      addRef(phrases, normalizePhrase(`${r.city} ${r.name}`), team("full"));
      addRef(phrases, normalizePhrase(r.name), team("nick"));
      for (const x of r.extra ?? []) addRef(phrases, normalizePhrase(x), team(x.includes(" ") ? "full" : "nick"));
      if ((cityCount.get(r.city) ?? 0) > 1) {
        // Kalshi writes shared cities as "Los Angeles L", "New York Y", "Chicago C".
        addRef(phrases, normalizePhrase(`${r.city} ${r.name.charAt(0)}`), team("full"));
      } else if (r.city !== r.name) {
        addRef(phrases, normalizePhrase(r.city), team("city"));
      }
      for (const a of r.abbr) {
        const list = caseSensitive.get(a) ?? [];
        list.push(team("abbr"));
        caseSensitive.set(a, list);
      }
    }
  }
  const simple: ReadonlyArray<readonly [AliasKind, Readonly<Record<string, readonly string[]>>]> = [
    ["person", PEOPLE],
    ["asset", ASSETS],
    ["org", ORGS],
    ["place", PLACES],
  ];
  for (const [kind, table] of simple) {
    for (const [id, list] of Object.entries(table)) for (const p of list) addRef(phrases, normalizePhrase(p), { kind, id });
  }
  for (const [word, target] of Object.entries(CASE_SENSITIVE_ALIASES)) {
    const [kind, id] = target.split(":") as [AliasKind, string];
    const list = caseSensitive.get(word) ?? [];
    list.push({ kind, id });
    caseSensitive.set(word, list);
  }
  let maxLen = 1;
  for (const p of phrases.keys()) maxLen = Math.max(maxLen, p.split(" ").length);
  INDEX = { phrases, maxLen, caseSensitive };
  return INDEX;
}

/** Alias phrases in a token stream, longest match first, non-overlapping. */
export function findAliases(tokens: readonly string[]): AliasHit[] {
  const idx = aliasIndex();
  const hits: AliasHit[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let len = Math.min(idx.maxLen, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(" ");
      const refs = idx.phrases.get(phrase);
      if (refs) {
        hits.push({ start: i, end: i + len, phrase, refs });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return hits;
}

/** Case-sensitive aliases (abbreviations like "LAL", "US") found in the raw text as whole words. */
export function findCaseSensitiveAliases(raw: string): { word: string; refs: AliasRef[] }[] {
  const idx = aliasIndex();
  const out: { word: string; refs: AliasRef[] }[] = [];
  let s = deaccent(raw);
  for (const [re, rep] of PROTECTED_PHRASES) s = s.replace(re, rep);
  for (const w of s.split(/[^A-Za-z0-9]+/)) {
    if (!w || w !== w.toUpperCase() || !/[A-Z]/.test(w)) continue;
    const refs = idx.caseSensitive.get(w);
    if (refs) out.push({ word: w, refs });
  }
  return out;
}
