/* The briefing's paywall, on the server (nothing more is ever sent to a visitor, in HTML, RSC or JSON): members get
 * every line; everyone else gets the first line of each section. Before the market settles, the sections that say
 * which side a wallet or its money is on (who, playing, timing, read) give visitors their side-neutral line instead,
 * the same rule as the board and the market page (no side before it settles). Pure. */
import { SIDE_SECTIONS } from "./facts";
import type { Briefing } from "./store";

export interface GatedBriefing extends Omit<Briefing, "free"> { locked: boolean }

export function gateBriefing(b: Briefing, member: boolean): GatedBriefing {
  const { free, ...rest } = b;
  if (member) return { ...rest, locked: false };
  const settled = b.result !== null;
  return {
    ...rest,
    // A visitor's view never carries the viewer's own side either.
    side: settled ? b.side : null,
    locked: true,
    sections: b.sections.map(s => ({ ...s, lines: (!settled && SIDE_SECTIONS.has(s.key) ? [free[s.key] ?? ""] : s.lines.slice(0, 1)).filter(Boolean) })),
  };
}
