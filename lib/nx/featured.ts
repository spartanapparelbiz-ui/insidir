/* The home page's "Read, as an answer" (server only): the featured market (lib/nx/data.ts featuredMarket: until the
 * polls close, the election market with the most proven money; after, the busiest) read now and saved as a Read (input
 * "refresh", nobody's). Tonight's top market comes first: the busiest one starting within the day with proven money, so its card has a real link and share image. Its line is the template written from its own facts
 * (lib/read/math.ts): no model call for visitors. Built at most every 5 minutes; a render that would wait more than
 * `waitMs` skips the section this time (the build carries on and the next render has it). */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { readFacts, templateLine } from "@/lib/read/math";
import { cachedRead, saveRead } from "@/lib/read/store";
import type { ReadData } from "@/lib/read/types";
import { tonightReads } from "@/lib/read/tonight";
import { featuredMarket, type Clients, type MarketCard } from "./data";

export interface Featured { id: string; card: Pick<MarketCard, "venue" | "id" | "title" | "event">; data: ReadData; positions: number; at: number }

export const FEATURED_MS = 5 * 60_000;

export async function featuredRead(db: Db, clients: Clients, now: number, waitMs = 2_500): Promise<Featured | null> {
  const job = memo("nx:featured", FEATURED_MS, async (): Promise<Featured | null> => {
    // Tonight's top market (starts within the day, with proven money; lib/read/tonight.ts), else the featured one.
    const t = (await tonightReads(db, now, 1).catch(() => []))[0];
    const card: Featured["card"] | null = t ? { venue: t.venue, id: t.id, title: t.title, event: t.event } : await featuredMarket(db, now);
    if (!card) return null;
    const base = await cachedRead(db, clients, card.venue, card.id, now);
    const data: ReadData = { ...base, line: { text: templateLine(readFacts(base)), origin: "template", model: "template" } };
    const id = await saveRead(db, { userId: null, visitorId: null, input: "refresh", data, ms: 0, question: card.event && card.event.length <= 40 ? card.event : card.title }, now);
    const positions = base.big ? base.big.yes.positions + base.big.no.positions : 0;
    return { id, card, data, positions, at: base.at };
  });
  return Promise.race([job.catch(() => null), new Promise<null>(ok => setTimeout(() => ok(null), waitMs))]);
}
