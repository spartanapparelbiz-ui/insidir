/* The /go quiz's answers (pure): what they bet on, where, and their usual stake. Kept in a cookie for 7 days so a
 * visitor who leaves at the paywall comes back to their own picks, and saved as their categories once they've paid
 * (no second onboarding). Kalshi or a sportsbook means the US experience: Kalshi links only. */

export const GO_COOKIE = "insidir_go";
export const GO_DAYS = 7;

export const TOPICS = [
  ["elections", "Elections"], ["nfl", "NFL"], ["nba", "NBA"], ["cfb", "College football"], ["soccer", "Soccer"], ["economy", "Economy & the Fed"], ["other", "Other"],
] as const;
export type Topic = (typeof TOPICS)[number][0];
export const VENUES = [["kalshi", "Kalshi"], ["polymarket", "Polymarket"], ["sportsbook", "A sportsbook"], ["watch", "I just watch"]] as const;
export type GoVenue = (typeof VENUES)[number][0];
export const STAKES = [["lt25", "Under $25"], ["25-100", "$25–100"], ["100-500", "$100–500"], ["500+", "$500+"]] as const;
export type Stake = (typeof STAKES)[number][0];

export interface Answers { topics: Topic[]; venue: GoVenue | null; stake: Stake | null; at: number; /** "Remind me before I'm charged" (on by default). */ remind?: boolean }

const isTopic = (v: unknown): v is Topic => TOPICS.some(([k]) => k === v);
const isVenue = (v: unknown): v is GoVenue => VENUES.some(([k]) => k === v);
const isStake = (v: unknown): v is Stake => STAKES.some(([k]) => k === v);

/** The cookie, read defensively: anything unknown is dropped; older than GO_DAYS is gone. */
export function readAnswers(raw: string | null | undefined, now: number): Answers | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const at = Number(o.at);
    if (!Number.isFinite(at) || now - at > GO_DAYS * 86_400_000) return null;
    const topics = (Array.isArray(o.topics) ? o.topics : []).filter(isTopic);
    return { topics: [...new Set(topics)], venue: isVenue(o.venue) ? o.venue : null, stake: isStake(o.stake) ? o.stake : null, at, ...(o.remind === false ? { remind: false } : {}) };
  } catch { return null; }
}
export const writeAnswers = (a: Answers): string => encodeURIComponent(JSON.stringify(a));

/** Kalshi or a sportsbook: the US experience. */
export const usFromVenue = (v: GoVenue | null): boolean | null => (v === "kalshi" || v === "sportsbook" ? true : v === "polymarket" ? false : null);

/** The dollars the stake line uses: their usual bet's middle. */
export function stakeDollars(s: Stake | null): number {
  return s === "lt25" ? 10 : s === "100-500" ? 250 : s === "500+" ? 500 : 50;
}

/** Onboarding's categories (lib/read/member.ts BET_ON keys) from the quiz. */
export function betOnFromTopics(t: readonly Topic[]): string[] {
  const out = new Set<string>();
  for (const k of t) {
    if (k === "nfl" || k === "nba" || k === "cfb" || k === "soccer" || k === "elections" || k === "other") out.add(k);
    if (k === "economy") out.add("other");
  }
  return [...out];
}

/** The words for their picks: "NFL and the midterms", "NBA, Soccer and the midterms". */
export function topicWords(t: readonly Topic[]): string {
  const words = t.filter(k => k !== "other").map(k => (k === "elections" ? "the midterms" : k === "economy" ? "the Fed" : TOPICS.find(([x]) => x === k)![1]));
  if (!words.length) return "every market";
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** Does a bet belong to their picks? None picked (or Other alone): everything. */
export function matchesAnswers(b: { tab: string; league: string | null; category: string | null; title: string; event: string | null }, a: Pick<Answers, "topics">): boolean {
  const t = a.topics.filter(k => k !== "other");
  if (!t.length) return true;
  const text = `${b.event ?? ""} ${b.title}`;
  const league = (b.league ?? "").toLowerCase();
  for (const k of t) {
    if (k === "nfl" && b.tab === "sports" && league === "nfl") return true;
    if (k === "nba" && b.tab === "sports" && league === "nba") return true;
    if (k === "cfb" && b.tab === "sports" && /college football|ncaaf|cfb/.test(league)) return true;
    if (k === "soccer" && b.tab === "sports" && /soccer|premier|la liga|serie a|bundesliga|ligue 1|champions|mls|uefa|fifa/.test(league)) return true;
    if (k === "elections" && b.tab !== "sports" && (/politic|election/i.test(b.category ?? "") || /\b(senate|house|governor|election|midterm|president|democrat|republican)\b/i.test(text))) return true;
    if (k === "economy" && b.tab !== "sports" && (/econom|financ/i.test(b.category ?? "") || /\b(fed|fomc|rate|inflation|cpi|recession|gdp|jobs)\b/i.test(text))) return true;
  }
  return false;
}
