/* /wallets (members): every wallet up $1M+ Insidir watches. The count and four numbers (watched, proven, active in
 * 24 hours, money this week), the wallets active today as cards (all-time profit, the last 10 closed, today's money,
 * Follow), then the leaderboard (components/system/WalletBoard.tsx, lib/millionaires/leaderboard.ts): filter, sort,
 * each wallet's record against the price it pays, this week's money, its latest bet and Follow; the constellation last.
 * Short addresses only: never a face or a name. Visitors go to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, ScrollFx, Stage } from "@/components/system";
import { WalletBoard } from "@/components/system/WalletBoard";
import { leaderboard } from "@/lib/millionaires/leaderboard";
import { PAST } from "@/lib/brand/copy";
import { dollars } from "@/lib/money";
import { WalletCards } from "@/components/system/WalletCards";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { constellation, walletCards, walletsInsight, type WalletCard } from "@/lib/home/data";
import { midnightET } from "@/lib/millionaires/queries";
import { Constellation } from "@/components/system/Constellation";
import { isPaid } from "@/lib/plans";
import { verifiedBoard, verifiedCount } from "@/lib/verified/board";
import { VerifiedBoard } from "@/components/system/VerifiedBoard";
import { MIN_SETTLED, MAX_ONE_SHARE } from "@/lib/verified/checks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallets: millionaires active today", robots: { index: false } };

export default async function Wallets() {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) redirect("/go");
  const now = Date.now();
  const db = hasDatabase() ? getDb() : null;
  const userId = viewer.user?.id ?? null;
  const [vrows, vcount] = await Promise.all([
    db ? verifiedBoard(db, { userId }).catch(() => []) : Promise.resolve([]),
    db ? verifiedCount(db).catch(() => ({ verified: 0, checked: 0 })) : Promise.resolve({ verified: 0, checked: 0 }),
  ]);
  const [{ cards, today }, board, sky] = await Promise.all([
    db ? walletCards(db, now, userId, 6).catch(e => { console.error("wallets", e instanceof Error ? e.message : e); return { cards: [] as WalletCard[], today: true }; }) : Promise.resolve({ cards: [] as WalletCard[], today: true }),
    db ? leaderboard(db, now, userId).catch(e => { console.error("leaderboard", e instanceof Error ? e.message : e); return null; }) : Promise.resolve(null),
    db ? constellation(db, midnightET(now)).catch(() => null) : Promise.resolve(null),
  ]);
  const s = board?.summary;
  const skyLine = sky?.shared ? `${sky.shared.wallets} wallets up $1M+ trade ${sky.shared.title}${sky.shared.same ? ", all on the same side" : ", on both sides"}.` : null;
  return (
    <Frame member current="wallets" testid="wallets-page">
      <Stage first testid="wallets-band" labelledBy="wallets-h">
        <div className="b-head">
          <h1 id="wallets-h" className="b-h1">Who to copy.</h1>
          <p className="b-sub" data-testid="verified-count">{vcount.checked ? `${vcount.verified} of ${vcount.checked} wallets up $1M+ pass every test today.` : "Every wallet up $1M+, reviewed daily."} Verified means {MIN_SETTLED}+ settled trades, profitable in 2 of the last 3 months, no single trade over {Math.round(MAX_ONE_SHARE * 100)}% of its profit, and no hedging. {PAST}</p>
        </div>
        <VerifiedBoard rows={vrows} member />
        {s ? (
          <div className={`b-stats ${s.proven > 0 ? "b-stats--4" : "b-stats--3"}`} data-testid="wallets-stats">
            <div className="b-stat"><span className="b-stat__n b-num">{s.wallets}</span><span className="b-small">wallets up $1M+ watched</span></div>
            {s.proven > 0 ? <div className="b-stat"><span className="b-stat__n b-num">{s.proven}</span><span className="b-small">proven: 30+ settled, real pickers</span></div> : null}
            <div className="b-stat"><span className="b-stat__n b-num">{s.activeToday}</span><span className="b-small">traded in the last 24 hours</span></div>
            <div className="b-stat"><span className="b-stat__n b-num">{dollars(s.weekMoney)}</span><span className="b-small">traded by millionaires this week</span></div>
          </div>
        ) : null}
      </Stage>
      {cards.length ? (
        <Stage testid="wallets-active" labelledBy="active-h">
          <div className="b-head"><h2 id="active-h" className="b-h2">{walletsInsight(cards) ?? `Active ${today ? "today" : "in the last 24 hours"}.`}</h2>
            <p className="b-sub">The millionaire wallets that trade {today ? "today" : "in the last 24 hours"}, by money bet.</p></div>
          <WalletCards wallets={cards} today={today} biggest testid="desk-leaders" />
        </Stage>
      ) : null}
      <Stage testid="wallets-board" labelledBy="board-h">
        <div className="b-head"><h2 id="board-h" className="b-h2">The leaderboard.</h2>
          <p className="b-sub">Win rate against the average price paid: a wallet that wins 60% of bets it buys at 45¢ is picking well; one that wins 60% at 70¢ isn&apos;t.</p></div>
        {board?.rows.length ? <WalletBoard rows={board.rows} now={now} /> : <p className="b-empty">The watchlist refreshes hourly; it shows here once it has.</p>}
        <p className="b-small" style={{ marginTop: 16 }}>Short addresses only: Insidir never says who is behind a wallet. Information, not advice.</p>
      </Stage>
      {sky && sky.stars.length >= 3 ? (
        <Stage testid="wallets-sky" labelledBy="sky-h">
          <div className="b-head"><Insight id="sky-h" as="h2" text={skyLine} fallback={["Where the money", "meets."]} size={52} />
            <p className="b-sub">Every millionaire wallet that trade today, as a constellation. Tap a star for its wallet.</p></div>
          <Constellation data={sky} />
        </Stage>
      ) : null}
      <ScrollFx />
    </Frame>
  );
}
