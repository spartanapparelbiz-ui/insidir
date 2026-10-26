import type { Safety } from "@/lib/types";

/** What each light tells you, in plain words. */
export const SAFETY_LABEL: Record<Safety, string> = { green: "Same rules", yellow: "Check rules", red: "Skip" };
export const SAFETY_MEANING: Record<Safety, string> = {
  green: "Both apps settle this the same way: same event, same date, same source.",
  yellow: "Small differences in the rules. Read both before you buy.",
  red: "The rules differ, so both sides could lose. Hidden unless you turn it on.",
};

/** Colour AND a text label, never colour alone. */
export function SafetyLight({ safety, long = false }: { safety: Safety; long?: boolean }) {
  return <span className={`light light--${safety}`} title={SAFETY_MEANING[safety]}>{SAFETY_LABEL[safety]}{long ? `: ${SAFETY_MEANING[safety]}` : ""}</span>;
}
