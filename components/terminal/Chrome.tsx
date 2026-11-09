/* The terminal's chrome, on every brand page (Frame, Shell, the landing, /login): the top bar (components/brand/Nav.tsx
 * BrandNav: mark, command line, ET clock, status light), the ticker tape (real data, lib/terminal/ticker.ts), the
 * function-key bar, and the status bar along the bottom (desktop; on phones its words close the footer). Server. */
import type { ComponentProps } from "react";
import { BrandNav } from "@/components/brand/Nav";
import { tickerNow } from "@/lib/terminal/ticker";
import { FKeys } from "./FKeys";
import { fetchedText } from "./Panel";
import { TickerTape } from "./Ticker";

export async function TerminalChrome(props: ComponentProps<typeof BrandNav>) {
  const ticker = await tickerNow();
  return (
    <>
      <div className="t-chrome" data-testid="t-chrome">
        <BrandNav {...props} />
        <TickerTape ticker={ticker} />
        <FKeys />
      </div>
      <StatusBar asOf={ticker.fetchedAt} />
    </>
  );
}

/** "INSIDIR TERMINAL · POLYMARKET + KALSHI · ALL TIMES ET · DATA AS OF …" left, "INFORMATION, NOT ADVICE · 18+" right. */
export function StatusBar({ asOf }: { asOf: number }) {
  return (
    <div className="t-statusbar" data-testid="t-statusbar" role="contentinfo" aria-label="Status">
      <span>INSIDIR TERMINAL · POLYMARKET + KALSHI · ALL TIMES ET · DATA AS OF {fetchedText(asOf).replace("FETCHED ", "")}</span>
      <span>INFORMATION, NOT ADVICE · 18+</span>
    </div>
  );
}
