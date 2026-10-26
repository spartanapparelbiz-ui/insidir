/* Messages between the worker's main thread and the match thread. */
import type { MarketPair, VMarket, Venue } from "@/lib/types";

export type ToThread =
  /** New or changed markets (by match fingerprint) and removed ids for one venue. */
  | { type: "changes"; venue: Venue; upserts: VMarket[]; removed: string[] }
  /** Match over everything sent so far. */
  | { type: "run"; id: number };

export type FromThread = { type: "result"; id: number; ok: boolean; error?: string; pairs: MarketPair[]; log: string[] };
