import type { Safety } from "@/lib/types";

export const SAFETY_LABEL: Record<Safety, string> = { green: "Green", yellow: "Yellow", red: "Red" };
export const SAFETY_MEANING: Record<Safety, string> = {
  green: "Same event, same date, same resolution source",
  yellow: "Minor differences in the rules: read them",
  red: "The rules differ: hidden by default",
};

/** Colour AND a text label, never colour alone. */
export function SafetyLight({ safety, long = false }: { safety: Safety; long?: boolean }) {
  return <span className={`light light--${safety}`} title={SAFETY_MEANING[safety]}>{SAFETY_LABEL[safety]}{long ? `: ${SAFETY_MEANING[safety]}` : ""}</span>;
}
