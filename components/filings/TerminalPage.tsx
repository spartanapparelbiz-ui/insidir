/* The page frame for the terminal: the brand root (so the logo renders exactly as on every other page), the "view as
 * visitor" switch free-access accounts use, the terminal at full viewport, and the site footer below the fold. */
import { BrandFoot } from "@/components/brand/Nav";
import { ViewAs } from "@/components/ViewAs";
import { Terminal, type View } from "./Terminal";

export function TerminalPage(props: { initialView?: View; company?: { cik: string; ticker: string; title: string }; noteFor?: string | null }) {
  return (
    <>
      <ViewAs />
      <main className="b-root b-app" data-testid="filings-page">
        <Terminal {...props} />
        <div className="fl-sitefoot"><BrandFoot inline /></div>
      </main>
    </>
  );
}
