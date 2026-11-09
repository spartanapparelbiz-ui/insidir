/* The ticker tape: one slowly scrolling line of real data (lib/terminal/ticker.ts). Pauses on hover; static under
 * prefers-reduced-motion (app/terminal.css). The line is drawn twice so the scroll loops without a gap; the copy is
 * hidden from screen readers. */
import type { Ticker as T, TickerItem } from "@/lib/terminal/ticker";

const ARROW: Record<NonNullable<TickerItem["dir"]>, string> = { up: "▲", down: "▼", flat: "■" };

function Item({ it }: { it: TickerItem }) {
  if (it.kind === "market") {
    return (
      <span className="t-tick">
        <span className="t-tick__name">{it.text.toUpperCase()}</span>
        {it.price !== null && it.price !== undefined ? <span className="t-tick__px">YES {Math.round(it.price * 100)}¢</span> : <span className="t-tick__px">—</span>}
        <span className={`t-tick__dir t-${it.dir ?? "flat"}`} aria-label={it.dir === "up" ? "up" : it.dir === "down" ? "down" : "unchanged"}>{ARROW[it.dir ?? "flat"]}</span>
      </span>
    );
  }
  return <span className={`t-tick t-tick--${it.kind}`}>{it.text.toUpperCase()}</span>;
}

export function TickerTape({ ticker }: { ticker: T }) {
  if (!ticker.items.length) return <div className="t-tape t-tape--empty" data-testid="t-tape"><span className="t-tick">NO $1M+ WALLET BETS YET TODAY (ET)</span></div>;
  return (
    <div className="t-tape" data-testid="t-tape" aria-label="Ticker">
      <div className="t-tape__track">
        <div className="t-tape__run">{ticker.items.map((it, i) => <Item key={i} it={it} />)}</div>
        <div className="t-tape__run" aria-hidden="true">{ticker.items.map((it, i) => <Item key={i} it={it} />)}</div>
      </div>
    </div>
  );
}
