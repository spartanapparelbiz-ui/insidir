/* /election: the top races as candidates, not just markets. For each major race with watchlist money this
 * week (lib/brand/pulse.ts electionBoard), its Polymarket event's candidate markets (lib/market/art.ts): the
 * candidate's name and party, the live price, the headshot Polymarket carries on that market (shown only when its file
 * names the candidate AND the race; otherwise initials), and the millionaire money on and against each candidate.
 * Control of a chamber shows parties, never a face. Visitors get the top 3 races whole; the rest locked. Server only. */
import type { Db } from "@/lib/db";
import { electionBoard, type Race } from "@/lib/brand/pulse";
import { marketMoney, type MarketMoney } from "@/lib/millionaires/queries";
import { artFor, eventMarkets, verifiedHeadshot, type MarketArt } from "./art";

export interface Candidate { marketId: string; name: string; party: "D" | "R" | "I" | null; image: string | null; price: number | null; mil: { yes: number; no: number }; result: "won" | "lost" | null }
export interface RaceCard { key: string; title: string; kind: "control" | "race"; candidates: Candidate[]; total: number; fallback: Race | null }
export interface ElectionDay { races: RaceCard[]; locked: Array<{ title: string; total: number }>; at: number }

const mil = (m: MarketMoney | undefined) => ({ yes: m?.millionaire.yes.dollars ?? 0, no: m?.millionaire.no.dollars ?? 0 });

export async function electionDay(db: Db, now: number, member: boolean): Promise<ElectionDay> {
  const board = await electionBoard(db, now, true);
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
      image: kind === "race" && verifiedHeadshot(m.image, m.name, event) ? m.image : null,
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

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const raceName = (r: RaceCard) => r.title.replace(/ Election Winner$/, "").replace(/^Which party will win the (House|Senate) in \d{4}\?$/, "the $1");

/** The page's headline, computed. Money for a candidate is money on them plus money against their rivals; the race
 *  where millionaires lean hardest (head-to-head races first, then control of a chamber) becomes the sentence:
 *  "Millionaires are 100% on Ken Paxton in Texas Senate. The price says 26¢." Null without millionaire money. */
export function raceInsight(d: ElectionDay): string | null {
  const scored = d.races.flatMap(r => r.candidates.map(c => {
    const rivals = r.candidates.filter(x => x !== c);
    const forC = c.mil.yes + rivals.reduce((s, x) => s + x.mil.no, 0), against = c.mil.no + rivals.reduce((s, x) => s + x.mil.yes, 0);
    return { r, c, forC, total: forC + against };
  })).filter(x => x.forC > 0 && x.total > 0);
  const pick = (kind: "race" | "control") => scored.filter(x => x.r.kind === kind).sort((a, b) => b.forC - a.forC)[0];
  const top = pick("race") ?? pick("control");
  if (!top) return null;
  const share = Math.round((top.forC / top.total) * 100);
  const who = top.r.kind === "control" ? `the ${top.c.name.replace(/ Party$/, "s").replace(/^Democratics$/, "Democrats").replace(/^Republicans?$/, "Republicans")}` : top.c.name;
  const where = top.r.kind === "control" ? raceName(top.r).replace(/^the /, "to win the ") : `in ${raceName(top.r)}`;
  return `Millionaires are ${share}% on ${who} ${where}.${top.c.price !== null ? ` The price says ${Math.round(top.c.price * 100)}¢.` : ""}`;
}
