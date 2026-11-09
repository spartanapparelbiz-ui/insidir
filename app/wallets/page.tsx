/* /wallets (members): every wallet up $1M+ Insidir watches, in the terminal. A page head, the four numbers (watched,
 * proven, active in 24 hours, money this week) as KPIs, the wallets active today (components/system/WalletCards: all-time
 * profit, the last 10 closed, today's money, Follow), the leaderboard (components/system/WalletBoard.tsx,
 * lib/millionaires/leaderboard.ts): filter, sort, each wallet's record against the price it pays, this week's money, its
 * latest bet and Follow; the constellation last. Short addresses only: never a face or a name. Visitors go to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, ScrollFx } from "@/components/system";
import { TermHead } from "@/components/system/Entity";
import { WalletBoard } from "@/components/system/WalletBoard";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
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
import "../pages-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallets: millionaires active today", robots: { index: false } };

const SOURCE = "Polymarket public data (leaderboard, positions and trades)";

export default async function Wallets() {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) redirect("/go");
  const now = Date.now();
  const db = hasDatabase() ? getDb() : null;
  const userId = viewer.user?.id ?? null;
  const [{ cards, today }, board, sky] = await Promise.all([
    db ? walletCards(db, now, userId, 6).catch(e => { console.error("wallets", e instanceof Error ? e.message : e); return { cards: [] as WalletCard[], today: true }; }) : Promise.resolve({ cards: [] as WalletCard[], today: true }),
    db ? leaderboard(db, now, userId).catch(e => { console.error("leaderboard", e instanceof Error ? e.message : e); return null; }) : Promise.resolve(null),
    db ? constellation(db, midnightET(now)).catch(() => null) : Promise.resolve(null),
  ]);
  const s = board?.summary;
  const skyLine = sky?.shared ? `${sky.shared.wallets} wallets up $1M+ bet ${sky.shared.title}${sky.shared.same ? ", all on the same side" : ", on both sides"}.` : null;
  return (
    <Frame member current="wallets" testid="wallets-page">
      <div className="t-wrap t-page">
        <TermHead id="wallets-h" testid="wallets-band" title={s ? `${s.wallets} wallets up $1M+. Follow the ones that win.` : "Wallets worth following."}
          sub={<>Every Polymarket wallet up $1M+ all-time that Insidir watches: its record, what it&apos;s betting now, and a ping when it bets again. {PAST}</>} />
        <PanelGrid>
          <TPanel n={1} title="Watchlist" meta="ALL TIMES ET" span={3} compact empty={s ? null : "The watchlist refreshes hourly; its numbers show here once it has."}>
            {s ? (
              <dl className="t-kpis" data-testid="wallets-stats">
                <div className="b-stat"><dt className="t-label">Wallets up $1M+ watched</dt><dd className="t-kpi b-num b-stat__n">{s.wallets}</dd></div>
                <div className="b-stat"><dt className="t-label">Proven: 30+ settled, real pickers</dt><dd className="t-kpi b-num b-stat__n">{s.proven}</dd></div>
                <div className="b-stat"><dt className="t-label">Bet in the last 24 hours</dt><dd className="t-kpi b-num b-stat__n">{s.activeToday}</dd></div>
                <div className="b-stat"><dt className="t-label">Bet by millionaires this week</dt><dd className="t-kpi b-num b-stat__n">{dollars(s.weekMoney)}</dd></div>
              </dl>
            ) : null}
          </TPanel>
          <TPanel n={2} title={`Active ${today ? "today" : "in the last 24 hours"}`} meta={`${cards.length} WALLETS · BY MONEY BET`} span={3} compact source={SOURCE} fetchedAt={now} testid="wallets-active"
            empty={cards.length ? null : `No millionaire wallet has bet ${today ? "today" : "in the last 24 hours"} yet.`}>
            <p className="t-panel__lead">{walletsInsight(cards) ?? `The millionaire wallets that bet ${today ? "today" : "in the last 24 hours"}, by money bet.`}</p>
            <WalletCards wallets={cards} today={today} biggest testid="desk-leaders" />
          </TPanel>
          <TPanel n={3} title="Leaderboard" meta={board?.rows.length ? `${board.rows.length} WALLETS` : undefined} span={3} compact source={SOURCE} fetchedAt={now} testid="wallets-board"
            empty={board?.rows.length ? null : "The watchlist refreshes hourly; it shows here once it has."}>
            <p className="t-panel__lead" id="board-h">Record against the average price paid: a wallet that wins 60% of bets it buys at 45¢ is picking well; one that wins 60% at 70¢ isn&apos;t.</p>
            {board?.rows.length ? <WalletBoard rows={board.rows} now={now} /> : null}
            <p className="t-panel__lead t-muted">Short addresses only: Insidir never says who is behind a wallet. Information, not advice.</p>
          </TPanel>
          {sky && sky.stars.length >= 3 ? (
            <TPanel n={4} title="Where the money meets" meta="TODAY · $1M+ WALLETS" span={3} source={SOURCE} fetchedAt={now} testid="wallets-sky">
              <Insight id="sky-h" as="h2" text={skyLine} fallback={["Where the money", "meets."]} size={52} />
              <p className="t-muted">Every millionaire wallet that bet today, as a constellation. Tap a star for its wallet.</p>
              <Constellation data={sky} />
            </TPanel>
          ) : null}
        </PanelGrid>
      </div>
      <ScrollFx />
    </Frame>
  );
}
