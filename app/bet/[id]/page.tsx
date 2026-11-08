/* One bet (/bet/<id>): the ticket. The wallet (its short address, never a name), the side, the size, their price
 * against the price now with the entry-vs-now chart, the result once it settles, then Copy (/copy/<id>) and the Kalshi
 * market first. Visitors: a bet under 60 minutes old waits, and the side is locked, as on the board. Shareable: its link
 * preview is a 1080×1350 card (./opengraph-image.tsx). Not advice. */
import type { Metadata } from "next";
import { Verify } from "@/components/brand/Verify";
import { verifyFor } from "@/lib/millionaires/queries";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { Crumbs, KalshiFirst, RelatedLinks } from "@/components/system/Entity";
import { EntryChart } from "@/components/system/Ticket";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo, categoryPhoto } from "@/lib/brand/categories";
import { ticketFor } from "@/lib/copies/tickets";
import { getDb, hasDatabase } from "@/lib/db";
import { edgeFor } from "@/lib/desk/edge";
import { twinOf } from "@/lib/entities/market";
import { betPath, marketPath, walletPath } from "@/lib/entities/slug";
import { PolymarketClient } from "@/lib/exchanges";
import { decidedText } from "@/lib/millionaires/decided";
import { VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { isPaid } from "@/lib/plans";
import { EntityLd } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";
let poly: PolymarketClient | null = null;
const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

async function head(id: string) {
  if (!hasDatabase()) return null;
  const r = await getDb().execute(sql`select wallet, market_title, amount, at, tier from terminal.millionaire_bets where id = ${id} limit 1`);
  // Never anything of a bet under 60 minutes old in its preview (visitors see the board an hour late).
  return (r.rows[0] as { wallet: string; market_title: string; amount: number; at: Date | string; tier: string } | undefined) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  const h = await head(id).catch(() => null);
  if (!h) return { title: "Bet", robots: { index: false } };
  if (Date.now() - new Date(h.at).getTime() < VISITOR_DELAY_MS) return { title: "A millionaire's bet", robots: { index: false } };
  const title = `${dollars(Number(h.amount))} on ${h.market_title}`;
  const description = `A wallet up ${h.tier === "millionaire" ? "$1M+" : "$100K+"} put ${dollars(Number(h.amount))} on "${h.market_title}". The side, their price and the Kalshi price: live for members.`;
  return { title: { absolute: `${title} · Insidir` }, description, alternates: { canonical: betPath(id) }, openGraph: { title, description } };
}

export default async function BetPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: raw }, viewer] = await Promise.all([params, getViewer()]);
  if (!hasDatabase()) notFound();
  const id = decodeURIComponent(raw), db = getDb(), now = Date.now();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const [t, h] = await Promise.all([ticketFor(db, id, viewer.region).catch(() => null), head(id).catch(() => null)]);
  if (!t || !h) notFound();
  const fresh = now - t.at < VISITOR_DELAY_MS;
  if (!member && fresh) {
    return (
      <Frame member={false} current="board" testid="bet-page">
        <Stage bg={{ kind: "photo", photo: categoryPhoto(t.category), dark: 0.55, priority: true }} first testid="bet-ticket" labelledBy="bet-h">
          <div className="b-head">
            <Lines as="h1" id="bet-h" lines={["A bet from the last hour."]} size={56} />
            <p className="b-sub" data-testid="bet-fresh">Visitors see bets 60 minutes late. Members see each one, and its side, the second it lands.</p>
          </div>
          <div className="b-ctas"><Pill href="/go" data-testid="bet-start" data-checkout="bet">Start for $1</Pill><Pill href="/board" kind="ghost">The board</Pill></div>
        </Stage>
      </Frame>
    );
  }
  const [edge, twins, others] = await Promise.all([
    member ? edgeFor(db, (poly ??= new PolymarketClient()), t.betId, now).catch(() => null) : Promise.resolve(null),
    twinOf(db, [t.marketId]).catch(() => new Map()),
    db.execute(sql`select id, market_title, amount, at from terminal.millionaire_bets where wallet = ${h.wallet} and id <> ${id} and at <= ${new Date(now - (member ? 0 : VISITOR_DELAY_MS))} order by at desc limit 5`).catch(() => ({ rows: [] })),
  ]);
  const twin = twins.get(t.marketId) ?? null;
  const market = marketPath(t.marketId, h.market_title);
  const cat = categoryInfo(t.category);
  const trail = [["Board", "/board"], [t.title, market], [`${dollars(t.amount)} bet`, betPath(id)]] as const;
  const move = t.priceNow !== null ? t.priceNow - t.theirPrice : null;
  const result = t.settled === "won" ? `${t.outcome} won: this bet won.` : t.settled === "lost" ? "This bet lost." : t.settled === "void" ? "Voided: refunded." : null;
  return (
    <Frame member={member} current="board" testid="bet-page">
      <Stage bg={{ kind: "photo", photo: categoryPhoto(t.category), dark: 0.55, priority: true }} first testid="bet-ticket" labelledBy="bet-h">
        <div className="b-head">
          <Crumbs trail={trail} />
          <p className="b-label" data-m="lift">{cat.name} · {t.tier === "millionaire" ? "Wallet up $1M+" : "Wallet up $100K+"}</p>
          <Lines as="h1" id="bet-h" lines={[`${dollars(t.amount)} on ${t.title}`]} size={t.title.length > 36 ? 40 : 56} />
          <p className="b-sub" data-m="lift" data-testid="bet-who">
            {member ? <a className="s-link" href={walletPath(h.wallet)} data-entity="wallet">{t.short}</a> : t.short}
            {t.pnl !== null ? <>, <b>{signed(t.pnl)} all-time</b></> : null}{t.record ? `, ${t.record.won} won and ${t.record.lost} lost` : ""}, {agoText(t.at, now)}.
          </p>
        </div>
        {member ? (
          <Panel className="s-col s-ticket" testid="bet-side">
            <div className="s-ticket__px">
              <span><span className="b-small">They bought {t.outcome} at</span><br /><span className="s-big b-num" data-testid="bet-their">{cents(t.theirPrice)}</span></span>
              <span><span className="b-small">Polymarket now</span><br /><span className="s-big b-num" data-testid="bet-now">{t.priceNow !== null ? cents(t.priceNow) : "No price"}</span>
                {move !== null && Math.abs(move) >= 0.005 ? <><br /><span className={`b-small ${move > 0 ? "s-up" : "s-down"}`}>{move > 0 ? "up" : "down"} {Math.round(Math.abs(move) * 100)}¢ since</span></> : null}</span>
            </div>
            {edge ? <EntryChart edge={edge} /> : null}
            {t.decided ? <p className="b-msg" data-testid="bet-settled">{decidedText(t.decided, t.outcome)}.</p> : <div className="b-ctas"><Pill href={`/copy/${encodeURIComponent(id)}`} data-testid="bet-copy">Copy this bet</Pill></div>}
          </Panel>
        ) : (
          <Panel className="s-col" testid="bet-locked">
            <p className="b-small" data-locked="side">Members see which side they took, their price, and the bet on Kalshi.</p>
            <div className="b-ctas"><Pill href="/go" data-testid="bet-start" data-checkout="bet">Start for $1</Pill></div>
          </Panel>
        )}
        <p className="b-small b-center" style={{ marginTop: 12 }}><Verify v={verifyFor(t.verify, member, Boolean(t.settled))} marketId={t.marketId} polymarket={viewer.region === "non_us"} /></p>
        <div className="s-col">
          <KalshiFirst twin={twin} yesLabel={member ? t.outcome : "Yes"} noLabel="the other side" polyYes={member ? t.priceNow : null} polyUrl={null} region={viewer.region} result={result} testid="bet-kalshi" />
        </div>
        <p className="b-small b-center">Information, not advice. Millionaires lose bets too. Insidir never places a bet or holds money.</p>
      </Stage>
      <Stage bg={{ kind: "globe", dark: 0.7 }} testid="bet-related" labelledBy="bet-rel-h">
        <div className="b-head"><Lines as="h2" id="bet-rel-h" lines={["The market, and this wallet's other bets."]} size={44} /></div>
        <Panel className="s-col">
          <RelatedLinks kind="market" items={[{ href: market, title: t.title, sub: "every bet on it" }]} testid="bet-market" />
          <RelatedLinks kind="bet" items={(others.rows as Array<{ id: string; market_title: string; amount: number }>).map(o => ({ href: betPath(o.id), title: o.market_title, sub: dollars(Number(o.amount)) }))} testid="bet-others" />
        </Panel>
      </Stage>
      <EntityLd trail={trail.map(([a, b]) => [a, b] as [string, string])} name={`${dollars(t.amount)} on ${t.title}`} path={betPath(id)} description={`A bet from a wallet up ${t.tier === "millionaire" ? "$1M+" : "$100K+"} on "${t.title}".`} sources={["https://kalshi.com"]} />
      <ScrollFx />
    </Frame>
  );
}
