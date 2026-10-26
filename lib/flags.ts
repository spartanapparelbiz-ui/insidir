/* Feature flags read by both services. Ladder deals stay off (not scanned, not shown, not alerted, kept out of the
 * public log) unless LADDERS_ENABLED=1: their subject matching produced false implications and must be rebuilt and
 * hand-checked first. */
import type { OppKind } from "./types";

export const laddersEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => env.LADDERS_ENABLED === "1";

/** Kinds that must never reach users right now. */
export const hiddenKinds = (env: Readonly<Record<string, string | undefined>> = process.env): OppKind[] => (laddersEnabled(env) ? [] : ["ladder"]);
