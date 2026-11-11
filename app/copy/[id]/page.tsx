/* /copy/<bet id>: the copy ticket (one-tap copy v1). A ping or a board row's "Copy" opens it: the bet, the wallet's
 * tier and record, their price against the price now, the entry-vs-now chart, the member's amount, Open on Kalshi (US) / Polymarket, and
 * "I placed it" to log it. Visitors see the bet without its side and a Start for $1. Insidir never places trades. */
import type { Metadata } from "next";
import { Verify } from "@/components/brand/Verify";
import { verifyFor } from "@/lib/millionaires/queries";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { EntryChart } from "@/components/system/Ticket";
import { categoryPhoto } from "@/lib/brand/categories";
import { edgeFor } from "@/lib/desk/edge";
import { PolymarketClient } from "@/lib/exchanges";
import { CopyAction } from "@/components/brand/CopyTicket";
import { decidedText } from "@/lib/millionaires/decided";
import { getViewer } from "@/lib/auth/viewer";
import { copySizeOf } from "@/lib/copies/size";
import { copyRow, ticketFor } from "@/lib/copies/tickets";
import { matchedSize, sizeLine, SIZE_LABEL, validCopySettings } from "@/lib/copies/sizing";
import { getDb, hasDatabase } from "@/lib/db";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copy this bet", robots: { index: false } };
let poly: PolymarketClient | null = null;
const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);

export default async function CopyPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (!hasDatabase()) notFound();
  const db = getDb(), member = Boolean(viewer.user) && isPaid(viewer.plan), now = Date.now();
  const t = await ticketFor(db, decodeURIComponent(id), viewer.region).catch(() => null);
  if (!t) notFound();
  const logged = member && viewer.user ? await copyRow(db, viewer.user.id, t.betId).catch(() => null) : null;
  // Your size: the same share of your bankroll as the wallet put in of its own, never over your max.
  const mine = validCopySettings(viewer.user?.settings?.copy ?? null);
  const size = matchedSize(t.amount, t.walletBankroll, mine);
  const move = t.priceNow !== null ? t.priceNow - t.theirPrice : null;
  // The same chart as the Desk: their entries on this side, the price now (lib/desk/edge.ts).
  const edge = member ? await edgeFor(db, (poly ??= new PolymarketClient()), t.betId, now).catch(() => null) : null;
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
  return (
    <Frame member={member} current="board" testid="copy-page">
      <Stage bg={{ kind: "photo", photo: categoryPhoto(t.category), dark: 0.55, priority: true }} first testid="copy-ticket" labelledBy="copy-title">
        <div className="b-head">
          <p className="b-label" data-m="lift">Copy this bet</p>
          <Lines as="h1" id="copy-title" testid="copy-title" lines={[t.title]} size={t.title.length > 40 ? 40 : 56} />
          <p className="b-sub" data-m="lift">{t.short}{t.pnl !== null ? <>, <b>{signed(t.pnl)} all-time</b></> : null}, put {dollars(t.amount)} on it {agoText(t.at, now)}{t.record ? `. Their record: ${t.record.won} won, ${t.record.lost} lost` : ""}.</p>
        </div>
        {member ? (
          <Panel className="s-col s-ticket">
            <div className="s-ticket__px">
              <span><span className="b-small">They bought {t.outcome} at</span><br /><span className="s-big b-num" data-testid="copy-their">{cents(t.theirPrice)}</span></span>
              <span><span className="b-small">Now {t.open?.venue === "kalshi" ? "on Kalshi" : "on Polymarket"}</span><br /><span className="s-big b-num" data-testid="copy-now">{t.yourPrice !== null ? cents(t.yourPrice) : t.priceNow !== null ? cents(t.priceNow) : "No price"}</span>
                {move !== null && Math.abs(move) >= 0.005 ? <><br /><span className={`b-small ${move > 0 ? "s-up" : "s-down"}`}>{move > 0 ? "up" : "down"} {Math.round(Math.abs(move) * 100)}¢ since</span></> : null}</span>
            </div>
            {edge ? <EntryChart edge={edge} /> : null}
            {t.decided ? <p className="b-msg" data-testid="copy-settled">{decidedText(t.decided, t.outcome)}. Nothing left to copy.</p>
              : <>
                {size ? <p className="cp-size" data-testid="copy-size"><b>{sizeLine(size)}</b> <span className="b-small">{SIZE_LABEL[0]!.toUpperCase() + SIZE_LABEL.slice(1)}.</span></p>
                  : mine ? <p className="b-small" data-testid="copy-size-none">We don&apos;t have this wallet&apos;s bankroll yet, so there&apos;s no matched size: enter your own.</p>
                  : <p className="b-small" data-testid="copy-size-setup"><a href="/settings#copy">Set your bankroll and max per trade</a> to get a matched size on every alert.</p>}
                <CopyAction betId={t.betId} outcome={t.outcome} prices={t.prices} links={t.links} best={t.best} defaultAmount={size?.yours ?? Math.min(copySizeOf(viewer.user?.settings), mine?.maxTrade ?? Infinity)}
                  sizeNote={size ? `${sizeLine(size)} ${SIZE_LABEL[0]!.toUpperCase() + SIZE_LABEL.slice(1)}.` : null} logged={logged} />
              </>}
          </Panel>
        ) : (
          <Panel className="s-col">
            <p className="b-small" data-locked="copy">Members see which side they took and get the finished bet on Kalshi.</p>
            <div className="b-ctas"><Pill href="/go" data-testid="copy-start" data-checkout="copy">Start for $1</Pill></div>
          </Panel>
        )}
        <p className="b-small b-center" style={{ marginTop: 12 }}><Verify v={verifyFor(t.verify, member, Boolean(t.settled))} marketId={t.marketId} polymarket={viewer.region === "non_us"} /></p>
        <p className="b-small b-center">Information, not advice. Millionaires lose bets too. Insidir never places a bet or holds money.</p>
      </Stage>
      <ScrollFx />
    </Frame>
  );
}
