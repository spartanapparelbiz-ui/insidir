/* /board: the next section of the homepage, at full depth. A stage whose headline is computed from the money ("One
 * wallet up $11M put $290K on Hawks."), today's numbers, money by category as a stream, then every millionaire bet as a
 * written list (components/system/LiveBoard: no logos, Copy on the selected row only, green/red only on price change).
 * Members: live, every category. Visitors: 60 minutes late, sides locked, with the live count and Start for $1. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Insight, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { LiveBoard } from "@/components/system/LiveBoard";
import { Stream } from "@/components/system/Stream";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, category as categoryInfo, categoryPhoto, isCategory } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
import { getDb, hasDatabase } from "@/lib/db";
import { boardInsight, streamFor } from "@/lib/home/data";
import { BOARD_DELAY_MS, pulse, recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The board: millionaire bets, live", description: "Every bet of $5K+ by Polymarket wallets with $1M+ in all-time profit, as it happens." };

const EMPTY_PULSE = { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 };

export default async function Board({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan), now = Date.now();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  const db = hasDatabase() ? getDb() : null;
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("board", e instanceof Error ? e.message : e); return d; });
  const [p, bets, stream] = db ? await Promise.all([
    safe(pulse(db, now), null),
    safe(recentBets(db, { now, limit: member ? 40 : 30, member, tier: member ? "millionaire" : undefined, categories: cat ? [cat] : undefined, delayMs: member ? 0 : BOARD_DELAY_MS }), []),
    member ? safe(streamFor(db, now, cat ?? undefined), null) : Promise.resolve(null),
  ]) : [null, [] as BoardBet[], null] as const;
  const pl = p ?? EMPTY_PULSE;
  const stats = [
    pl.sinceMidnight > 0 ? `${dollars(pl.sinceMidnight)} bet by millionaires today` : null,
    pl.countToday > 0 ? `${pl.countToday} millionaire ${pl.countToday === 1 ? "bet" : "bets"} today` : null,
    pl.millionaires > 0 ? `${pl.millionaires} ${pl.millionaires === 1 ? "wallet" : "wallets"} up $1M+ watched` : null,
  ].filter(Boolean).join(" · ");
  const insight = member ? boardInsight(bets) : null;
  const photo = cat ? categoryPhoto(cat) : PHOTOS.baseball;
  return (
    <Frame member={member} current="board" testid="board">
      <Stage bg={{ kind: "photo", photo, dark: 0.6, priority: true }} first testid="board-band" labelledBy="board-h">
        <div className="b-head">
          <Insight id="board-h" text={insight} fallback={cat ? [categoryInfo(cat).name, "The board."] : ["The board."]} size={60} />
          <p className="b-sub" data-m="lift">Every bet of $5K+ from wallets up $1M+ all-time{cat ? ` in ${categoryInfo(cat).name}` : ""}, {member ? "live" : "60 minutes late"}.</p>
          {stats ? <p className="b-small b-center" data-testid="board-stats" data-m="lift">{stats}</p> : null}
        </div>
        {member ? (
          <>
            {stream ? <div className="s-col s-col--wide"><Stream data={stream} /></div> : null}
            <LiveBoard initial={[...bets]} now={now} n={40} cat={cat} links />
          </>
        ) : (
          <>
            <Panel className="s-col b-delay" testid="board-delay">
              <p className="s-strong"><span className="b-dot" aria-hidden="true" /> {pl.countToday > 0
                ? <>Live now: <span className="b-num" data-testid="board-live-count">{pl.countToday}</span> millionaire {pl.countToday === 1 ? "bet" : "bets"} today{pl.window === "hour" && pl.count > 0 ? <>, <span className="b-num">{pl.count}</span> in the last hour</> : null}.</>
                : pl.window === "hour" && pl.count > 0
                  ? <>Live now: <span className="b-num" data-testid="board-live-count">{pl.count}</span> millionaire {pl.count === 1 ? "bet" : "bets"} in the last hour.</>
                  : <>No millionaire bet yet today (since midnight ET).</>}</p>
              <p className="b-small">You&apos;re seeing them 60 minutes late. Members see every one the second it lands, with its side.</p>
              <div className="b-ctas"><Pill href="/go" data-testid="board-start" data-checkout="board">Start for $1</Pill></div>
            </Panel>
            <nav className="s-filters" aria-label="Category">
              <a className="b-btn b-panel-pill" aria-pressed={!cat} href="/board">All</a>
              {CATEGORIES.map(c => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={cat === c.slug} href={`/board?cat=${c.slug}`}>{c.name}</a>)}
            </nav>
            <LiveFeed initial={{ now, pulse: pl, bets: [...bets] }} n={30} cats={cat ? [cat] : []} board copy={false} />
          </>
        )}
        <p className="b-small b-center">Information, not advice.</p>
      </Stage>
      {member ? null : <PayMoments ctx={{ count: pl.count, window: pl.window, biggest: null }} now={now} />}
      <ScrollFx />
    </Frame>
  );
}
