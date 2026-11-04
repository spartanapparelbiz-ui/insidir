/* The reasons a member can give when they cancel (one is required). Pure. */
export const CANCEL_REASONS = [
  ["price", "Too expensive"],
  ["unused", "I don't use it enough"],
  ["not_useful", "The data wasn't useful to me"],
  ["missing", "Missing a market or feature I need"],
  ["other", "Something else"],
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number][0];
export const isCancelReason = (v: unknown): v is CancelReason => CANCEL_REASONS.some(([k]) => k === v);
export const reasonLabel = (k: CancelReason): string => CANCEL_REASONS.find(([x]) => x === k)![1];
