/* /election: the top races as candidates, not just markets. For each major race with watchlist money this
 * week (lib/brand/pulse.ts electionBoard), its Polymarket event's candidate markets (lib/market/art.ts): the
 * candidate's name and party, the live price, the headshot Polymarket carries on that market (shown only when its file
 * names the candidate AND the race; otherwise initials), and the millionaire money on and against each candidate.
 * Control of a chamber shows parties, never a face. Visitors get the top 3 races whole; the rest locked. Server only. */
import { portraitOf, portraitSrc } from "@/lib/brand/people";
import type { Db } from "@/lib/db";
import { electionBoard, type Race } from "@/lib/brand/pulse";
import { marketMoney, type MarketMoney } from "@/lib/millionaires/queries";
import { artFor, eventMarkets, type MarketArt } from "./art";
import { headlineLines } from "./headline";
import { dollars } from "@/lib/money";

export interface Candidate { marketId: string; name: string; party: "D" | "R" | "I" | null; image: string | null; price: number | null; mil: { yes: number; no: number }; result: "won" | "lost" | null }
export interface RaceCard { key: string; title: string; kind: "control" | "race"; candidates: Candidate[]; total: number; fallback: Race | null }
export interface ElectionDay { races: RaceCard[]; locked: Array<{ title: string; total: number }>; at: number }

const mil = (m: MarketMoney | undefined) => ({ yes: m?.millionaire.yes.dollars ?? 0, no: m?.millionaire.no.dollars ?? 0 });

export async function electionDay(db: Db, now: number, member: boolean, settled = false): Promise<ElectionDay> {
  const board = await electionBoard(db, now, true, settled);
  const races = board.free;
  const art = await artFor(races.map(r => r.marketId)).catch(() => new Map<string, MarketArt>());
  // One card per event (several markets can belong to one race).
  const seen = new Set<string>(), picks: Array<{ race: Race; slug: string | null; event: string | null }> = [];
  for (const r of races) {
    const a = art.get(r.marketId), key = a?.eventSlug ?? r.marketId;
    if (seen.has(key)) continue;
    seen.add(key); picks.push({ race: r, slug: a?.eventSlug ?? null, event: a?.event ?? null });
  }
  const cards = await Promise.all(picks.map(async ({ race, slug, event }): Promise<RaceCard> => {
    const kind = /\b(control|balance of power|which party)\b/i.test(`${race.title} ${event ?? ""}`) ? "control" : "race";
    const markets = slug ? await eventMarkets(slug).catch(() => []) : [];
    // Polymarket's unpriced placeholder outcomes ("Person A", "Option A") are left out.
    const top = markets.filter(m => m.price !== null && !/^(party|person|option|candidate) [a-z]$/i.test((m.name ?? m.question).trim()) && !/\b(party|person|option) [A-Z]\b/.test(m.question)).sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 3);
    if (!top.length) return { key: race.marketId, title: race.title, kind, candidates: [], total: race.total, fallback: race };
    const money = new Map((await marketMoney(db, { marketIds: top.map(m => m.marketId), now }).catch(() => [])).map(m => [m.marketId, m]));
    const candidates = top.map(m => ({
      marketId: m.marketId,
      name: m.name ?? (m.question.replace(/^\d{4} Balance of Power:\s*/i, "").replace(/^Will (the )?/i, "").replace(/ (win|control).*$/i, "") || m.question),
      party: m.party ?? (/democrat/i.test(m.question) ? "D" : /republican/i.test(m.question) ? "R" : null),
      // The self-hosted, verified portrait (lib/brand/people.ts: same name, same state's race), at the 96px file.
      image: kind === "race" ? ((p => (p ? portraitSrc(p, 48) : null))(portraitOf(m.name, slug))) : null,
      price: m.price, mil: mil(money.get(m.marketId)),
      // Settled (closed) or priced as decided: the result.
      result: m.price !== null && (m.closed || m.price >= 0.97 || m.price <= 0.03) ? (m.price >= 0.5 ? "won" as const : "lost" as const) : null,
    }));
    return { key: slug ?? race.marketId, title: event ?? race.title, kind, candidates, total: race.total, fallback: null };
  }));
  // Members: control first, then races by money. Visitors' three free races: the biggest control market and the two
  // biggest head-to-head races (so they meet the candidates); the rest locked.
  const order = member ? cards : [...cards.filter(c => c.kind === "control").slice(0, 1), ...cards.filter(c => c.kind === "race" && c.candidates.length).slice(0, 2)];
  // Fill to three in board order when there are fewer head-to-head races with candidates.
  const free = member ? cards : [...order, ...cards.filter(c => !order.includes(c))].slice(0, 3);
  const rest = cards.filter(c => !free.includes(c));
  return { races: free, locked: [...rest.map(c => ({ title: c.title, total: c.total })), ...board.locked], at: now };
}

