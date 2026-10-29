/* Matching a slip's leg to a prediction market, pure: the same game or question on Polymarket or Kalshi, scored by the
 * teams or words they share, the kind of market (winner, line, total, yes/no), the line itself and the date (more than 4 days apart rules it out). Then
 * which side of that market the slip is on. A leg that matches nothing well enough stays unmatched (never a guess). */

export type MarketType = "moneyline" | "spread" | "total" | "player_prop" | "yes_no" | "futures" | "stock" | "other";

export interface Leg {
  sport: string | null;
  event: string;
  selection: string;
  marketType: MarketType;
  line: number | null;
  overUnder: "over" | "under" | null;
  odds: string | null;
  stake: number | null;
  date: string | null;
}

export interface Candidate {
  source: "polymarket" | "kalshi";
  marketId: string;
  title: string;
  eventTitle: string | null;
  yesLabel: string;
  noLabel: string;
  closeTime: number | null;
  yesPrice: number | null;
}

const STOP = new Set(["the", "vs", "v", "at", "and", "to", "win", "wins", "will", "fc", "sc", "cf", "of", "on", "in", "a", "game", "match", "moneyline", "ml", "total", "spread", "over", "under", "o", "u", "yes", "no", "points", "runs", "goals", "pts", "st", "nd", "rd", "th"]);

export function words(s: string | null | undefined): Set<string> {
  return new Set((s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 .+-]/g, " ").replace(/[.]/g, " ").split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w) && !/^[+-]?\d+(\.\d+)?$/.test(w)));
}

const overlap = (a: Set<string>, b: Set<string>) => [...a].filter(w => b.has(w)).length;

/** The kind of market a venue title is. */
export function kindOf(c: Pick<Candidate, "title" | "yesLabel">): MarketType {
  const t = `${c.title} ${c.yesLabel}`;
  if (/o\/u|over\/under|\btotal\b|^over\b/i.test(t)) return "total";
  if (/spread|handicap|\([-+−]\d/i.test(t)) return "spread";
  if (/:\s*[a-z ]+(yards|points|rebounds|assists|strikeouts|hits|shots)/i.test(t)) return "player_prop";
  if (/\bvs\.?\b/i.test(c.title) && !/^yes$/i.test(c.yesLabel)) return "moneyline";
  if (/^yes$/i.test(c.yesLabel)) return "yes_no";
  return "other";
}

const lineIn = (t: string): number | null => {
  const m = /(?:o\/u|total[^0-9]*|\()\s*([-+−]?\d+(?:\.\d+)?)/i.exec(t);
  return m ? Math.abs(Number(m[1]!.replace("−", "-"))) : null;
};

/** 0..1: how well a market fits the leg. Teams or words shared carry most of it; a wrong kind of market or line
 *  rules it out. */
export function score(leg: Leg, c: Candidate, now: number): number {
  const lw = words(`${leg.event} ${leg.selection}`), cw = words(`${c.eventTitle ?? ""} ${c.title} ${c.yesLabel} ${c.noLabel}`);
  if (!lw.size || !cw.size) return 0;
  const shared = overlap(lw, cw);
  if (!shared) return 0;
  let s = shared / Math.min(lw.size, cw.size);
  const k = kindOf(c);
  const want = leg.marketType;
  if (want === "spread" || want === "total" || want === "player_prop") {
    if (k !== want) return 0;
    const l = lineIn(c.title);
    if (leg.line !== null && l !== null && Math.abs(Math.abs(leg.line) - l) > 0.01) return 0;
    s += 0.2;
  } else if (want === "moneyline") {
    if (k === "spread" || k === "total" || k === "player_prop") return 0;
    s += k === "moneyline" ? 0.2 : 0;
  }
  // The slip's date against the market's close (games close the day of, or a day after).
  if (leg.date && c.closeTime) {
    const d = Date.parse(`${leg.date}T12:00:00Z`);
    if (Number.isFinite(d) && Math.abs(c.closeTime - d) > 4 * 86_400_000) return 0;
  } else if (c.closeTime && c.closeTime < now - 86_400_000) return 0;
  return Math.max(0, Math.min(1, s));
}

export const MATCH_MIN = 0.6;

/** The best market for the leg, or null when none scores MATCH_MIN. */
export function bestMatch(leg: Leg, list: readonly Candidate[], now: number): { c: Candidate; score: number } | null {
  let best: { c: Candidate; score: number } | null = null;
  for (const c of list) {
    const s = score(leg, c, now);
    if (s >= MATCH_MIN && (!best || s > best.score)) best = { c, score: s };
  }
  return best;
}

/** Which side of the market the slip is on: Over/Under for totals, the team for winners and lines, Yes/No for
 *  questions. Null when it can't be told. */
export function sideOf(leg: Leg, c: Candidate): "yes" | "no" | null {
  if (kindOf(c) === "total" || leg.overUnder) {
    const over = leg.overUnder ?? (/\bover\b/i.test(leg.selection) ? "over" : /\bunder\b/i.test(leg.selection) ? "under" : null);
    if (!over) return null;
    const yesIsOver = /^over\b/i.test(c.yesLabel) || !/^under\b/i.test(c.yesLabel);
    return (over === "over") === yesIsOver ? "yes" : "no";
  }
  if (/^yes$/i.test(leg.selection.trim())) return "yes";
  if (/^no$/i.test(leg.selection.trim())) return "no";
  const sw = words(leg.selection), y = overlap(sw, words(c.yesLabel)), n = overlap(sw, words(c.noLabel));
  if (y > n) return "yes";
  if (n > y) return "no";
  // "Will Arsenal win?" with the slip on Arsenal.
  if (/^yes$/i.test(c.yesLabel) && overlap(sw, words(c.title)) > 0) return "yes";
  return null;
}
