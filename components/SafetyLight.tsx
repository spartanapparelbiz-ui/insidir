import type { Safety } from "@/lib/types";

/** What each light tells you, in plain words. */
export const SAFETY_LABEL: Record<Safety, string> = { green: "Same rules", yellow: "Check rules", red: "Skip" };
export const SAFETY_MEANING: Record<Safety, string> = {
  green: "Both apps settle this the same way: same event, same date, same source.",
  yellow: "Small differences in the rules. Read both before you buy.",
  red: "The rules differ, so both sides could lose. Hidden unless you turn it on.",
};

/** A check, an alert or an x: the badge's shape says it too, so colour is never the only signal. */
const ICON: Record<Safety, string> = {
  green: "M3.5 8.2 6.6 11.2 12.5 4.8",
  yellow: "M8 4v5M8 11.6v.1",
  red: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

/** The "Same rules?" badge: a small coloured icon (check / alert / x) and a text label, never colour alone. */
export function SafetyLight({ safety, long = false }: { safety: Safety; long?: boolean }) {
  return (
    <span className={`light light--${safety}`} title={SAFETY_MEANING[safety]}>
      <svg className="light__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d={ICON[safety]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {SAFETY_LABEL[safety]}{long ? `: ${SAFETY_MEANING[safety]}` : ""}
    </span>
  );
}
