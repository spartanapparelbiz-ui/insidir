/* /copies/yours: the millionaire bets a member logged with "I placed it" (one-tap copy v1), newest first. Each one
 * settles with its market at the member's own price: wins, losses and voids, and the running total. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { cents, Lines, signedDollars } from "@/components/brand/Bits";
import { Stage } from "@/components/brand/Stage";
import { requireMember } from "@/lib/auth/viewer";
import { yourCopies } from "@/lib/copies/tickets";
import { getDb } from "@/lib/db";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your copies", robots: { index: false } };

export default async function YourCopiesPage() {
  const viewer = await requireMember("/copies/yours");
  const now = Date.now();
  const c = viewer.user ? await yourCopies(getDb(), viewer.user.id).catch(() => null) : null;
  return (
    <Frame member current="copies" testid="your-copies">
      <Stage>
        <div className="b-head"><Lines as="h1" lines={["Your copies."]} size={56} /></div>
        <div className="b-glass b-pad" style={{ maxWidth: "min(100%, 820px)", margin: "0 auto", display: "grid", gap: 14 }}>
          {c && c.list.length ? (
            <>
              <div className="b-split" data-testid="copies-total">
                <div><span className="b-label">Settled</span><span className="b-big b-num">{c.settled}</span><span className="b-small">{c.won} won, {c.lost} lost · {c.open} open</span></div>
                <div><span className="b-label">Your P&amp;L</span><span className={`b-big b-num ${c.net >= 0 ? "b-up" : "b-down"}`} data-testid="copies-net">{signedDollars(c.net)}</span><span className="b-small">at your own prices</span></div>
              </div>
              <ul className="b-rows">{c.list.map(x => (
                <li key={x.id}><a className="b-row b-srow" href={`/copy/${encodeURIComponent(x.betId)}`} data-testid="your-copy" data-result={x.result ?? "open"}>
                  <span className="b-row__main"><span className="b-row__title">{x.title}</span>
                    <span className="b-row__meta"><span className="b-side">{x.outcome}</span><span>{dollars(x.amount)} at {cents(x.price)} on {x.venue === "kalshi" ? "Kalshi" : "Polymarket"}</span><span>{agoText(x.at, now)}</span></span></span>
                  {x.result === null ? <span className="b-res">Open</span>
                    : <span className={`b-res ${x.result === "won" ? "b-res--won" : x.result === "lost" ? "b-res--lost" : ""}`}>{x.result === "won" ? "Won" : x.result === "lost" ? "Lost" : "Void"} <span className="b-num">{signedDollars(x.pnl ?? 0)}</span></span>}
                </a></li>
              ))}</ul>
            </>
          ) : <p className="b-empty" data-testid="copies-empty">Nothing copied yet. Tap Copy on a bet on <a href="/board">the board</a> or in a ping, place it on Kalshi or Polymarket, then tap “I placed it”: it lands here and settles with the market.</p>}
          <p className="b-small">Logged by you; Insidir never places a bet or holds money. Past results, not a promise.</p>
        </div>
      </Stage>
    </Frame>
  );
}
