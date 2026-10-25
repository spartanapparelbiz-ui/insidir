/* The safety light for a matched pair, from both venues' rules texts. GREEN: same event, same date, same
 * resolution source as far as the rules say. YELLOW: minor differences, listed in plain English. RED: the
 * markets differ (different dates, thresholds, teams, conflicting conditions); RED pairs are hidden by default.
 * Deterministic extraction of resolution sources, cutoff times, dates, thresholds, overtime / regulation,
 * postponement / cancellation and tie / draw clauses; the LLM's `differences` are merged in when present. Pure. */
import { VENUE_NAME, type Safety, type VMarket } from "@/lib/types";
import { RESOLUTION_SOURCES } from "./aliases";
import { hardConflicts } from "./candidates";
import { compatibleDates, extractEntities, parseNumbers, sameNumber, type Entities, type Threshold } from "./entities";
import { deaccent, extractTimes, normalize, type DateMention, type TimeMention } from "./normalize";

/** Close times further apart than this get a YELLOW note. */
const CLOSE_GAP_YELLOW_HOURS = 3;
/** Two cutoff times within this many minutes are the same (ET is compared as UTC−5). */
const CUTOFF_EQ_MINUTES = 60;
/** At most this many LLM differences are shown. */
const MAX_LLM_NOTES = 5;
/** Each LLM difference is cut to this length. */
const MAX_NOTE_CHARS = 200;
/** Sources every market defers to anyway: one venue naming only these is not a difference. */
const IMPLIED_SOURCES: ReadonlySet<string> = new Set(["official results", "official league site"]);
const HOUR_MS = 3_600_000;

export type OutcomeClass = "yes" | "no" | "split" | "void" | "wait" | "price";

export interface RuleFacts {
  sources: string[];
  times: TimeMention[];
  dates: DateMention[];
  /** Directional thresholds in dollars, percent or degrees. */
  thresholds: Threshold[];
  overtime: "included" | "excluded" | null;
  /** What happens if the event is postponed / cancelled / abandoned. */
  postponed: OutcomeClass[];
  /** What happens on a tie / draw. */
  tie: OutcomeClass[];
}

