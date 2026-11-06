/* Request bodies for /api/filings, checked on the server (the browser's own checks are a convenience only). */
import { z } from "zod";
import { LIMITS } from "./limits";

const cik = z.string().regex(/^\d{1,10}$/).transform(s => String(Number(s)));
const ticker = z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,10}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite();

export const WatchlistsBody = z.object({
  lists: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(LIMITS.listName),
    items: z.array(z.object({ cik, ticker })).max(LIMITS.perList),
  })).max(LIMITS.lists),
});

const Note = z.object({
  id: z.string().min(1).max(40),
  body: z.string().max(LIMITS.noteChars),
  anchor: z.object({ kind: z.enum(["filing", "anomaly"]), ref: z.string().max(80), label: z.string().max(200), url: z.string().url().max(300) }).nullable(),
  pinned: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  revisions: z.array(z.object({ body: z.string().max(LIMITS.noteChars), at: z.number().int().nonnegative() })).max(LIMITS.noteRevisions).optional(),
});

export const JournalBody = z.object({
  ticker,
  status: z.enum(["researching", "watching", "passed"]).nullable(),
  reason: z.string().trim().max(LIMITS.reason).nullable(),
  notes: z.array(Note).max(LIMITS.notesPerCompany),
  version: z.number().int().nonnegative(),
}).refine(j => JSON.stringify(j.notes).length <= LIMITS.journalBytes, { message: "This company's journal is full. Delete old notes or revisions." });

const Position = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["equity", "event"]),
  tickers: z.array(ticker).max(10),
  venue: z.enum(["kalshi", "polymarket", "other"]).nullable(),
  label: z.string().trim().max(200).nullable(),
  side: z.enum(["long", "short", "yes", "no"]),
  quantity: money.positive(),
  entryPrice: money.positive(),
  entryDate: date,
  fees: money.nonnegative(),
  exitPrice: money.positive().nullable(),
  resolution: z.enum(["yes", "no", "void"]).nullable(),
  closedOn: date.nullable(),
  note: z.string().max(2_000),
}).refine(p => (p.kind === "equity" ? (p.side === "long" || p.side === "short") && p.tickers.length === 1 : (p.side === "yes" || p.side === "no") && p.entryPrice < 1 && Boolean(p.label)),
  { message: "Position fields don't match its kind." });

export const PositionsBody = z.object({ positions: z.array(Position).max(LIMITS.positions), version: z.number().int().nonnegative() });
export const SeenBody = z.object({ id: z.number().int().nonnegative() });
export const AckBody = z.object({ version: z.number().int().positive() });
export const CikParam = cik;
export const TickerParam = ticker;
