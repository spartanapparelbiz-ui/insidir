import type { Safety } from "@/lib/types";

/** The "Same rules?" answer, in one word (docs/BRIEF.md §4.6): Yes (check), Check (alert), No (x). */
export const SAFETY_LABEL: Record<Safety, string> = { green: "Yes", yellow: "Check", red: "No" };
export const SAFETY_MEANING: Record<Safety, string> = {
  green: "Both apps settle this the same way: same event, same date, same source.",
  yellow: "Small differences in the rules. Read both before you buy.",
  red: "The rules differ, so both sides could lose. Hidden from the feed unless you turn it on.",
};

/** A check, an alert or an x: the badge's shape says it too, so colour is never the only signal. */
const ICON: Record<Safety, string> = {
  green: "M3.5 8.2 6.6 11.2 12.5 4.8",
  yellow: "M8 4v5M8 11.6v.1",
  red: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

export function SafetyIcon({ safety }: { safety: Safety }) {
  return (
    <svg className="light__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={ICON[safety]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The "Same rules?" badge: icon + word, never colour alone. "Same rules? Yes" by default; `bare` drops the question
 *  (under a "Same rules" column header); `long` adds the meaning. For the tappable version with both rule texts, see
 *  components/sig/SameRules. */
export function SafetyLight({ safety, long = false, bare = false }: { safety: Safety; long?: boolean; bare?: boolean }) {
  return (
    <span className={`light light--${safety}`} title={SAFETY_MEANING[safety]}>
      <SafetyIcon safety={safety} />
      {bare ? null : <span className="light__q">Same rules?</span>}
      {SAFETY_LABEL[safety]}{long ? `: ${SAFETY_MEANING[safety]}` : ""}
    </span>
  );
}
