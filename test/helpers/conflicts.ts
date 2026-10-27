/* Shared helpers for the matcher conflict tests. */
import { extractEntities } from "@/lib/matching/entities";
import { findCandidates, hardConflicts } from "@/lib/matching/candidates";
import type { VMarket } from "@/lib/types";

export { extractEntities, findCandidates };
export const hardConflictsFor = (a: VMarket, b: VMarket): string[] => hardConflicts(extractEntities(a), extractEntities(b));
