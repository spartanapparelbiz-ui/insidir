/* /copies/yours: the millionaire bets a member logged with "I placed it" (one-tap copy v1), newest first. Each one
 * settles with its market at the member's own price: wins, losses and voids, and the running total. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { cents, signedDollars } from "@/components/brand/Bits";
import { Insight, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { Rows } from "@/components/system/Figures";
import { PHOTOS } from "@/lib/brand/images";
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
  const insight = !c || !c.list.length ? null
    : c.settled ? `Your copies are ${c.net >= 0 ? "up" : "down"} ${dollars(Math.abs(c.net))} at your own prices.`
    : `You have ${c.open} open ${c.open === 1 ? "copy" : "copies"}.`;
  return (
    <Frame member current="copies" testid="your-copies">
      <Stage bg={{ kind: "photo", photo: PHOTOS.hero, dark: 0.55, priority: true }} first testid="copies-band" labelledBy="copies-h">
        <div className="b-head">
          <Insight id="copies-h" text={insight} fallback={["Your copies."]} size={56} />
          {c && c.list.length ? <p className="b-sub" data-m="lift" data-testid="copies-total">{c.settled ? <>{c.settled} settled ({c.won} won, {c.lost} lost) · net <b className="b-num" data-testid="copies-net">{signedDollars(c.net)}</b> at your own prices{c.open ? ` · ${c.open} open` : ""}.</> : <>{c.open} open; each settles with its market at your own price.</>}</p> : null}
        </div>
        {c && c.list.length ? (
          <Panel className="s-col s-col--wide">
            <Rows label="Your copies" rows={c.list.map(x => ({
              key: String(x.id), attrs: { "data-testid": "your-copy", "data-result": x.result ?? "open" },
              title: <a className="s-link" href={`/copy/${encodeURIComponent(x.betId)}`}>{x.title}</a>,
              sub: <><b>{x.outcome}</b> · {dollars(x.amount)} at {cents(x.price)} on {x.venue === "kalshi" ? "Kalshi" : "Polymarket"} · {agoText(x.at, now)}</>,
              right: x.result === null ? "Open" : `${x.result === "won" ? "Won" : x.result === "lost" ? "Lost" : "Void"} ${signedDollars(x.pnl ?? 0)}`,
            }))} />
          </Panel>
        ) : (
          <Panel className="s-col"><p className="b-small" data-testid="copies-empty">Nothing copied yet. Select a bet on the board or open a ping, tap Copy, place it on Kalshi or Polymarket, then tap “I placed it”: it lands here and settles with the market.</p><div className="b-ctas"><Pill href="/board">The board</Pill></div></Panel>
        )}
        <p className="b-small b-center">Logged by you; Insidir never places a bet or holds money. Past results, not a promise.</p>
      </Stage>
      <ScrollFx />
    </Frame>
  );
}
