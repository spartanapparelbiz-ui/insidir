/* /copy/<bet id>: the copy ticket (one-tap copy v1). A ping or a board row's "Copy" opens it: the bet, the wallet's
 * tier and record, their price against the price now, the Desk's price chart, the member's amount, Open on Kalshi (US) / Polymarket, and
 * "I placed it" to log it. Visitors see the bet without its side and a Start for $1. Insidir never places trades. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Pill } from "@/components/brand/Bits";
import { cents, MarketName, PriceChart, Wallet } from "@/components/desk/Parts";
import { edgeFor } from "@/lib/desk/edge";
import { PolymarketClient } from "@/lib/exchanges";
import { CopyAction } from "@/components/brand/CopyTicket";
import { decidedText } from "@/lib/millionaires/decided";
import { getViewer } from "@/lib/auth/viewer";
import { copySizeOf } from "@/lib/copies/size";
import { hasCopied, ticketFor } from "@/lib/copies/tickets";
import { getDb, hasDatabase } from "@/lib/db";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copy this bet", robots: { index: false } };
let poly: PolymarketClient | null = null;

export default async function CopyPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (!hasDatabase()) notFound();
  const db = getDb(), member = Boolean(viewer.user) && isPaid(viewer.plan), now = Date.now();
  const t = await ticketFor(db, decodeURIComponent(id), viewer.region).catch(() => null);
  if (!t) notFound();
  const logged = member && viewer.user ? await hasCopied(db, viewer.user.id, t.betId).catch(() => false) : false;
  const move = t.priceNow !== null ? t.priceNow - t.theirPrice : null;
  // The same chart as the Desk: their entries on this side, the price now (lib/desk/edge.ts).
  const edge = member ? await edgeFor(db, (poly ??= new PolymarketClient()), t.betId, now).catch(() => null) : null;
  return (
    <Frame member={member} current="board" testid="copy-ticket">
      <div className="dk-page dk-ticket">
        <p className="dk-kicker">Copy this bet</p>
        <h1 className="dk-h2" data-testid="copy-title"><MarketName title={t.title} category={t.category} /></h1>
        <p className="dk-meta"><Wallet short={t.short} pnl={t.pnl} tier={t.tier} /> · {dollars(t.amount)} · {agoText(t.at, now)}{t.record ? ` · record: ${t.record.won} won, ${t.record.lost} lost` : ""}</p>
        {member ? (
          <>
            <div className="dk-ticket__px">
              <div><span className="dk-dim">They bought {t.outcome} at</span><span className="dk-h1x dk-num" data-testid="copy-their">{cents(t.theirPrice)}</span></div>
              <div><span className="dk-dim">Now {t.open?.venue === "kalshi" ? "on Kalshi" : "on Polymarket"}</span><span className="dk-h1x dk-num" data-testid="copy-now">{t.yourPrice !== null ? cents(t.yourPrice) : t.priceNow !== null ? cents(t.priceNow) : "No price"}</span>
                {move !== null && Math.abs(move) >= 0.005 ? <span className={move > 0 ? "dk-up" : "dk-down"}>{move > 0 ? "up" : "down"} {Math.round(Math.abs(move) * 100)}¢ since</span> : null}</div>
            </div>
            {edge ? <PriceChart edge={edge} height={200} /> : null}
            <div className="dk-ticket__act">
              {t.decided ? <p className="b-msg" data-testid="copy-settled">{decidedText(t.decided, t.outcome)}. Nothing left to copy.</p>
                : <CopyAction betId={t.betId} open={t.open} defaultAmount={copySizeOf(viewer.user?.settings)} logged={logged} />}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="b-lockrow" data-locked="copy"><span className="b-label">Their side<span className="b-sr">: which side they took and the copy ticket are for members. Start for $1.</span></span><span className="b-blur" aria-hidden="true">Xxxxx at 00¢</span><span className="b-lock" aria-hidden="true">Locked</span></button>
            <div className="b-ctas"><Pill href="/go" data-testid="copy-start" data-checkout="copy">Start for $1</Pill></div>
          </>
        )}
        <p className="dk-fine">Information, not advice. Millionaires lose bets too.</p>
      </div>
    </Frame>
  );
}
