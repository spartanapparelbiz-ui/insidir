/* /copy/<bet id>: the copy ticket (one-tap copy v1). A ping or a board row's "Copy" opens it: the bet, the wallet's
 * tier and record, their price against the price now, the member's amount, Open on Kalshi (US) / Polymarket, and
 * "I placed it" to log it. Visitors see the bet without its side and a Start for $1. Insidir never places trades. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { cents, Lines, Pill, signedDollars, TierBadge } from "@/components/brand/Bits";
import { CopyAction } from "@/components/brand/CopyTicket";
import { Stage } from "@/components/brand/Stage";
import { getViewer } from "@/lib/auth/viewer";
import { copySizeOf } from "@/lib/copies/size";
import { hasCopied, ticketFor } from "@/lib/copies/tickets";
import { getDb, hasDatabase } from "@/lib/db";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copy this bet", robots: { index: false } };

export default async function CopyPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (!hasDatabase()) notFound();
  const db = getDb(), member = Boolean(viewer.user) && isPaid(viewer.plan), now = Date.now();
  const t = await ticketFor(db, decodeURIComponent(id), viewer.region).catch(() => null);
  if (!t) notFound();
  const logged = member && viewer.user ? await hasCopied(db, viewer.user.id, t.betId).catch(() => false) : false;
  const move = t.priceNow !== null ? t.priceNow - t.theirPrice : null;
  return (
    <Frame member={member} current="board" testid="copy-ticket">
      <Stage>
        <div className="b-head"><Lines as="h1" lines={["Copy this bet."]} size={52} /></div>
        <div className="b-glass b-pad" style={{ maxWidth: "min(100%, 560px)", margin: "0 auto", display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="b-row__meta"><TierBadge tier={t.tier} /><span>{t.short}</span>{t.pnl !== null ? <span className="b-up">{signedDollars(t.pnl)} all-time</span> : null}</span>
            <h2 className="b-read__q" data-testid="copy-title">{t.title}</h2>
            <span className="b-small">{dollars(t.amount)} · {agoText(t.at, now)}{t.record ? ` · record: ${t.record.won} won, ${t.record.lost} lost` : ""}</span>
          </div>
          {member ? (
            <>
              <div className="b-split">
                <div><span className="b-label">They bought {t.outcome} at</span><span className="b-big b-num" data-testid="copy-their">{cents(t.theirPrice)}</span><span className="b-small">their price</span></div>
                <div><span className="b-label">Now</span><span className="b-big b-num" data-testid="copy-now">{t.yourPrice !== null ? cents(t.yourPrice) : t.priceNow !== null ? cents(t.priceNow) : "No price"}</span>
                  <span className="b-small">{t.open?.venue === "kalshi" ? "on Kalshi" : "on Polymarket"}{move !== null && Math.abs(move) >= 0.005 ? ` · ${move > 0 ? "up" : "down"} ${Math.round(Math.abs(move) * 100)}¢ since` : ""}</span></div>
              </div>
              {t.settled ? <p className="b-msg" data-testid="copy-settled">This market has settled: {t.settled === "won" ? `${t.outcome} won` : t.settled === "lost" ? `${t.outcome} lost` : "void"}.</p>
                : <CopyAction betId={t.betId} open={t.open} defaultAmount={copySizeOf(viewer.user?.settings)} logged={logged} />}
            </>
          ) : (
            <>
              <button type="button" className="b-lockrow" data-locked="copy" aria-label="Which side they took and the copy ticket are for members: start for $1"><span className="b-label">Their side</span><span className="b-blur" aria-hidden="true">Xxxxx at 00¢</span><span className="b-lock" aria-hidden="true">Locked</span></button>
              <div className="b-ctas"><Pill href="/go" data-testid="copy-start" data-checkout="copy">Start for $1</Pill></div>
            </>
          )}
          <p className="b-small">Information, not advice. Millionaires lose bets too.</p>
        </div>
      </Stage>
    </Frame>
  );
}
