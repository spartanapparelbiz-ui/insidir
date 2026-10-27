/* The stat block (docs/BRIEF.md §4.8): a big mono number and one plain line. Hidden (renders nothing) when the value
 * is missing or below its meaningful threshold: never a 0, never a placeholder. */
import type { ReactNode } from "react";
import { RollNumber } from "@/components/ui/RollNumber";

export function StatBlock({ value, text, line, min = 1, live = false }: {
  /** The raw number, checked against `min`. */
  value: number | null | undefined;
  /** The number as shown ("41,203", "4.2 min"). */
  text: string;
  line: ReactNode;
  min?: number;
  /** Roll the digits when the value changes (client pages only). */
  live?: boolean;
}) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < min) return null;
  return (
    <div className="stat">
      <p className="stat__n">{live ? <RollNumber text={text} /> : text}</p>
      <p className="stat__line">{line}</p>
    </div>
  );
}
