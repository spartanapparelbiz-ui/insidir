/* /election: the Election Day board. Every major race (control of the Senate and House, the Senate and governor races)
 * with the watchlist's money on each side and the price, live, refreshed every minute. Visitors get the top 3 races
 * whole and unlock the rest with Start for $1; members see every race. Linked first in the nav until Nov 4 ET. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Pill } from "@/components/brand/Bits";
import { ElectionLive } from "@/components/brand/landing/ElectionLive";
import { PayMoments } from "@/components/brand/PayMoments";
import { Stage } from "@/components/brand/Stage";
import { getViewer } from "@/lib/auth/viewer";
import { electionBoard, electionDay, type ElectionBoard } from "@/lib/brand/pulse";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Election Day: every race, live", description: "Control of the Senate and House and the top Senate and governor races, with the money of Polymarket wallets up $1M+ on each side and the price, live." };

export default async function ElectionPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan), now = Date.now();
  const empty: ElectionBoard = { at: now, free: [], locked: [] };
  const board = hasDatabase() ? await electionBoard(getDb(), now, member).catch(() => empty) : empty;
  return (
    <Frame member={member} current="election" testid="election-page">
      <Stage>
        <div className="b-head"><Lines as="h1" lines={["Election Day.", "Every race, live."]} size={60} />
          <p className="b-sub" data-m="lift">{electionDay(now) ? "Where the money of wallets up $1M+ sits in every major race, and the price. Live, every minute." : "Election Day's major races and where the money of wallets up $1M+ sits, and the price."}</p></div>
        <ElectionLive initial={board} member={member} />
        {member ? null : <div className="b-center" style={{ marginTop: 22 }}><div className="b-ctas"><Pill href="/go" data-testid="election-start" data-checkout="election">Start for $1</Pill></div><p className="b-small" style={{ marginTop: 10 }}>Every race, with pings when a $1M+ wallet bets. $1 for 3 days.</p></div>}
      </Stage>
      {member ? null : <PayMoments ctx={{ count: 0, window: "day", biggest: null }} now={now} />}
    </Frame>
  );
}
