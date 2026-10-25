/* Strikes for threshold markets ("above $100,000"), for ladders. Kalshi states them in structured fields; Polymarket
 * only in text (question / groupItemTitle), so this reads both. Subjects are normalised to a short id ("btc",
 * "spx", "fed-funds-rate", "nyc-high-temp"); when no subject can be recognised the strike is null, because a strike
 * without a subject cannot be laddered. Pure. */
import type { Strike } from "@/lib/types";
import { num } from "./parse";

/** Subject keywords → normalised subject. Checked in order against lower-cased text. */
const SUBJECTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(bitcoin|btc)\b/, "btc"],
  [/\b(ethereum|eth|ether)\b/, "eth"],
  [/\b(solana|sol)\b/, "sol"],
  [/\b(xrp|ripple)\b/, "xrp"],
  [/\b(dogecoin|doge)\b/, "doge"],
  [/\b(s&p ?500|s&p|spx|inx)\b/, "spx"],
  [/\b(nasdaq(-| )?100|nasdaq|ndx)\b/, "ndx"],
  [/\b(dow jones|the dow|djia)\b/, "dji"],
  [/\b(fed funds|federal funds|fed rate|interest rate|fomc)\b/, "fed-funds-rate"],
  [/\b(cpi|inflation)\b/, "cpi"],
  [/\b(unemployment|jobless rate)\b/, "unemployment-rate"],
  [/\bgold\b/, "gold"],
  [/\b(wti|crude|oil)\b/, "oil"],
];

/** Kalshi series tickers (without the KX prefix) → subject. */
const KALSHI_SERIES_SUBJECTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^BTC/, "btc"],
  [/^ETH/, "eth"],
  [/^SOL/, "sol"],
  [/^XRP/, "xrp"],
  [/^DOGE/, "doge"],
  [/^INX/, "spx"],
  [/^NASDAQ100/, "ndx"],
  [/^FED/, "fed-funds-rate"],
  [/^CPI/, "cpi"],
  [/^U3|^UNEMPLOYMENT/, "unemployment-rate"],
  [/^GOLD/, "gold"],
  [/^WTI|^OIL/, "oil"],
];

/** Kalshi temperature series: KXHIGHNY → nyc-high-temp. */
const CITY_CODES: Readonly<Record<string, string>> = {
  NY: "nyc",
  NYC: "nyc",
  CHI: "chicago",
  MIA: "miami",
  AUS: "austin",
  LAX: "los-angeles",
  LA: "los-angeles",
  DEN: "denver",
  PHIL: "philadelphia",
  PHL: "philadelphia",
  HOU: "houston",
  SFO: "san-francisco",
  SEA: "seattle",
  DC: "washington-dc",
  BOS: "boston",
  ATL: "atlanta",
  DAL: "dallas",
  LV: "las-vegas",
};

export function subjectFromText(text: string): string | null {
  const t = text.toLowerCase();
  const temp = /highest temperature in ([a-z .]+?)(?: on| today| tomorrow|\?|$)/.exec(t);
  if (temp?.[1]) {
    const city = temp[1].trim().replace(/\./g, "").replace(/\s+/g, "-");
    return `${city === "new-york-city" || city === "new-york" || city === "ny" ? "nyc" : city}-high-temp`;
  }
  for (const [re, s] of SUBJECTS) if (re.test(t)) return s;
  return null;
}

export function subjectFromKalshiSeries(series: string | null): string | null {
  if (!series) return null;
  const s = series.toUpperCase().replace(/^KX/, "");
  const high = /^HIGH([A-Z]+)$/.exec(s);
  if (high?.[1]) return `${CITY_CODES[high[1]] ?? high[1].toLowerCase()}-high-temp`;
  const low = /^LOW([A-Z]+)$/.exec(s);
  if (low?.[1]) return `${CITY_CODES[low[1]] ?? low[1].toLowerCase()}-low-temp`;
  for (const [re, subj] of KALSHI_SERIES_SUBJECTS) if (re.test(s)) return subj;
  return series.toLowerCase();
}

/** Kalshi's structured strike: strike_type greater / greater_or_equal (floor_strike), less / less_or_equal
 *  (cap_strike), between (floor_strike..cap_strike). Other types (functional, custom, structured) → null. */
export function kalshiStrike(strikeType: unknown, floor: unknown, cap: unknown, subject: string | null): Strike | null {
  if (!subject || typeof strikeType !== "string") return null;
  const lo = num(floor);
  const hi = num(cap);
  switch (strikeType.toLowerCase()) {
    case "greater":
    case "greater_or_equal":
      return lo === null ? null : { kind: "above", value: lo, upper: null, subject };
    case "less":
    case "less_or_equal":
      return hi === null ? null : { kind: "below", value: hi, upper: null, subject };
    case "between":
      return lo === null || hi === null ? null : { kind: "between", value: lo, upper: hi, subject };
    default:
      return null;
  }
}

/** "$100,000" / "100k" / "4.25%" / "1.2m" → number. */
function amount(s: string): number | null {
  const m = /^\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kmb])?\s*%?$/i.exec(s.trim());
  if (!m?.[1]) return null;
  const base = num(m[1].replace(/,/g, ""));
  if (base === null) return null;
  const mult = m[2] ? { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as "k" | "m" | "b"] : 1;
  return base * mult;
}

const AMT = String.raw`\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*[kmb]?\s*%?`;
/** "between X and Y", or a dollar range "$X-$Y" / "$X to Y" (a bare "3-4" is too often a time or a date). */
const BETWEEN_RE = new RegExp(String.raw`between\s+(${AMT})\s*(?:-|–|to|and)\s*(${AMT})|(?<![\w:.])(\$\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*[kmb]?)\s*(?:-|–|to)\s*(${AMT})`, "i");
const ABOVE_RE = new RegExp(String.raw`(?:\babove|over|greater than|more than|higher than|at least|exceed(?:s)?|reach(?:es)?|hit(?:s)?|>=?|≥|↑)\s*(${AMT})(\s*(?:or (?:more|higher|above)|\+))?`, "i");
const BELOW_RE = new RegExp(String.raw`(?:\bbelow|under|less than|lower than|at most|dip(?:s)? to|fall(?:s)? to|<=?|≤|↓)\s*(${AMT})`, "i");
const PLUS_RE = new RegExp(String.raw`(?<![\w:.])(${AMT})\s*(?:\+|or (?:more|higher|above))`, "i");

/** A strike read from text ("Above $100,000", "↑ 120,000", "$100k-$105k", "Bitcoin above 100k on Oct 31?"). The
 *  subject comes from `subjectText` (e.g. the event title) or the text itself. Conservative: null when unsure. */
export function strikeFromText(text: string, subjectText = ""): Strike | null {
  const subject = subjectFromText(`${subjectText} ${text}`);
  if (!subject) return null;
  const between = BETWEEN_RE.exec(text);
  const loText = between?.[1] ?? between?.[3];
  const hiText = between?.[2] ?? between?.[4];
  if (loText && hiText) {
    const lo = amount(loText);
    const hi = amount(hiText);
    if (lo !== null && hi !== null && hi > lo) return { kind: "between", value: lo, upper: hi, subject };
  }
  const above = ABOVE_RE.exec(text) ?? PLUS_RE.exec(text);
  if (above?.[1]) {
    const v = amount(above[1]);
    if (v !== null) return { kind: "above", value: v, upper: null, subject };
  }
  const below = BELOW_RE.exec(text);
  if (below?.[1]) {
    const v = amount(below[1]);
    if (v !== null) return { kind: "below", value: v, upper: null, subject };
  }
  return null;
}
