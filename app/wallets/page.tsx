/* /wallets (members): the next section of the homepage. A stage whose headline is computed from the records ("0xf031…c80c
 * made money on 10 of its last 10 closed bets."), then a card per millionaire wallet active today (else in the last 24
 * hours): all-time profit, the last 10 closed (made money / lost), today's money and biggest market, Follow (pings).
 * Short addresses only: never a face or a name. Visitors go to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, Pill, ScrollFx, Stage } from "@/components/system";
import { WalletCards } from "@/components/system/WalletCards";
import { getViewer } from "@/lib/auth/viewer";
import { PHOTOS } from "@/lib/brand/images";
import { getDb, hasDatabase } from "@/lib/db";
import { walletCards, walletsInsight, type WalletCard } from "@/lib/home/data";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallets: millionaires active today", robots: { index: false } };

export default async function Wallets() {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) redirect("/go");
  const now = Date.now();
  const { cards, today } = hasDatabase()
    ? await walletCards(getDb(), now, viewer.user?.id ?? null, 60).catch(e => { console.error("wallets", e instanceof Error ? e.message : e); return { cards: [] as WalletCard[], today: true }; })
    : { cards: [] as WalletCard[], today: true };
  return (
    <Frame member current="wallets" testid="wallets-page">
      <Stage bg={{ kind: "photo", photo: PHOTOS.cta, dark: 0.55, priority: true }} first testid="wallets-band" labelledBy="wallets-h">
        <div className="b-head">
          <Insight id="wallets-h" text={walletsInsight(cards)} fallback={["Wallets worth", "following."]} size={60} />
          <p className="b-sub" data-m="lift">Wallets up $1M+ all-time that bet {today ? "today" : "in the last 24 hours"}, by money bet. Follow one and we ping you when it bets.</p>
        </div>
        {cards.length ? <WalletCards wallets={cards} today={today} biggest testid="desk-leaders" />
          : <div className="b-center"><p className="b-empty">No millionaire wallet has bet in the last 24 hours yet.</p><div className="b-ctas"><Pill href="/board" kind="ghost">The latest bets</Pill></div></div>}
        <p className="b-small b-center">Short addresses only: Insidir never says who is behind a wallet. Information, not advice.</p>
      </Stage>
      <ScrollFx />
    </Frame>
  );
}
