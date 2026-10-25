/* Candidate pairs between two venues' market lists, scored and oriented. Blocking uses an inverted index of
 * entity keys bucketed by close day (and strike value for threshold markets), so 20k × 20k markets cost about
 * 20k × (a few keys × a few buckets) lookups instead of 400M comparisons. Each candidate gets a score in 0..1, a
 * list of reasons, any hard conflicts (different teams, dates, thresholds, numbers, quoted words, condition words:
 * these always reject), and "caps" (one-sided facts that keep it from a deterministic accept and send it to the
 * LLM instead). Pure. */
import type { VMarket } from "@/lib/types";
import {
  compatibleDates,
  entityKeys,
  extractEntities,
  sameNumber,
  type Entities,
  type Threshold,
} from "./entities";
import { CONFLICT_GROUPS } from "./aliases";

// ---------------------------------------------------------------------------------------------------------------
// Configuration

export interface MatchConfig {
  /** Close times further apart than this are never paired (env MATCH_MAX_CLOSE_GAP_HOURS). */
  maxCloseGapHours: number;
  /** Score at or above which a candidate with no caps is accepted without the LLM (env MATCH_AUTO_ACCEPT). */
  autoAccept: number;
  /** Score at or above which an uncertain candidate is sent to the LLM; below it is rejected (env MATCH_LLM_MIN). */
  llmMin: number;
  /** Candidates kept per market on side A (best first). */
  maxCandidatesPerMarket: number;
  /** LLM questions per market on side A per run (the next run walks further down, since answers are cached). */
  maxLlmPerMarket: number;
  /** LLM questions per run, across all markets (env MATCH_LLM_MAX_PER_RUN). */
  maxLlmPerRun: number;
  /** Parallel LLM requests (env MATCH_LLM_CONCURRENCY). */
  llmConcurrency: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  maxCloseGapHours: 48,
  autoAccept: 0.85,
  llmMin: 0.6,
  maxCandidatesPerMarket: 5,
  maxLlmPerMarket: 2,
  maxLlmPerRun: 1000,
  llmConcurrency: 4,
};

