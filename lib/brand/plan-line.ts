/* The subscription block's one line, from lib/plans.ts (never typed in): "$1 · 3 DAYS → $39/MO · CANCEL ANYTIME".
 * Used by /pricing and /go's paywall. Pure. */
import { PLANS, TRIAL } from "@/lib/plans";

export const planLine = (): string => `$${TRIAL.fee} · ${TRIAL.days} DAYS → $${PLANS.insidir.price}/MO · CANCEL ANYTIME`;
