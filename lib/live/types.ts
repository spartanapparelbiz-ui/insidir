/* The live pipe's event shapes. The worker stores raw events (lib/live/publish.ts); the stream sends each viewer the
 * version their plan and region allow (lib/live/view.ts). Shared by server and browser: no server imports here. */
import type { FeedRow } from "@/lib/feed";
import type { Opportunity, Safety, Side, Venue, WhaleTrade } from "@/lib/types";

export type LiveEventType = "deal_found" | "deal_closed" | "price_tick" | "whale";

/* ---------- what the worker stores (never sent as is) ---------- */

export interface RawDealFound { opp: Opportunity; firstSeenAt: number }
export interface RawDealClosed { title: string; kind: Opportunity["kind"]; safety: Safety; roi: number; firstSeenAt: number; closedAt: number; lifeMs: number }
export interface RawPriceTick {
  legs: Array<{ venue: Venue; side: Side; avgPrice: number }>;
  roi: number; profit: number; profitPerDay: number; cost: number; fees: number; sets: number;
  firstSeenAt: number;
}
export type RawWhale = WhaleTrade;

export interface RawLiveEvent {
  id: number;
  type: LiveEventType;
  oppId: string | null;
  venues: Venue[];
  data: RawDealFound | RawDealClosed | RawPriceTick | RawWhale;
  at: number;
}

/* ---------- what a viewer receives ---------- */

export interface LiveDealFound { row: FeedRow }
export interface LiveDealClosed { title: string; safety: Safety; roi: number; firstSeenAt: number; closedAt: number; lifeMs: number }
export interface LivePriceTick {
  legs: Array<{ venue: Venue; side: Side; priceCents: number }>;
  roi: number;
  /** Paid plans only; null for free viewers. */
  profit: number | null; profitPerDay: number | null; cost: number | null; fees: number | null; sets: number | null;
}
export interface LiveWhale { side: string; outcome: string; marketTitle: string; cash: number; url: string }

export type LiveEvent =
  | { id: number; type: "deal_found"; at: number; oppId: string; data: LiveDealFound }
  | { id: number; type: "deal_closed"; at: number; oppId: string; data: LiveDealClosed }
  | { id: number; type: "price_tick"; at: number; oppId: string; data: LivePriceTick }
  | { id: number; type: "whale"; at: number; oppId: null; data: LiveWhale };

/** Sent every couple of seconds: the scanner's real state. */
export interface LiveStatus { live: boolean; paused: Venue[]; lastScanAt: number | null; serverNow: number }

/** Sent once when the stream opens. */
export interface LiveHello { serverNow: number; delayMs: number; plan: "free" | "insidir" | "pro" }
