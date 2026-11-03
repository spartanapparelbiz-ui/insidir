/* /board: every millionaire bet, newest first: tier and profit, market, side, size, price then → now, time; category
 * filters. Members: live, in the Desk's rows (components/desk/LiveRows.tsx), each with Copy (the copy ticket). Visitors: 60 minutes late (sides locked) with the live count
 * and Start for $1. */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { Pill } from "@/components/brand/Bits";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { LiveRows } from "@/components/desk/LiveRows";
import { PayMoments } from "@/components/brand/PayMoments";
import { Stage } from "@/components/brand/Stage";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { BOARD_DELAY_MS, pulse, recentBets } from "@/lib/millionaires/queries";
import { isPaid } from "@/lib/plans";
import { dollars } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The board: millionaire bets, live", description: "Every bet of $5K+ by Polymarket wallets with $1M+ in all-time profit, as it happens." };

export default async function Board({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan), now = Date.now();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  const db = hasDatabase() ? getDb() : null;
  const [p, bets] = db ? await Promise.all([pulse(db, now), recentBets(db, { now, limit: member ? 40 : 30, member, categories: cat ? [cat] : undefined, delayMs: member ? 0 : BOARD_DELAY_MS })]).catch(() => [null, []] as const) : [null, []] as const;
  const initial = { now, pulse: p ?? { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 }, bets: [...bets] };
  return (
    <Frame member={member} current="board" testid="board">
      <Stage className="b-stage--top">
        <header className="dk-page dk-head dk-boardhead" data-testid="board-band">
          <div>
            <h1 className="dk-h1">Board</h1>
            <p className="dk-lede">Every bet of $5K+ from wallets up $1M+ all-time, {member ? "live" : "60 minutes late"}.</p>
          </div>
          {/* Today's live numbers, only the ones that aren't zero. */}
          <p className="dk-lede dk-boardstats" data-testid="board-stats">{[
            initial.pulse.sinceMidnight > 0 ? `${dollars(initial.pulse.sinceMidnight)} bet by millionaires today` : null,
            initial.pulse.countToday > 0 ? `${initial.pulse.countToday} millionaire ${initial.pulse.countToday === 1 ? "bet" : "bets"} today` : null,
            initial.pulse.millionaires > 0 ? `${initial.pulse.millionaires} ${initial.pulse.millionaires === 1 ? "wallet" : "wallets"} up $1M+ watched` : null,
          ].filter(Boolean).join(" · ")}</p>
        </header>
        <div className="b-chips" style={{ marginBottom: 16 }}>
          <a className="b-btn b-panel-pill" aria-pressed={!cat} href="/board" data-m="settle" style={{ "--d": ".5s" } as CSSProperties}>All</a>
          {CATEGORIES.map((c, i) => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={cat === c.slug} href={`/board?cat=${c.slug}`} data-m="settle" style={{ "--d": `${0.5 + i * 0.02}s` } as CSSProperties}>{c.name}</a>)}
        </div>
        {member ? null : (
          <div className="b-glass b-pad b-delay" data-testid="board-delay" style={{ marginBottom: 14 }}>
            <p style={{ margin: 0, fontWeight: 500 }}><span className="b-dot" aria-hidden="true" /> Live now: <span className="b-num" data-testid="board-live-count">{initial.pulse.countToday}</span> millionaire {initial.pulse.countToday === 1 ? "bet" : "bets"} today{initial.pulse.window === "hour" ? <>, <span className="b-num">{initial.pulse.count}</span> in the last hour</> : null}.</p>
            <p className="b-small" style={{ margin: 0 }}>You&apos;re seeing them 60 minutes late. Members see every one the second it lands, with its side.</p>
            <Pill href="/go" data-testid="board-start" data-checkout="board">Start for $1</Pill>
          </div>
        )}
        {/* Members: the Desk's rows (components/desk/Parts.tsx BetRows), live. Visitors: the delayed rows without sides. */}
        {member ? <div className="dk-page dk-page--flush"><LiveRows initial={initial.bets} now={now} cats={cat ? [cat] : []} n={40} /></div>
          : <LiveFeed initial={initial} n={30} cats={cat ? [cat] : []} board copy={false} />}
      </Stage>
      {member ? null : <PayMoments ctx={{ count: initial.pulse.count, window: initial.pulse.window, biggest: null }} now={now} />}
    </Frame>
  );
}
