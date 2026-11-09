/* /ask: Ask Insidir, on the terminal. A question about the big money, a market or your own bet, answered only from
 * Insidir's data, with the rows behind it; "I don't have that." when the data doesn't have it (lib/ask/run.ts). ?q= (the
 * top bar's command line sends questions here) is filled in and asked once on load. Information, not advice. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { ASK_EXAMPLES } from "@/lib/ask/run";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { AskBox } from "./AskBox";
import "../brief.css";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask Insidir",
  description: "Ask about the $1M+ wallets, a market or your own bet. Answers come only from Insidir's data. Information, not advice.",
  alternates: { canonical: "/ask" },
};

export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 300) : "";
  return (
    <Frame member={member} current="home" testid="ask-page">
      <div className="t-wrap tg-page">
        <header className="tg-head" data-testid="ask-hero">
          <h1 className="tg-h1" id="ask-h">Ask Insidir.</h1>
          <p className="tg-sub">Ask about the $1M+ wallets, a market or your own bet. Answers come only from our data, with the rows behind them. If we don&apos;t have it, we say so.</p>
        </header>
        <PanelGrid>
          <Panel n={1} title="Ask · Insidir data only" meta={member ? "Live" : "60 min late · 3 free a day"} span={3} testid="ask-panel" source="Insidir data">
            <AskBox examples={ASK_EXAMPLES} member={member} initial={q} />
          </Panel>
        </PanelGrid>
        <p className="bf-foot tg-note">Information, not advice. We show what moved and when, never why. {member ? "" : "Visitors see the board 60 minutes late, without open sides. "}<a href="/record">Every position we&apos;ve flagged, losses included</a>.</p>
      </div>
    </Frame>
  );
}
