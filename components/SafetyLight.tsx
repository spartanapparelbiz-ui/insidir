import type { Safety } from "@/lib/types";
import { SAME_RULES } from "@/lib/simple";

/** "Same rules?" answered in one word, and what each answer means, in plain words. */
export const SAFETY_LABEL: Record<Safety, string> = SAME_RULES;
export const SAFETY_MEANING: Record<Safety, string> = {
  green: "Both apps pick the winner the same way: same game, same day, same source.",
  yellow: "The rules are a little different. Read both before you buy.",
  red: "The rules are different, so you could lose on both sides. We hide these unless you turn them on.",
};

/** Colour AND a word, never colour alone. `bare`: just the answer ("Yes"), for a column already headed "Same rules?". */
export function SafetyLight({ safety, long = false, bare = false }: { safety: Safety; long?: boolean; bare?: boolean }) {
  return (
    <span className={`light light--${safety}`} title={SAFETY_MEANING[safety]}>
      {bare ? "" : "Same rules? "}{SAFETY_LABEL[safety]}{long ? `. ${SAFETY_MEANING[safety]}` : ""}
    </span>
  );
}
