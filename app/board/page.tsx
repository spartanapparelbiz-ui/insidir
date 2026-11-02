/* /board: every millionaire bet, live (sides for members; locked for visitors), filterable by category. */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { Lines } from "@/components/brand/Bits";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Stage } from "@/components/brand/Stage";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { pulse, recentBets } from "@/lib/millionaires/queries";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The board: millionaire bets, live", description: "Every bet of $5K+ by Polymarket wallets with $1M+ in all-time profit, as it happens." };

export default async function Board({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan), now = Date.now();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  const db = hasDatabase() ? getDb() : null;
  const [p, bets] = db ? await Promise.all([pulse(db, now), recentBets(db, { now, limit: 30, member, categories: cat ? [cat] : undefined })]).catch(() => [null, []] as const) : [null, []] as const;
  const initial = { now, pulse: p ?? { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0 }, bets: [...bets] };
  return (
    <Frame member={member} current="board" testid="board">
      <Stage>
        <div className="b-head"><Lines as="h1" lines={["The board."]} size={56} /><p className="b-sub" data-m="lift">Every bet of $5K+ from wallets that made $1M+, live.</p></div>
        <div className="b-chips" style={{ marginBottom: 16 }}>
          <a className="b-btn b-panel-pill" aria-pressed={!cat} href="/board" data-m="settle" style={{ "--d": ".5s" } as CSSProperties}>All</a>
          {CATEGORIES.map((c, i) => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={cat === c.slug} href={`/board?cat=${c.slug}`} data-m="settle" style={{ "--d": `${0.5 + i * 0.02}s` } as CSSProperties}>{c.name}</a>)}
        </div>
        <LiveFeed initial={initial} n={30} cats={cat ? [cat] : []} />
      </Stage>
      {member ? null : <PayMoments ctx={{ count: initial.pulse.count, window: initial.pulse.window, biggest: null }} now={now} />}
    </Frame>
  );
}
