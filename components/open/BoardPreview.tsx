/* The landing page's board preview: the real rows (60 minutes late for visitors) appearing one by one with Magic UI's
 * AnimatedList; all at once under reduced motion. */
import { AnimatedList } from "@/components/magicui/animated-list";
import { BoardItem } from "@/components/millionaire/BoardList";
import type { BoardRow } from "@/lib/millionaire/board";

export function BoardPreview({ rows, now }: { rows: readonly BoardRow[]; now: number }) {
  // Oldest first in, so the newest lands on top last.
  const ordered = [...rows].reverse();
  return (
    <div className="op-board op-card op-edge" data-testid="board-preview">
      <AnimatedList delay={1400}>{ordered.map(r => <BoardItem key={r.id} r={r} now={now} />)}</AnimatedList>
    </div>
  );
}
