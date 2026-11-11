/* /ask: Ask Insidir. A question about the big money, a market or your own bet, answered only from Insidir's data, with
 * the rows behind it; "I don't have that." when the data doesn't have it (lib/ask/run.ts). Information, not advice. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Stage } from "@/components/system";
import { ASK_EXAMPLES } from "@/lib/ask/run";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { AskBox } from "./AskBox";
import "../brief.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask Insidir",
  description: "Ask about the $1M+ wallets, a market or your own trade. Answers come only from Insidir's data. Information, not advice.",
  alternates: { canonical: "/ask" },
};

export default async function AskPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  return (
    <Frame member={member} current="home" testid="ask-page">
      <Stage first testid="ask-hero" labelledBy="ask-h">
        <div className="b-head">
          <Lines as="h1" id="ask-h" lines={["Ask Insidir."]} size={56} />
          <p className="b-sub">Ask about the $1M+ wallets, a market or your own bet. Answers come only from our data, with the rows behind them. If we don&apos;t have it, we say so.</p>
        </div>
        <AskBox examples={ASK_EXAMPLES} member={member} />
        <p className="bf-foot">Information, not advice. We show what moved and when, never why. {member ? "" : "Visitors see the board 60 minutes late, without open sides. "}<a href="/record">Every position we&apos;ve flagged, losses included</a>.</p>
      </Stage>
    </Frame>
  );
}
