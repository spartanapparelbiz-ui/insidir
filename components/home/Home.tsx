/* The member home: the homepage, unlocked and live, plus their own layer. The same stages, scenery, type, pills and
 * motion as the landing (components/system); each stage opens with one sentence computed from the data, then the visual
 * that proves it, then the action.
 *   1 Hero        "Wallets up $1M+ bet $X today.", the search, today's #1 position as a ticket (chart, Copy, Follow)
 *   1b AI analyst  the 24-hour numbers, today's brief, Watch my bet, Bet Briefing, Ask Insidir (./AiDesk.tsx)
 *   2 Disagree    "Where they disagree with the price": the top 3, pinned while you scroll through them
 *   3 Election    "Tonight. Every race." (Election Day only)
 *   4 Board       "The live board": today's millionaire bets
 *   5 Wallets     "Wallets worth following": last 10 closed, all-time profit, today's bets, Follow
 *   6 Gaps        "Same bet, two prices": Kalshi against Polymarket, per $100
 *   7 Your desk   open copies, the wallets they follow, pings */
import { marketPath } from "@/lib/entities/slug";
import { Frame } from "@/components/brand/app/Frame";
import { CommandBar } from "@/components/desk/CommandBar";
import { PingsLink } from "@/components/desk/Act";
import { categoryPhoto } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
import type { Home } from "@/lib/home/data";
import { dollars } from "@/lib/money";
import { Insight, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { LiveBoard } from "@/components/system/LiveBoard";
import { Meter } from "@/components/system/Meter";
import { Stream } from "@/components/system/Stream";
import { RaceCards } from "@/components/system/Races";
import { Ticket } from "@/components/system/Ticket";
import { WalletCards } from "@/components/system/WalletCards";
import { AiDesk } from "./AiDesk";
import { LiveStrip } from "./LiveStrip";
import { CopyTotal } from "@/components/copies/CopyLedger";
import { myCopies } from "@/lib/copies/mine";
import { WhaleTicker } from "@/components/system/WhaleTicker";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { homeGaps } from "@/lib/home/data";
import { MAIN_KINDS, tape } from "@/lib/tape";
import { Tape } from "@/components/system/Tape";
import { ScrollReveal } from "@/components/brand/ScrollReveal";

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const since = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

/** Same bet, two prices: the venue reads stream in on their own (lib/home/data.ts homeGaps), so the page never waits. */
async function GapsStage({ now }: { now: number }) {
  const gaps = await homeGaps(getDb(), now).catch(() => []);
  if (!gaps.length) return null;
  const g = gaps[0]!;
  return (
    <Stage bg={{ kind: "photo", photo: PHOTOS.golf, dark: 0.6 }} id="prices" testid="home-gaps" labelledBy="gap-h">
      <div className="b-head"><p className="hm-eyebrow">Best price</p><Insight id="gap-h" as="h2" text={`${g.outcome} costs ${cents(g.kalshi)} on Kalshi and ${cents(g.polymarket)} on Polymarket.`} fallback={["Same trade,", "two prices."]} size={52} /><p className="hm-plain"><b>In plain English:</b> the same bet costs different amounts on Kalshi and Polymarket. Buying where it&apos;s cheaper means a bigger payout if you win.</p></div>
      <div className="s-cards" data-stagger="">
        {gaps.map(x => {
          const lo = Math.min(x.kalshi, x.polymarket), hi = Math.max(x.kalshi, x.polymarket), extra = 100 / lo - 100 / hi;
          return (
            <Panel key={x.title + x.outcome} className="s-gap" testid="gap-card">
              <h3 className="s-ticket__mkt">{x.title}</h3>
              <p className="b-small">{x.outcome}</p>
              <p className="s-gap__px"><span><span className="b-label">Kalshi</span><b className="s-big b-num">{cents(x.kalshi)}</b></span><span><span className="b-label">Polymarket</span><b className="s-big b-num">{cents(x.polymarket)}</b></span></p>
              <p className="b-small">Per $100, the cheaper venue pays {dollars(extra)} more if {x.outcome} wins.</p>
            </Panel>
          );
        })}
      </div>
      <p className="b-small b-center">Best prices to buy right now. In the US, Insidir links to Kalshi only. Information, not advice.</p>
    </Stage>
  );
}

/** The tape (lib/tape.ts): every big move, streamed in so the page never waits on it. */
async function TapeStage({ now }: { now: number }) {
  const rows = await tape(getDb(), { now, member: true, limit: 40, kinds: MAIN_KINDS }).catch(() => []);
  return (
    <Stage id="tape" testid="home-tape" labelledBy="tape-h">
      <div className="b-head"><p className="hm-eyebrow">The tape</p><h2 id="tape-h" className="ai-h">Every big move.</h2><p className="hm-plain"><b>In plain English:</b> each line is one big move: a $100K+ wallet trading or selling out, any Polymarket wallet trading $10K+, or a $5K+ Kalshi trade. Who did it, how big, which side, and how much big money is already in that market.</p></div>
      <Tape initial={rows} now={now} member testid="home-tape-list" />
    </Stage>
  );
}

/** Keeping score at the top of the home screen: "Your copies this month: +$212." (placed copies only). */
async function CopyTotalBar({ userId, now }: { userId: string; now: number }) {
  const m = await myCopies(getDb(), userId, now).catch(() => null);
  return m ? <div className="cl-bar"><CopyTotal t={m.totals} /></div> : null;
}

export function HomePage({ d, search, userId }: { d: Home; search: boolean; userId: string }) {
  const live = d.polledAt !== null && d.now - d.polledAt < 5 * 60_000;
  return (
    <Frame member current="home" testid="member-home">
      <Suspense fallback={null}><CopyTotalBar userId={userId} now={d.now} /></Suspense>
      <div data-home="stages">
        <Stage bg={{ kind: "photo", photo: d.top ? categoryPhoto(d.top.bet.category) : PHOTOS.hero, dark: 0.5, priority: true }} first id="overview" testid="home-hero" labelledBy="hero-h">
          <div className="b-head">
            <p className="hm-eyebrow">Today</p>
            <Insight id="hero-h" text={d.insight.hero} fallback={["Wallets up $1M+.", "Live."]} size={64} />
            <p className="b-sub" data-m="lift" data-testid="home-status">{live ? <>Live · checked {since(d.now - d.polledAt!)} ago</> : <>Paused{d.polledAt ? <> · last check {since(d.now - d.polledAt)} ago</> : null}</>}{d.lastBetAt ? <> · last bet {since(d.now - d.lastBetAt)} ago</> : null}</p>
            <div className="s-search" data-m="settle"><CommandBar open={search} /></div>
          </div>
          {d.top ? <div className="s-col"><Ticket bet={d.top.bet} edge={d.top.edge} art={d.top.art} testid="home-ticket" /></div> : null}
        </Stage>

        {/* The whale ticker sits at the top of the dashboard, above the sticky bar, so the bar stays one line. */}
        <WhaleTicker />
        <div className="hm-bar">
        <LiveStrip initial={{ now: d.now, money: d.today?.money ?? d.day?.money ?? 0, bets: d.today?.bets ?? d.day?.bets ?? 0, window: d.today ? "today" : "24h", lastBetAt: d.lastBetAt, polledAt: d.polledAt }} />
        <nav className="hm-nav" aria-label="Sections" data-testid="home-nav">
          {[["overview", "Today"], ["ai", "AI analyst"], ["tape", "The tape"], ...(d.disagree.length ? [["disagree", "Money vs price"]] : []), ...(d.election && d.election.day.races.length ? [["election", "Election"]] : []),
            ...(d.board.length ? [["board", "Live board"]] : []), ...(d.wallets.length ? [["wallets", "Wallets"]] : []), ["desk", "Your desk"]]
            .map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        </nav>
        </div>

        <AiDesk d={d} userId={userId} />

        {d.disagree.length ? (
          <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.6 }} id="disagree" testid="home-disagree" labelledBy="dis-h" className="s-pinstage">
            <div className="s-pin">
              <div className="s-pin__head b-head"><p className="hm-eyebrow">Money vs the price</p><Insight id="dis-h" as="h2" text={d.insight.disagree} fallback={["Where they disagree", "with the price."]} size={52} /><p className="b-sub">The markets where millionaire money and the price disagree most.</p><p className="hm-plain"><b>In plain English:</b> the price is what the market thinks will happen. Here, the wallets that have made $1M+ are trading the other way. Either they know something, or they're wrong.</p></div>
              <div className="s-pin__list">
                {d.disagree.map(x => (
                  <Panel key={x.marketId} className="s-pin__card" testid="disagree-card">
                    <h3 className="s-ticket__mkt">{x.title}</h3>
                    <Meter d={x} />
                    <Pill href={marketPath(x.marketId, x.title)} kind="ghost">See the market</Pill>
                  </Panel>
                ))}
              </div>
            </div>
          </Stage>
        ) : null}

        {d.election && d.election.day.races.length ? (
          <Stage bg={{ kind: "photo", photo: PHOTOS.politics, dark: 0.6 }} id="election" testid="home-election" labelledBy="el-h">
            <div className="b-head"><p className="hm-eyebrow">Election</p><Insight id="el-h" as="h2" text={d.election.insight} fallback={["Tonight.", "Every race."]} size={52} /></div>
            <RaceCards races={d.election.day.races.slice(0, 6)} />
            <div className="b-center"><div className="b-ctas"><Pill href="/election" kind="ghost">Every race</Pill></div></div>
          </Stage>
        ) : null}

        <Suspense fallback={null}><TapeStage now={d.now} /></Suspense>

        {d.board.length ? (
          <Stage bg={{ kind: "photo", photo: PHOTOS.baseball, dark: 0.7 }} id="board" testid="home-board" labelledBy="board-h">
            <div className="b-head"><p className="hm-eyebrow">Live board</p><Insight id="board-h" as="h2" text={d.insight.board} fallback={["The live board."]} size={52} /><p className="b-sub">The latest trades of $1K+ from wallets up $1M+, in the last 24 hours. Select one to copy it.</p><p className="hm-plain"><b>In plain English:</b> each row is one real bet: who placed it, what they bet on, the price they paid and the price now. Copy places the same bet; Verify shows it on the blockchain.</p></div>
            {d.stream ? <div className="s-col s-col--wide"><Stream data={d.stream} /></div> : null}
            <LiveBoard initial={d.board.slice(0, 10)} now={d.now} />
            <div className="b-center"><div className="b-ctas"><Pill href="/board" kind="ghost">The full board</Pill></div>
              <p className="b-small" style={{ marginTop: 10 }} data-testid="home-record-link">Every position we&apos;ve flagged, losses included: <a className="s-link" href="/record">the record</a>.</p></div>
          </Stage>
        ) : null}

        {d.wallets.length ? (
          <Stage bg={{ kind: "photo", photo: PHOTOS.cta, dark: 0.55 }} id="wallets" testid="home-wallets" labelledBy="wal-h">
            <div className="b-head"><p className="hm-eyebrow">Wallets</p><Insight id="wal-h" as="h2" text={d.insight.wallets} fallback={["Wallets worth following."]} size={52} /><p className="hm-plain"><b>In plain English:</b> these wallets have made the most money trading. Follow one and we ping you the moment it trades again.</p></div>
            <WalletCards wallets={d.wallets} today={Boolean(d.today)} />
          </Stage>
        ) : null}

        <Suspense fallback={null}><GapsStage now={d.now} /></Suspense>

        <Stage bg={{ kind: "photo", photo: PHOTOS.hero, dark: 0.55 }} id="desk" testid="home-desk" labelledBy="desk-h">
          <div className="b-head"><p className="hm-eyebrow">Your desk</p><Insight id="desk-h" as="h2" text={d.insight.desk} fallback={["Your desk."]} size={52} /><p className="hm-plain"><b>In plain English:</b> your own corner: trades you copied, wallets you follow, and your pings.</p></div>
          <div className="s-cards">
            <Panel className="s-desk" testid="desk-copies">
              <p className="b-label">Your copies</p>
              {d.copies && d.copies.list.length ? (
                <ul className="s-lockrows">{d.copies.list.slice(0, 5).map(x => (
                  <li key={x.id}><span>{x.title} · <b>{x.outcome}</b> at {cents(x.price)}</span><span className="b-small">{x.result === "won" ? `Won ${signed(x.pnl ?? 0)}` : x.result === "lost" ? `Lost ${signed(x.pnl ?? 0)}` : x.result === "void" ? "Void" : d.copyNow[x.id] !== undefined ? <>Now {cents(d.copyNow[x.id]!)}{(() => { const m = Math.round((d.copyNow[x.id]! - x.price) * 100); return m ? <span className={m > 0 ? "s-up" : "s-down"}> {m > 0 ? "up" : "down"} {Math.abs(m)}¢</span> : null; })()}</> : "Open"}</span></li>
                ))}</ul>
              ) : <p className="b-small">Copy a trade from the board and it shows here, with its result.</p>}
              <Pill href="/copies/yours" kind="ghost">All your copies</Pill>
            </Panel>
            <Panel className="s-desk" testid="desk-follows">
              <p className="b-label">Wallets you follow</p>
              {d.desk.following ? <p className="s-big b-num">{d.desk.following}</p> : null}
              <p className="b-small">{d.desk.following ? "We ping you when they trade." : "You don't follow a wallet yet. Follow one above and we ping you when it trades."}</p>
              <Pill href="/wallets" kind="ghost">Wallets</Pill>
            </Panel>
            <Panel className="s-desk" testid="desk-pings">
              <p className="b-label">Pings on this device</p>
              <PingsLink />
              <p className="b-small">A ping within a minute of a $25K+ millionaire bet in your categories. At most 8 a day; quiet 11pm to 8am.</p>
            </Panel>
          </div>
        </Stage>
      </div>
      <ScrollFx />
      <ScrollReveal />
    </Frame>
  );
}