const POSTPONE_RE = /postpon|cancel|reschedul|abandon|suspend|delay/i;
const TIE_RE = /\bties?\b|\btied\b|\bdraws?\b|\bdeadlock/i;
const OUTCOME_RES: ReadonlyArray<readonly [OutcomeClass, RegExp]> = [
  ["split", /50\s*[-/ ]\s*50|fifty[- ]fifty|\$0?\.50\b|50%|equal(ly)? split/i],
  ["void", /\brefund|\bvoid\b|\bannul/i],
  ["wait", /remain open|until (?:the )?(?:\w+ )?(?:is |has been )?(?:played|completed|rescheduled)|will be extended|resolved? (?:once|when)/i],
  ["price", /last (?:traded )?price|fair (?:market )?(?:price|value)/i],
  ["yes", /resolve[sd]?\s+(?:to\s+|as\s+)?["'“]?yes\b/i],
  ["no", /resolve[sd]?\s+(?:to\s+|as\s+)?["'“]?no\b/i],
];
const OT_INCLUDED_RE =
  /\binclu(?:des?|ding|sive of)\s+(?:any\s+)?(?:overtime|extra (?:time|innings)|OT\b)|\b(?:overtime|OT)\b(?: periods?)?(?: and shootouts?)?\s+(?:will\s+)?(?:count|are included|is included)|\bregardless of (?:overtime|OT)\b|\bafter (?:any )?overtime\b/i;
const OT_EXCLUDED_RE =
  /\bregulation(?: time)? only\b|\bexclu(?:des?|ding)\s+(?:any\s+)?(?:overtime|extra time)|\bnot includ(?:e|ing)\s+(?:any\s+)?(?:overtime|extra time)|\bdoes not (?:include|count)\s+(?:any\s+)?(?:overtime|extra time)|\b(?:overtime|extra time) (?:will )?(?:does )?not count|\bat the end of regulation\b(?! or overtime| and overtime)|\b90 minutes\b|\bregular time\b/i;

function sentences(text: string): string[] {
  return deaccent(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

function outcomes(sents: readonly string[], trigger: RegExp): OutcomeClass[] {
  const out = new Set<OutcomeClass>();
  for (const s of sents) {
    if (!trigger.test(s)) continue;
    for (const [cls, re] of OUTCOME_RES) if (re.test(s)) out.add(cls);
  }
  return [...out].sort();
}

/** Deterministic facts from a rules text (plus the venue's separate resolution source, when it has one). */
export function extractRuleFacts(rules: string, resolutionSource: string | null, refTime: number | null): RuleFacts {
  const text = `${rules}\n${resolutionSource ?? ""}`;
  const sources = new Set<string>();
  for (const [re, name] of RESOLUTION_SOURCES) if (re.test(text)) sources.add(name);
  if (resolutionSource && sources.size === 0) {
    const host = /https?:\/\/(?:www\.)?([^/\s]+)/i.exec(resolutionSource)?.[1];
    if (host) sources.add(host.toLowerCase());
  }
  const sents = sentences(rules);
  const inc = OT_INCLUDED_RE.test(rules);
  const exc = OT_EXCLUDED_RE.test(rules);
  const n = normalize(rules, { refTime });
  const thresholds = parseNumbers(n).thresholds.filter(t => (t.unit === "usd" || t.unit === "pct" || t.unit === "deg") && t.direction !== null && t.direction !== "ou");
  return {
    sources: [...sources].sort(),
    times: extractTimes(rules),
    dates: n.dates,
    thresholds,
    overtime: inc && !exc ? "included" : exc && !inc ? "excluded" : null,
    postponed: outcomes(sents, POSTPONE_RE),
    tie: outcomes(sents, TIE_RE),
  };
}

export interface SafetyResult {
  safety: Safety;
  notes: string[];
}

export interface SafetyOptions {
  inverted: boolean;
  llmDifferences?: readonly string[];
  /** Precomputed entities (optional; computed when absent). */
  ea?: Entities;
  eb?: Entities;
}

const OUTCOME_TEXT: Readonly<Record<OutcomeClass, string>> = {
  yes: "resolves Yes",
  no: "resolves No",
  split: "resolves 50-50",
  void: "refunds",
  wait: "waits for the rescheduled event",
  price: "settles at a fair price",
};
const describe = (cs: readonly OutcomeClass[]) => cs.map(c => OUTCOME_TEXT[c]).join(" or ");
const flip = (cs: readonly OutcomeClass[]): OutcomeClass[] => cs.map(c => (c === "yes" ? "no" : c === "no" ? "yes" : c)).sort();

function fmtTime(t: TimeMention): string {
  const h = Math.floor(t.minutes / 60);
  const m = t.minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}${t.tz ? ` ${t.tz}` : ""}`;
}
function sameCutoff(a: TimeMention, b: TimeMention): boolean {
  const d = a.utcMinutes !== null && b.utcMinutes !== null ? Math.abs(a.utcMinutes - b.utcMinutes) : Math.abs(a.minutes - b.minutes);
  return Math.min(d, 1440 - d) <= CUTOFF_EQ_MINUTES;
}
function fmtValue(t: Threshold): string {
  const v = (x: number) => (t.unit === "usd" ? `$${x.toLocaleString("en-US")}` : t.unit === "pct" ? `${x}%` : t.unit === "deg" ? `${x}°` : x.toLocaleString("en-US"));
  return t.upper !== null ? `${v(t.value)}–${v(t.upper)}` : v(t.value);
}
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: DateMention): string {
  const m = MONTH_NAMES[d.month - 1] ?? String(d.month);
  return `${m}${d.day !== null ? ` ${d.day}` : ""}${d.year !== null ? `, ${d.year}` : ""}`;
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The safety light for a pair: `a` and `b` as matched, `inverted` when YES on a is NO on b. */
export function assessSafety(a: VMarket, b: VMarket, opts: SafetyOptions): SafetyResult {
  const A = VENUE_NAME[a.venue];
  const B = a.venue === b.venue ? `${VENUE_NAME[b.venue]} (second market)` : VENUE_NAME[b.venue];
  const ea = opts.ea ?? extractEntities(a);
  const eb = opts.eb ?? extractEntities(b);
  const red: string[] = [];
  const yellow: string[] = [];

  // The titles themselves disagree: RED.
  for (const c of hardConflicts(ea, eb)) {
    if (c === "different dates") red.push(`Different dates: ${A} ${ea.dates.map(fmtDate).join(", ")}; ${B} ${eb.dates.map(fmtDate).join(", ")}`);
    else red.push(cap1(c));
  }

  const fa = extractRuleFacts(a.rules, a.resolutionSource, a.closeTime);
  const fb = extractRuleFacts(b.rules, b.resolutionSource, b.closeTime);

  // Thresholds in the rules.
  if (fa.thresholds.length && fb.thresholds.length && !fa.thresholds.some(x => fb.thresholds.some(y => sameNumber(x.value, y.value)))) {
    red.push(`The rules use different thresholds: ${A} ${fa.thresholds.map(fmtValue).join(", ")}; ${B} ${fb.thresholds.map(fmtValue).join(", ")}`);
  }
  // Boundary: "at least $100,000" vs "above $100,000".
  const ta = ea.thresholds[0];
  const tb = eb.thresholds[0];
  if (ta && tb && sameNumber(ta.value, tb.value) && ta.inclusive !== null && tb.inclusive !== null && (opts.inverted ? ta.inclusive === tb.inclusive : ta.inclusive !== tb.inclusive)) {
    yellow.push(`Exactly ${fmtValue(ta)} counts differently: ${A} ${ta.inclusive ? "includes" : "excludes"} it, ${B} ${tb.inclusive ? "includes" : "excludes"} it`);
  }

  // Dates and cutoff times in the rules.
  if (!red.some(r => r.startsWith("Different dates")) && fa.dates.length && fb.dates.length && !fa.dates.some(x => fb.dates.some(y => compatibleDates(x, y)))) {
    yellow.push(`The rules mention different dates: ${A} ${fa.dates.slice(0, 3).map(fmtDate).join(", ")}; ${B} ${fb.dates.slice(0, 3).map(fmtDate).join(", ")}`);
  }
  if (fa.times.length && fb.times.length && !fa.times.some(x => fb.times.some(y => sameCutoff(x, y)))) {
    const msg = `${A} uses ${fa.times.slice(0, 2).map(fmtTime).join(" / ")}, ${B} uses ${fb.times.slice(0, 2).map(fmtTime).join(" / ")}`;
    // A price observed at a different time is a different outcome; elsewhere it is a cutoff difference.
    if ((ea.type === "threshold" || eb.type === "threshold") && (ea.assets.length || eb.assets.length)) red.push(`Measured at different times: ${msg}`);
    else yellow.push(`Different cutoff times: ${msg}`);
  }
  if (a.closeTime !== null && b.closeTime !== null) {
    const gap = Math.abs(a.closeTime - b.closeTime) / HOUR_MS;
    if (gap > CLOSE_GAP_YELLOW_HOURS) yellow.push(gap >= 48 ? `Closes ${Math.round(gap / 24)} days apart` : `Closes ${Math.round(gap)} hours apart`);
  }

  // Resolution sources.
  if (fa.sources.length && fb.sources.length) {
    if (!fa.sources.some(s => fb.sources.includes(s))) yellow.push(`Different resolution sources: ${fa.sources.join(", ")} vs ${fb.sources.join(", ")}`);
  } else if (fa.sources.length || fb.sources.length) {
    const [who, list] = fa.sources.length ? [A, fa.sources] : [B, fb.sources];
    const explicit = list.filter(s => !IMPLIED_SOURCES.has(s));
    if (explicit.length) yellow.push(`Only ${who} names a resolution source (${explicit.join(", ")})`);
  }

  // Overtime.
  if (fa.overtime && fb.overtime && fa.overtime !== fb.overtime) {
    red.push(`${fa.overtime === "included" ? `${A} counts overtime; ${B} counts regulation time only` : `${A} counts regulation time only; ${B} counts overtime`}`);
  } else if (fa.overtime !== fb.overtime) {
    const [who, other, ot] = fa.overtime ? [A, B, fa.overtime] : [B, A, fb.overtime];
    yellow.push(ot === "included" ? `${who} counts overtime; ${other}'s rules don't mention it` : `${who} counts regulation time only; ${other}'s rules don't say`);
  }

  // Postponement / cancellation and ties.
  const clause = (label: string, xa: OutcomeClass[], xb: OutcomeClass[]) => {
    const mb = opts.inverted ? flip(xb) : xb;
    if (xa.length && xb.length) {
      if (xa.join() !== mb.join()) yellow.push(`${label}: ${A} ${describe(xa)}; ${B} ${describe(xb)}`);
    } else if (xa.length || xb.length) {
      yellow.push(`Only ${xa.length ? A : B}'s rules say what happens ${label === "If it ends in a tie" ? "on a tie" : "if the event is postponed or cancelled"}`);
    }
  };
  clause("If the event is postponed or cancelled", fa.postponed, fb.postponed);
  clause("If it ends in a tie", fa.tie, fb.tie);

  // The LLM's differences.
  const llm = [...new Set((opts.llmDifferences ?? []).map(s => s.trim().slice(0, MAX_NOTE_CHARS)).filter(Boolean))].slice(0, MAX_LLM_NOTES);
  for (const d of llm) if (!yellow.includes(d) && !red.includes(d)) yellow.push(d);

  const notes = [...red, ...yellow];
  return { safety: red.length ? "red" : yellow.length ? "yellow" : "green", notes };
}
