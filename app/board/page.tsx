/* /board: every millionaire bet, newest first: tier and profit, market, side, size, price then → now, time; category
 * filters. Members: live, in the Desk's flow table (components/desk/Flow.tsx), each with Copy (the copy ticket). Visitors: 60 minutes late (sides locked) with the live count
 * and Start for $1. */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Pill } from "@/components/brand/Bits";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { LiveFlow } from "@/components/desk/Flow";
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
        <div className="b-band" data-testid="board-band">
          <div className="b-head"><Lines as="h1" lines={["The board."]} size={56} /><p className="b-sub" data-m="lift">Every bet of $5K+ from wallets that made $1M+, live.</p></div>
          {/* Today's live numbers (read-only, the pulse): the money in gold, the words beside it. */}
          <div className="b-stats" data-testid="board-stats">
            <div className="b-stat"><span className="b-stat__n b-num">{initial.pulse.sinceMidnight > 0 ? dollars(initial.pulse.sinceMidnight) : "None yet"}</span><span className="b-small">bet by millionaires today</span></div>
            <div className="b-stat b-stat--plain"><span className="b-stat__n b-num">{initial.pulse.countToday}</span><span className="b-small">millionaire {initial.pulse.countToday === 1 ? "bet" : "bets"} today</span></div>
            <div className="b-stat b-stat--plain"><span className="b-stat__n b-num">{initial.pulse.millionaires}</span><span className="b-small">wallets up $1M+ watched</span></div>
          </div>
        </div>
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
        {/* Members: the Desk's flow table, full width (wallet, market, side, size, entry → now, Δ, Copy). Visitors: the
            delayed rows without sides. */}
        {member ? <div className="d-root d-root--board"><LiveFlow initial={initial.bets} now={now} cats={cat ? [cat] : []} initialEdge={null} chart={false} n={40} /></div>
          : <LiveFeed initial={initial} n={30} cats={cat ? [cat] : []} board copy={false} />}
      </Stage>
      {member ? null : <PayMoments ctx={{ count: initial.pulse.count, window: initial.pulse.window, biggest: null }} now={now} />}
    </Frame>
  );
}