/** A race's short name: "Florida Governor Election Winner" → "Florida governor"; control of a chamber → "the House". */
export const raceName = (r: RaceCard) => r.title.replace(/ Election Winner$/, "")
  .replace(/^Which party will (win|control) the (House|Senate)( in \d{4}| after the \d{4} midterms)?\?$/, "the $2")
  .replace(/ Governor\b/, " governor");

export { headlineLines };

interface RaceLead {
  race: RaceCard; candidate: Candidate;
  /** What wallets did in that candidate's own market: bought Yes ("on") or No ("against"). Never inferred across
   *  candidates: a No on one candidate is not money on another. */
  side: "on" | "against";
  dollars: number;
  /** "Millionaires bet $5.9K against Byron Donalds." (two lines at most), and the line under it (race, price now). */
  headline: string; sub: string;
}

const partyName = (n: string) => n.replace(/^Democratic( Party)?$/, "Democrats").replace(/^Republican( Party)?$/, "Republicans").replace(/ Party$/, "s");

/** The card's own formatter (components/system/Races.tsx), so the headline's figure is the card's figure. */
const dollarsShort = (v: number) => dollars(v);

/** The page's headline, from what millionaire wallets actually did: the single largest position on or against one
 *  candidate (head-to-head races first, then control of a chamber), in that candidate's own market. The race card shows
 *  the same two numbers per candidate (mil.yes as "on", mil.no as "against"), so the headline and the card agree.
 *  Null without millionaire money. */
export function raceLead(d: ElectionDay): RaceLead | null {
  const acts = d.races.flatMap(r => r.candidates.flatMap(c => [
    { r, c, side: "on" as const, dollars: c.mil.yes },
    { r, c, side: "against" as const, dollars: c.mil.no },
  ])).filter(a => a.dollars > 0);
  const best = (kind: "race" | "control") => acts.filter(a => a.r.kind === kind).sort((x, y) => y.dollars - x.dollars)[0];
  const a = best("race") ?? best("control");
  if (!a) return null;
  const control = a.r.kind === "control";
  const full = control ? partyName(a.c.name) : a.c.name, last = full.split(/\s+/).at(-1)!;
  const amount = dollarsShort(a.dollars);
  const make = (who: string, tail: string) => `Millionaires bet ${amount} ${a.side} ${who}${tail}.`;
  const tail = control && a.side === "on" ? ` to win ${raceName(a.r)}` : "";
  // Two lines at most: the full name if it fits, else the last name, else without the chamber.
  let headline = make(full, tail);
  if (headlineLines(headline).length > 2) headline = make(last, tail);
  if (headlineLines(headline).length > 2) headline = make(last, "");
  const price = a.c.price !== null ? ` · ${control ? full : last} ${Math.round(a.c.price * 100)}¢ now` : "";
  const where = control ? `Control of ${raceName(a.r)}` : raceName(a.r);
  return { race: a.r, candidate: a.c, side: a.side, dollars: a.dollars, headline, sub: `${where}${price}.` };
}

/** A candidate's millionaire money as the race card says it: Yes bought on them is "on", No bought on them is
 *  "against". The headline (raceLead) reads the same two numbers. */
export function candidateMoney(c: Candidate): string {
  const { yes, no } = c.mil;
  if (yes > 0 && no > 0) return `Millionaires: ${dollars(yes)} on, ${dollars(no)} against`;
  if (yes > 0) return `Millionaires: ${dollars(yes)} on`;
  if (no > 0) return `Millionaires: ${dollars(no)} against`;
  return "No millionaire money yet";
}

/** The headline alone (the member home's election stage). */
export function raceInsight(d: ElectionDay): string | null { return raceLead(d)?.headline ?? null; }
