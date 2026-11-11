/* /board: the next section of the homepage, at full depth. One headline (computed from the money for members: "One
 * wallet up $11M put $290K on Hawks."; "The board: Golf" when filtered), the numbers, money by category as a stream,
 * then every bet as a written list (components/system/LiveBoard: no logos, repeats grouped, Copy on the selected row
 * only, green/red only on price change). The category filter filters everything on the page: the numbers, the live
 * panel, the total and the list. "Wallets up $1M+" means $1M+; Pro wallets ($100K–$1M) only under the Pro filter.
 * Members: live. Visitors: 60 minutes late, sides locked, with the live count and Start for $1. */
import { DelayNotice } from "@/components/system/DelayNotice";
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Insight, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { ChipRow } from "@/components/system/ChipRow";
import { LiveBoard } from "@/components/system/LiveBoard";
import { Stream } from "@/components/system/Stream";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, category as categoryInfo, categoryPhoto, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
import { getDb, hasDatabase } from "@/lib/db";
import { boardInsight, streamFor } from "@/lib/home/data";
import { headlineLines } from "@/lib/market/headline";
import { BOARD_DELAY_MS, pulse, recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { MAIN_KINDS, tape, type TapeRow } from "@/lib/tape";
import { Tape } from "@/components/system/Tape";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The board: millionaire trades, live", description: "Every trade of $1K+ by Polymarket wallets with $1M+ in all-time profit, as it happens." };

const EMPTY_PULSE = { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0, all: { count: 0, window: "hour" as const, today: 0, sinceMidnight: 0, countToday: 0 } };
const href = (c: CategorySlug | null, t: "all" | "1m" | "pro") => { const p = new URLSearchParams(); if (c) p.set("cat", c); if (t !== "all") p.set("tier", t); const s = p.toString(); return `/board${s ? `?${s}` : ""}`; };

export default async function Board({ searchParams }: { searchParams: Promise<{ cat?: string; tier?: string }> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan), now = Date.now();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  // Default: every watched wallet up $100K+ ($1M+ ones marked); ?tier=1m: $1M+ only; ?tier=pro: $100K–$1M only.
  const pro = sp.tier === "pro", oneM = sp.tier === "1m";
  const tier = pro ? "pro" as const : oneM ? "millionaire" as const : "all" as const;
  const who = pro ? "wallets up $100K–$1M" : oneM ? "wallets up $1M+" : "wallets up $100K+ ($1M+ marked)";
  const db = hasDatabase() ? getDb() : null;
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("board", e instanceof Error ? e.message : e); return d; });
  const [p, bets, stream, tapeRows] = db ? await Promise.all([
    safe(pulse(db, now, cat), null),
    safe(recentBets(db, { now, limit: member ? 40 : 30, member, tier: tier === "all" ? undefined : tier, categories: cat ? [cat] : undefined, delayMs: member ? 0 : BOARD_DELAY_MS }), []),
    member && oneM ? safe(streamFor(db, now, cat ?? undefined), null) : Promise.resolve(null),
    safe(tape(db, { now, member, limit: 40, kinds: MAIN_KINDS }), [] as TapeRow[]),
  ]) : [null, [] as BoardBet[], null, [] as TapeRow[]] as const;
  const pl = p ?? EMPTY_PULSE;
  const where = cat ? ` in ${categoryInfo(cat).name}` : "";
  // Every number follows the filter (pulse is computed for the category).
  const a = pl.all;
  const stats = pro ? "" : oneM ? [
    pl.sinceMidnight > 0 ? `${dollars(pl.sinceMidnight)} traded by millionaires${where} today` : null,
    pl.countToday > 0 ? `${pl.countToday} millionaire ${pl.countToday === 1 ? "trade" : "trades"}${where} today` : null,
    !cat && pl.millionaires > 0 ? `${pl.millionaires} ${pl.millionaires === 1 ? "wallet" : "wallets"} up $1M+ watched` : null,
  ].filter(Boolean).join(" · ") : [
    a.sinceMidnight > 0 ? `${dollars(a.sinceMidnight)} traded by wallets up $100K+${where} today${pl.sinceMidnight > 0 ? ` (${dollars(pl.sinceMidnight)} from $1M+)` : ""}` : null,
    a.countToday > 0 ? `${a.countToday} ${a.countToday === 1 ? "trade" : "trades"}${where} today${pl.countToday > 0 ? ` (${pl.countToday} from $1M+)` : ""}` : null,
    !cat && pl.wallets > 0 ? `${pl.wallets.toLocaleString("en-US")} wallets watched, ${pl.millionaires} up $1M+` : null,
  ].filter(Boolean).join(" · ");
  // One headline, two lines at most: the computed sentence when it fits, else "The board: Golf".
  const computed = member && !pro ? boardInsight(bets.filter(b => b.tier === "millionaire")) : null;
  const title = `The board${cat ? `: ${categoryInfo(cat).name}` : ""}${pro ? `${cat ? ", $100K–$1M" : ": $100K–$1M"}` : oneM ? `${cat ? ", $1M+" : ": $1M+"}` : ""}.`;
  const headline = computed && headlineLines(computed).length <= 2 ? computed : null;
  const photo = cat ? categoryPhoto(cat) : PHOTOS.baseball;
  return (
    <Frame member={member} current="board" testid="board">
      <Stage bg={{ kind: "photo", photo, dark: 0.6, priority: true }} first testid="board-band" labelledBy="board-h">
        <div className="b-head">
          <Insight id="board-h" text={headline} fallback={[title]} size={60} />
          <p className="b-sub" data-m="lift">Every trade of $1K+ from {who}{where}, {member ? "live" : "60 minutes late"}.</p>
          {stats ? <p className="b-small b-center" data-testid="board-stats" data-m="lift">{stats}</p> : null}
        </div>
        {member ? (
          <>
            {stream ? <div className="s-col s-col--wide"><Stream data={stream} /></div> : null}
            <LiveBoard initial={[...bets]} now={now} n={40} cat={cat} tier={tier} links polymarket={viewer.region === "non_us"} />
          </>
        ) : (
          <div className="s-board">
            <Panel className="b-delay" testid="board-delay">
              <p className="s-strong"><span className="b-dot" aria-hidden="true" /> {a.countToday > 0
                ? <>Live now: <span className="b-num" data-testid="board-live-count">{a.countToday}</span> {a.countToday === 1 ? "trade" : "trades"} from wallets up $100K+{where} today{pl.countToday > 0 ? <>, <span className="b-num">{pl.countToday}</span> from $1M+</> : null}{a.window === "hour" && a.count > 0 ? <>; <span className="b-num">{a.count}</span> in the last hour</> : null}.</>
                : a.window === "hour" && a.count > 0
                  ? <>Live now: <span className="b-num" data-testid="board-live-count">{a.count}</span> {a.count === 1 ? "trade" : "trades"} from wallets up $100K+{where} in the last hour.</>
                  : <>No trade from a watched wallet{where} yet today (since midnight ET).</>}</p>
              <p className="b-small">You&apos;re seeing them 60 minutes late. Members see every one the second it lands, with its side.</p>
              <div className="b-ctas"><Pill href="/go" data-testid="board-start" data-checkout="board">Start for $1</Pill></div>
            </Panel>
            <ChipRow>
              <a className="b-btn b-panel-pill" aria-pressed={!cat && tier === "all"} href="/board">All</a>
              <a className="b-btn b-panel-pill" aria-pressed={oneM} href={href(cat, oneM ? "all" : "1m")} data-testid="filter-1m" title="Wallets up $1M+ only">$1M+ only</a>
              <a className="b-btn b-panel-pill" aria-pressed={pro} href={href(cat, pro ? "all" : "pro")} data-testid="filter-pro" title="Wallets up $100K–$1M">$100K–$1M</a>
              {CATEGORIES.map(c => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={cat === c.slug} href={href(c.slug, pro ? "pro" : oneM ? "1m" : "all")}>{c.name}</a>)}
            </ChipRow>
            <DelayNotice where="board" />
            <LiveFeed initial={{ now, pulse: pl, bets: [...bets] }} n={30} cats={cat ? [cat] : []} board copy={false} tier={tier} polymarket={viewer.region === "non_us"} />
          </div>
        )}
        <p className="b-small b-center">Information, not advice.</p>
      </Stage>
      <Stage testid="board-tape" labelledBy="tape-h">
        <div className="b-head">
          <h2 id="tape-h" className="ai-h">The tape. Every big move.</h2>
          <p className="b-sub">New bets from wallets up $100K+, their exits, $10K+ trades from any Polymarket wallet, and $5K+ trades on Kalshi, newest first, with who&apos;s behind each and the big money in that market.</p>
        </div>
        <Tape initial={[...tapeRows]} now={now} member={member} />
      </Stage>
      {member ? null : <PayMoments ctx={{ count: pl.count, window: pl.window, biggest: null }} now={now} />}
      <ScrollFx />
    </Frame>
  );
}
