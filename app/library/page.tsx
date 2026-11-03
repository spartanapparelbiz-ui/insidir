/* /library: every bet a member has checked, newest first, each with the millionaire money on it now. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Lines } from "@/components/brand/Bits";
import { Stage } from "@/components/brand/Stage";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { marketMoney } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { yourMarkets } from "@/lib/read/member";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library", robots: { index: false } };

export default async function Library() {
  const viewer = await requireMember("/library");
  const db = getDb(), now = Date.now();
  const mine = viewer.user ? await yourMarkets(db, viewer.user.id, now, 60).catch(() => []) : [];
  const money = await marketMoney(db, { marketIds: mine.map(x => x.latest.data.polymarket?.id).filter((x): x is string => Boolean(x)), now }).catch(() => []);
  const by = new Map(money.map(m => [m.marketId, m]));
  return (
    <Frame member current="library" testid="library">
      <Stage>
        <div className="b-head"><Lines as="h1" lines={["Your checks."]} size={56} /></div>
        <div className="b-glass b-pad" data-m="settle">
          {mine.length ? <ul className="b-rows">{mine.map(x => {
            const m = by.get(x.latest.data.polymarket?.id ?? ""), mil = m ? m.millionaire.yes.dollars + m.millionaire.no.dollars : 0;
            return <li key={x.key}><a className="b-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} href={`/read/${x.latest.id}`}><span className="b-row__main"><span className="b-row__title">{x.latest.data.question}</span><span className="b-row__meta">checked {agoText(x.latest.createdAt, now)}</span></span><span className="b-row__money">{mil ? <><span className="b-row__size b-num">{dollars(mil)}</span><span className="b-small">millionaire money</span></> : <span className="b-small">No millionaire money yet</span>}</span></a></li>;
          })}</ul> : <p className="b-empty">Every bet you check stays here.</p>}
        </div>
      </Stage>
    </Frame>
  );
}