function envNum(env: Readonly<Record<string, string | undefined>>, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Reads MATCH_* variables; anything missing or unparseable keeps its default. */
export function matchConfigFromEnv(env: Readonly<Record<string, string | undefined>>): MatchConfig {
  const d = DEFAULT_MATCH_CONFIG;
  return {
    maxCloseGapHours: envNum(env, "MATCH_MAX_CLOSE_GAP_HOURS", d.maxCloseGapHours),
    autoAccept: envNum(env, "MATCH_AUTO_ACCEPT", d.autoAccept),
    llmMin: envNum(env, "MATCH_LLM_MIN", d.llmMin),
    maxCandidatesPerMarket: envNum(env, "MATCH_MAX_CANDIDATES", d.maxCandidatesPerMarket),
    maxLlmPerMarket: envNum(env, "MATCH_LLM_MAX_PER_MARKET", d.maxLlmPerMarket),
    maxLlmPerRun: envNum(env, "MATCH_LLM_MAX_PER_RUN", d.maxLlmPerRun),
    llmConcurrency: Math.max(1, Math.floor(envNum(env, "MATCH_LLM_CONCURRENCY", d.llmConcurrency))),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Constants

/** Score weights (sum 1). */
const W_ENTITY = 0.35;
const W_TOKENS = 0.3;
const W_NUMBERS = 0.15;
const W_DATE = 0.1;
const W_TYPE = 0.1;
/** Token similarity when one side has content words and the other has none. */
const TOKENS_ONE_EMPTY = 0.4;
/** Entity overlap when neither side has any entity (titles must carry it). */
const ENTITY_NONE = 0.3;
/** Number score when one side states a quantity and the other does not. */
const NUMBERS_ONE_SIDED = 0.3;
/** Date score when a close time is missing. */
const DATE_UNKNOWN = 0.5;
/** Minimum token similarity for a deterministic accept (event-type markets need more). */
const AUTO_MIN_TOKEN_SIM = 0.5;
const AUTO_MIN_TOKEN_SIM_EVENT = 0.6;
/** Minimum weighted entity overlap for a deterministic accept. */
const AUTO_MIN_ENTITY = 0.6;
/** Without explicit dates in both titles, close times further apart than this need the LLM: the same two teams
 *  meet on consecutive days in a baseball series. */
const SAME_EVENT_GAP_HOURS = 14;
/** Two times of day are the same cutoff within this many minutes (ET is treated as UTC−5 for comparison). */
const TIME_EQ_MINUTES = 60;
/** Blocking: posting lists longer than this (per key and day) are too generic to use. */
const MAX_POSTING = 500;
/** Blocking: rare title words used as extra keys (document frequency at most this, at most this many per market). */
const RARE_TOKEN_MAX_DF = 30;
const RARE_TOKENS_PER_MARKET = 3;
const RARE_TOKEN_MIN_LEN = 4;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Market types that may be the same market (0.5) — everything else that differs is a hard conflict. */
const TYPE_COMPAT: ReadonlyArray<readonly [string, string]> = [
  ["winner", "event"],
  ["threshold", "event"],
  ["total", "threshold"],
];

// ---------------------------------------------------------------------------------------------------------------
// Profiles

export interface MarketProfile {
  m: VMarket;
  e: Entities;
  /** Weighted entity keys for overlap. */
  keys: Map<string, number>;
  /** Blocking keys (without the day bucket). */
  blockKeys: string[];
}

function fmtValue(v: number): string {
  return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(2);
}

export function buildProfile(m: VMarket): MarketProfile {
  const e = extractEntities(m);
  const keys = entityKeys(e);
  const block = new Set<string>();
  const subjects = [...e.assets.map(a => `asset:${a}`), ...e.orgs.map(o => `org:${o}`), ...e.places.map(p => `place:${p}`)];
  const thresholdKeyed = e.teams.length === 0 && subjects.length > 0 && e.thresholds.length > 0;
  for (const t of e.teams) block.add(`team:${t}`);
  for (const p of e.people) block.add(`person:${p}`);
  if (thresholdKeyed) {
    // Ladders: block on subject + strike so 1,000 BTC markets a day do not all meet each other.
    for (const s of subjects) for (const t of e.thresholds) block.add(`thr:${s}:${fmtValue(t.value)}`);
  } else {
    for (const s of subjects) block.add(s);
  }
  return { m, e, keys, blockKeys: [...block] };
}

export function pairKey(a: Pick<VMarket, "venue" | "id">, b: Pick<VMarket, "venue" | "id">): string {
  return `${a.venue}:${a.id}|${b.venue}:${b.id}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Comparison

export type Orientation = "same" | "inverted" | "unknown";

export interface PairScore {
  score: number;
  orientation: Orientation;
  /** Hard conflicts: any one rejects the pair. */
  conflicts: string[];
  /** One-sided or uncertain facts: no deterministic accept. */
  caps: string[];
  reasons: string[];
  entity: number;
  tokens: number;
}

const setEq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));
const inter = (a: readonly string[], b: readonly string[]) => a.filter(x => b.includes(x));

function quantities(e: Entities): number[] {
  const out: number[] = [];
  for (const t of e.thresholds) {
    out.push(t.value);
    if (t.upper !== null) out.push(t.upper);
  }
  for (const n of e.numbers) out.push(n.value);
  return out;
}
const fmtList = (xs: number[]) => xs.map(v => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(v))).join(", ");

function typesCompatible(a: string, b: string): number {
  if (a === b) return 1;
  return TYPE_COMPAT.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ? 0.5 : 0;
}

function sameTime(a: Entities["times"][number], b: Entities["times"][number]): boolean {
  const ua = a.utcMinutes;
  const ub = b.utcMinutes;
  const d = ua !== null && ub !== null ? Math.abs(ua - ub) : Math.abs(a.minutes - b.minutes);
  return Math.min(d, 1440 - d) <= TIME_EQ_MINUTES;
}

/** Facts that make two markets different markets. Shared with safety.ts (a conflict there is RED). */
export function hardConflicts(ea: Entities, eb: Entities): string[] {
  const out: string[] = [];
  // Teams.
  if (ea.teams.length && eb.teams.length) {
    const shared = inter(ea.teams, eb.teams);
    if (shared.length === 0) out.push("different teams");
    else if (ea.teams.length >= 2 && eb.teams.length >= 2 && !setEq(ea.teams, eb.teams)) out.push("different matchups");
    else if (ea.futures !== eb.futures && (ea.teams.length >= 2 || eb.teams.length >= 2)) out.push("a single game vs a season-long market");
  }
  if (ea.league && eb.league && ea.league !== eb.league) out.push("different leagues");
  if (ea.assets.length && eb.assets.length && inter(ea.assets, eb.assets).length === 0) out.push("different assets");
  if (ea.people.length && eb.people.length && inter(ea.people, eb.people).length === 0) out.push("different people");
  if (ea.orgs.length && eb.orgs.length && inter(ea.orgs, eb.orgs).length === 0) out.push("different subjects");
  if (ea.places.length && eb.places.length && inter(ea.places, eb.places).length === 0) out.push("different places");
  // Numbers and thresholds: any difference rejects.
  const qa = quantities(ea);
  const qb = quantities(eb);
  if (qa.length && qb.length) {
    const missingB = qa.filter(x => !qb.some(y => sameNumber(x, y)));
    const missingA = qb.filter(y => !qa.some(x => sameNumber(x, y)));
    if (missingA.length || missingB.length) out.push(`different numbers (${fmtList(qa)} vs ${fmtList(qb)})`);
  }
  const between = (ts: Threshold[]) => ts.some(t => t.direction === "between");
  if (ea.thresholds.length && eb.thresholds.length && between(ea.thresholds) !== between(eb.thresholds)) out.push("a range vs an open-ended threshold");
  // Dates.
  if (ea.dates.length && eb.dates.length && !ea.dates.some(x => eb.dates.some(y => compatibleDates(x, y)))) out.push("different dates");
  if (ea.years.length && eb.years.length && inter(ea.years.map(String), eb.years.map(String)).length === 0) out.push("different years");
  if (ea.times.length && eb.times.length && !ea.times.some(x => eb.times.some(y => sameTime(x, y)))) out.push("different times of day");
  if (ea.counters.length && eb.counters.length && inter(ea.counters.map(String), eb.counters.map(String)).length === 0) out.push("different week or game numbers");
  // Words.
  if (ea.quotes.length && eb.quotes.length && !setEq(ea.quotes, eb.quotes)) out.push(`different quoted words (${ea.quotes.join(", ")} vs ${eb.quotes.join(", ")})`);
  for (const g of CONFLICT_GROUPS) {
    const wa = ea.conditions.filter(w => g.includes(w));
    const wb = eb.conditions.filter(w => g.includes(w));
    if (wa.length && wb.length && inter(wa, wb).length === 0) out.push(`different conditions (${wa.join("/")} vs ${wb.join("/")})`);
  }
  if (typesCompatible(ea.type, eb.type) === 0) out.push(`different market types (${ea.type} vs ${eb.type})`);
  return out;
}

/** Which side of B matches YES on A. */
export function orient(ea: Entities, eb: Entities): { orientation: Orientation; conflict: string | null; reason: string } {
  // Subjects (teams, people).
  const sa = ea.yesSubject;
  const sb = eb.yesSubject;
  let subj: Orientation | null = null;
  if (sa?.ids.length && sb?.ids.length) {
    if (inter(sa.ids, sb.ids).length) subj = "same";
    else if (eb.noSubject && inter(sa.ids, eb.noSubject.ids).length) subj = "inverted";
    else if (ea.noSubject && inter(ea.noSubject.ids, sb.ids).length) subj = "inverted";
    else if (ea.teams.length === 2 && setEq(ea.teams, eb.teams) && ea.type === "winner" && eb.type === "winner") subj = "inverted";
    else return { orientation: "unknown", conflict: "YES pays on different outcomes", reason: "" };
  } else if (sa?.ids.length && eb.noSubject?.ids.length && inter(sa.ids, eb.noSubject.ids).length) {
    subj = "inverted";
  } else if (sb?.ids.length && ea.noSubject?.ids.length && inter(sb.ids, ea.noSubject.ids).length) {
    subj = "inverted";
  } else if (sa?.ids.length || sb?.ids.length) {
    // One side names its YES outcome, the other does not.
    const named = (sa?.ids.length ? sa : sb)!;
    const other = sa?.ids.length ? eb : ea;
    // A plain "Yes" on a market about exactly that one entity is the same side ("Will Vance win?").
    const otherIds = [...other.teams.map(t => `team:${t}`), ...other.people.map(p => `person:${p}`)];
    if (other.genericYes && otherIds.length === 1 && named.ids.includes(otherIds[0]!)) subj = "same";
    else subj = null;
  } else if (sa?.text.length || sb?.text.length) {
    const covered = (s: typeof sa, other: Entities) => !!s && s.text.length > 0 && s.text.every(t => other.tokens.includes(t) || (other.yesSubject?.text ?? []).includes(t));
    if (covered(sa, eb) || covered(sb, ea)) subj = "same";
  }
  // Threshold direction.
  let dir: Orientation | null = null;
  const ta = ea.thresholds[0];
  const tb = eb.thresholds[0];
  const da = ta?.direction === "ou" ? ea.yesSubject?.direction ?? null : ta?.direction ?? ea.yesSubject?.direction ?? null;
  const db = tb?.direction === "ou" ? eb.yesSubject?.direction ?? null : tb?.direction ?? eb.yesSubject?.direction ?? null;
  if (ta && tb && da && db) dir = da === db ? "same" : da === "between" || db === "between" ? null : "inverted";

  if (subj && dir && subj !== dir) return { orientation: "unknown", conflict: null, reason: "subject and threshold disagree on orientation" };
  const o = subj ?? dir;
  if (o) return { orientation: o, conflict: null, reason: o === "inverted" ? "YES on one is NO on the other" : "same side" };
  // Both plain Yes/No on the same proposition.
  if (ea.genericYes && eb.genericYes && !sa?.ids.length && !sb?.ids.length) {
    if (ea.negated !== eb.negated) return { orientation: "unknown", conflict: null, reason: "one title is negated" };
    return { orientation: "same", conflict: null, reason: "both YES on the same question" };
  }
  return { orientation: "unknown", conflict: null, reason: "could not tell which side matches" };
}

function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  let shared = 0;
  let union = 0;
  for (const [k, w] of a) {
    union += w;
    if (b.has(k)) shared += w;
  }
  for (const [k, w] of b) if (!a.has(k)) union += w;
  return union === 0 ? ENTITY_NONE : shared / union;
}

function dice(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return TOKENS_ONE_EMPTY;
  const sb = new Set(b);
  const shared = new Set(a.filter(x => sb.has(x))).size;
  return (2 * shared) / (new Set(a).size + sb.size);
}

/** Scores one pair (A on the first venue, B on the other). */
export function scorePair(pa: MarketProfile, pb: MarketProfile, cfg: MatchConfig = DEFAULT_MATCH_CONFIG): PairScore {
  const ea = pa.e;
  const eb = pb.e;
  const reasons: string[] = [];
  const caps: string[] = [];
  const conflicts = hardConflicts(ea, eb);

  // Close times.
  const ca = pa.m.closeTime;
  const cb = pb.m.closeTime;
  let dateScore = DATE_UNKNOWN;
  let gapH: number | null = null;
  if (ca !== null && cb !== null) {
    gapH = Math.abs(ca - cb) / HOUR_MS;
    if (gapH > cfg.maxCloseGapHours) conflicts.push(`close times ${Math.round(gapH)} hours apart`);
    dateScore = Math.max(0, 1 - Math.max(0, gapH - 1) / Math.max(1, cfg.maxCloseGapHours));
    reasons.push(`closes ${gapH < 1 ? "within an hour" : `${gapH.toFixed(1)}h apart`}`);
  } else caps.push("a close time is missing");
  const explicitDates = ea.dates.length > 0 && eb.dates.length > 0;
  if (explicitDates && ea.dates.every(x => eb.dates.some(y => compatibleDates(x, y))) && eb.dates.every(y => ea.dates.some(x => compatibleDates(x, y)))) {
    dateScore = Math.max(dateScore, 1);
    reasons.push(`same date (${ea.dates.map(d => d.key).join(", ")})`);
  } else if (explicitDates) caps.push("dates only partly agree");
  else if (ea.dates.length !== eb.dates.length) caps.push("only one title states a date");
  if (!explicitDates && gapH !== null && gapH > SAME_EVENT_GAP_HOURS) caps.push(`no stated date and closes ${Math.round(gapH)}h apart`);

  // Entities.
  const entity = weightedJaccard(pa.keys, pb.keys);
  const shared = [...pa.keys.keys()].filter(k => pb.keys.has(k));
  if (shared.length) reasons.push(`shared: ${shared.join(", ")}`);
  if (ea.teams.length !== eb.teams.length && !conflicts.length) caps.push("one market names fewer teams");
  if (ea.people.length && eb.people.length && !setEq(ea.people, eb.people)) caps.push("people only partly agree");

  // Tokens.
  const tokens = dice(ea.tokens, eb.tokens);
  reasons.push(`title similarity ${tokens.toFixed(2)}`);

  // Numbers.
  const qa = quantities(ea);
  const qb = quantities(eb);
  let numScore = 1;
  if (qa.length && qb.length) {
    if (!conflicts.some(c => c.startsWith("different numbers"))) reasons.push(`same numbers (${fmtList(qa)})`);
  } else if (qa.length || qb.length) {
    numScore = NUMBERS_ONE_SIDED;
    caps.push("only one market states a number");
  }
  if ((ea.thresholds.length > 0) !== (eb.thresholds.length > 0) && qa.length && qb.length) caps.push("only one market states a direction (above/below)");
  if ((ea.times.length > 0) !== (eb.times.length > 0)) caps.push("only one title states a time of day");
  if ((ea.quotes.length > 0) !== (eb.quotes.length > 0)) caps.push("only one title quotes a word");
  if ((ea.counters.length > 0) !== (eb.counters.length > 0)) caps.push("only one title states a week or game number");

  // Type.
  const typeScore = typesCompatible(ea.type, eb.type);
  if (typeScore === 1) reasons.push(`both ${ea.type} markets`);
  else if (typeScore > 0) caps.push(`market types differ (${ea.type} vs ${eb.type})`);

  // Orientation.
  const o = orient(ea, eb);
  if (o.conflict) conflicts.push(o.conflict);
  if (o.orientation === "unknown") caps.push(o.reason || "orientation unknown");
  else reasons.push(o.reason);
  if (o.orientation === "inverted" && ea.thresholds.length && eb.thresholds.length) caps.push("opposite thresholds (above vs below)");
  if (ea.negated !== eb.negated) caps.push("one title is negated");

  let score = W_ENTITY * entity + W_TOKENS * tokens + W_NUMBERS * numScore + W_DATE * dateScore + W_TYPE * typeScore;
  score = Math.round(score * 1000) / 1000;
  if (entity < AUTO_MIN_ENTITY) caps.push(`entity overlap ${entity.toFixed(2)}`);
  const strong = shared.some(k => /^(team|person|asset):/.test(k)) || (shared.some(k => k.startsWith("org:")) && shared.some(k => /^(date|year|place):/.test(k)));
  if (!strong) caps.push("no shared team, person or asset");
  const minTok = ea.type === "event" || eb.type === "event" ? AUTO_MIN_TOKEN_SIM_EVENT : AUTO_MIN_TOKEN_SIM;
  if (tokens < minTok) caps.push(`title similarity ${tokens.toFixed(2)} below ${minTok}`);
  return { score: conflicts.length ? 0 : score, orientation: o.orientation, conflicts, caps, reasons, entity, tokens };
}

export type Decision = "accept" | "llm" | "reject";

export function decide(s: PairScore, cfg: MatchConfig): Decision {
  if (s.conflicts.length) return "reject";
  if (s.score >= cfg.autoAccept && s.caps.length === 0 && s.orientation !== "unknown") return "accept";
  return s.score >= cfg.llmMin ? "llm" : "reject";
}

// ---------------------------------------------------------------------------------------------------------------
// Candidate generation

export interface Candidate {
  key: string;
  a: VMarket;
  b: VMarket;
  score: number;
  orientation: Orientation;
  decision: Decision;
  reasons: string[];
  conflicts: string[];
  caps: string[];
  pa: MarketProfile;
  pb: MarketProfile;
}

interface Index {
  bucketed: Map<string, number[]>;
  all: Map<string, number[]>;
}

function push(map: Map<string, number[]>, k: string, i: number): void {
  const l = map.get(k);
  if (l) l.push(i);
  else map.set(k, [i]);
}

/** Rare title words as blocking keys, for markets the alias tables know nothing about. */
function addRareTokenKeys(profiles: MarketProfile[]): void {
  const df = new Map<string, number>();
  for (const p of profiles) for (const t of new Set(p.e.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  for (const p of profiles) {
    const rare = [...new Set(p.e.tokens)]
      .filter(t => t.length >= RARE_TOKEN_MIN_LEN && !/^\d/.test(t) && (df.get(t) ?? 0) <= RARE_TOKEN_MAX_DF && (df.get(t) ?? 0) >= 2)
      .sort((x, y) => (df.get(x) ?? 0) - (df.get(y) ?? 0) || (x < y ? -1 : 1))
      .slice(0, RARE_TOKENS_PER_MARKET);
    for (const t of rare) p.blockKeys.push(`tok:${t}`);
  }
}

/** All scored candidates between `as` (e.g. Kalshi) and `bs` (e.g. Polymarket), best first per A market. */
export function findCandidates(as: readonly VMarket[], bs: readonly VMarket[], cfg: MatchConfig = DEFAULT_MATCH_CONFIG): Candidate[] {
  const pas = as.map(buildProfile);
  const pbs = bs.map(buildProfile);
  return candidatesFromProfiles(pas, pbs, cfg);
}

export function candidatesFromProfiles(pas: MarketProfile[], pbs: MarketProfile[], cfg: MatchConfig): Candidate[] {
  addRareTokenKeys([...pas, ...pbs]);
  const idx: Index = { bucketed: new Map(), all: new Map() };
  pbs.forEach((p, i) => {
    const day = p.m.closeTime === null ? "n" : String(Math.floor(p.m.closeTime / DAY_MS));
    for (const k of p.blockKeys) {
      push(idx.bucketed, `${k}@${day}`, i);
      push(idx.all, k, i);
    }
  });
  const window = Math.ceil(cfg.maxCloseGapHours / 24);
  const out: Candidate[] = [];
  for (const pa of pas) {
    const seen = new Set<number>();
    const lists: number[][] = [];
    for (const k of pa.blockKeys) {
      if (pa.m.closeTime === null) {
        const l = idx.all.get(k);
        if (l && l.length <= MAX_POSTING) lists.push(l);
        continue;
      }
      const day = Math.floor(pa.m.closeTime / DAY_MS);
      for (let d = day - window; d <= day + window; d++) {
        const l = idx.bucketed.get(`${k}@${d}`);
        if (l && l.length <= MAX_POSTING) lists.push(l);
      }
      const ln = idx.bucketed.get(`${k}@n`);
      if (ln && ln.length <= MAX_POSTING) lists.push(ln);
    }
    for (const l of lists) for (const i of l) seen.add(i);
    const scored: Array<{ c: Candidate; raw: number }> = [];
    for (const i of seen) {
      const pb = pbs[i];
      if (!pb) continue;
      if (pa.m.closeTime !== null && pb.m.closeTime !== null && Math.abs(pa.m.closeTime - pb.m.closeTime) > cfg.maxCloseGapHours * HOUR_MS) continue;
      const s = scorePair(pa, pb, cfg);
      const c: Candidate = {
        key: pairKey(pa.m, pb.m),
        a: pa.m,
        b: pb.m,
        score: s.score,
        orientation: s.orientation,
        decision: decide(s, cfg),
        reasons: s.reasons,
        conflicts: s.conflicts,
        caps: s.caps,
        pa,
        pb,
      };
      // Similarity before conflicts ranks near misses (kept, so their rejections are cached and explainable).
      scored.push({ c, raw: W_ENTITY * s.entity + W_TOKENS * s.tokens });
    }
    scored.sort((x, y) => y.c.score - x.c.score || y.raw - x.raw || (x.c.key < y.c.key ? -1 : 1));
    for (const { c } of scored.slice(0, cfg.maxCandidatesPerMarket)) out.push(c);
  }
  return out;
}
