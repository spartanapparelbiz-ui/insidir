/* /board: the board, in the terminal. A page head (the computed headline for members: "One wallet up $11M put $290K on
 * Hawks."; "The board: Golf" when filtered), the day's numbers as KPIs, money by category as a stream, then every bet as
 * a dense table (components/system/LiveBoard for members; components/brand/LiveFeed for visitors: no logos, repeats
 * grouped, green/red only on price change). The category filter filters everything on the page. "Wallets up $1M+" means
 * $1M+; Pro wallets ($100K–$1M) only under the Pro filter. Members: live. Visitors: 60 minutes late, sides locked, with
 * the live count and Start for $1. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Insight, Pill, ScrollFx } from "@/components/system";
import { ChipRow } from "@/components/system/ChipRow";
import { TermHead } from "@/components/system/Entity";
import { LiveBoard } from "@/components/system/LiveBoard";
import { Stream } from "@/components/system/Stream";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, category as categoryInfo, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { boardInsight, streamFor } from "@/lib/home/data";
import { headlineLines } from "@/lib/market/headline";
import { BOARD_DELAY_MS, pulse, recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import "../pages-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The board: millionaire bets, live", description: "Every bet of $5K+ by Polymarket wallets with $1M+ in all-time profit, as it happens." };

const EMPTY_PULSE = { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 };
const href = (c: CategorySlug | null, pro: boolean) => { const p = new URLSearchParams(); if (c) p.set("cat", c); if (pro) p.set("tier", "pro"); const s = p.toString(); return `/board${s ? `?${s}` : ""}`; };
const SOURCE = "Polymarket public data (trades of $5K+ by wallets Insidir watches)";

export default async function Board({ searchParams }: { searchParams: Promise<{ cat?: string; tier?: string }> }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan), now = Date.now();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  const pro = sp.tier === "pro";
  const tier = pro ? "pro" as const : "millionaire" as const;
  const who = pro ? "Pro wallets ($100K–$1M)" : "wallets up $1M+";
  const db = hasDatabase() ? getDb() : null;
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("board", e instanceof Error ? e.message : e); return d; });
  const [p, bets, stream] = db ? await Promise.all([
    safe(pulse(db, now, cat), null),
    safe(recentBets(db, { now, limit: member ? 40 : 30, member, tier, categories: cat ? [cat] : undefined, delayMs: member ? 0 : BOARD_DELAY_MS }), []),
    member && !pro ? safe(streamFor(db, now, cat ?? undefined), null) : Promise.resolve(null),
  ]) : [null, [] as BoardBet[], null] as const;
  const pl = p ?? EMPTY_PULSE;
  const where = cat ? ` in ${categoryInfo(cat).name}` : "";
  // Every number follows the filter (pulse is computed for the category).
  const stats = pro ? "" : [
    pl.sinceMidnight > 0 ? `${dollars(pl.sinceMidnight)} bet by millionaires${where} today` : null,
    pl.countToday > 0 ? `${pl.countToday} millionaire ${pl.countToday === 1 ? "bet" : "bets"}${where} today` : null,
    !cat && pl.millionaires > 0 ? `${pl.millionaires} ${pl.millionaires === 1 ? "wallet" : "wallets"} up $1M+ watched` : null,
  ].filter(Boolean).join(" · ");
  // One headline, two lines at most: the computed sentence when it fits, else "The board: Golf".
  const computed = member && !pro ? boardInsight(bets) : null;
  const title = `The board${cat ? `: ${categoryInfo(cat).name}` : ""}${pro ? `${cat ? ", Pro" : ": Pro"}` : ""}.`;
  const headline = computed && headlineLines(computed).length <= 2 ? computed : null;
  const kpis: Array<[string, string]> = pro ? [] : [
    ["$1M+ money today (ET)", pl.sinceMidnight > 0 ? dollars(pl.sinceMidnight) : "—"],
    ["$1M+ bets today", pl.countToday > 0 ? String(pl.countToday) : "—"],
    [pl.window === "hour" ? "Bets, last hour" : "Bets, last 24h", pl.count > 0 ? String(pl.count) : "—"],
    ...(!cat && pl.millionaires > 0 ? [["Wallets up $1M+ watched", String(pl.millionaires)] as [string, string]] : []),
  ];
  const filters = (
    <ChipRow>
      <a className="b-btn b-panel-pill" aria-pressed={!cat && !pro} href="/board">All</a>
      {CATEGORIES.map(c => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={cat === c.slug} href={href(c.slug, pro)}>{c.name}</a>)}
      <a className="b-btn b-panel-pill" aria-pressed={pro} href={href(cat, !pro)} data-testid="filter-pro" title="Wallets up $100K–$1M">Pro</a>
    </ChipRow>
  );
  return (
    <Frame member={member} current="board" testid="board">
      <div className="t-wrap t-page" data-testid="board-band">
        <TermHead title={<Insight id="board-h" text={headline} fallback={[title]} size={60} />}
          sub={<>Every bet of $5K+ from {who}{where}, {member ? "live" : "60 minutes late"}.{stats ? <span className="t-pagehead__stats" data-testid="board-stats"> {stats}</span> : null}</>} />
        <PanelGrid>
          {kpis.length ? (
            <TPanel n={1} title={`Today${where}`} meta={member ? "LIVE" : "60 MIN LATE"} span={3} compact>
              <dl className="t-kpis">{kpis.map(([l, v]) => <div key={l}><dt className="t-label">{l}</dt><dd className="t-kpi b-num">{v}</dd></div>)}</dl>
            </TPanel>
          ) : null}
          {member ? (
            <>
              {stream ? <TPanel n={2} title="Money by category" meta="$1M+ WALLETS" span={3} source={SOURCE} fetchedAt={now}><Stream data={stream} /></TPanel> : null}
              <TPanel n={stream ? 3 : 2} title={`Board · bets $5K+ from ${pro ? "Pro wallets" : "wallets up $1M+"}`} meta={`${bets.length} ROWS · LIVE`} span={3} source={SOURCE} fetchedAt={now} testid="board-live">
                <LiveBoard initial={[...bets]} now={now} n={40} cat={cat} tier={tier} links polymarket={viewer.region === "non_us"} />
              </TPanel>
            </>
          ) : (
            <>
              <TPanel n={2} title="Access" meta="DELAYED 60 MIN" span={3} testid="board-delay">
                <div className="t-access">
                  <p className="t-access__line"><span className="t-dot" aria-hidden="true" /> {pl.countToday > 0
                    ? <>Live now: <span className="b-num" data-testid="board-live-count">{pl.countToday}</span> millionaire {pl.countToday === 1 ? "bet" : "bets"}{where} today{pl.window === "hour" && pl.count > 0 ? <>, <span className="b-num">{pl.count}</span> in the last hour</> : null}.</>
                    : pl.window === "hour" && pl.count > 0
                      ? <>Live now: <span className="b-num" data-testid="board-live-count">{pl.count}</span> millionaire {pl.count === 1 ? "bet" : "bets"}{where} in the last hour.</>
                      : <>No millionaire bet{where} yet today (since midnight ET).</>}</p>
                  <p className="t-muted">You&apos;re seeing them 60 minutes late. Members see every one the second it lands, with its side.</p>
                  <div className="b-ctas"><Pill href="/go" data-testid="board-start" data-checkout="board">Start for $1</Pill></div>
                </div>
              </TPanel>
              <TPanel n={3} title="Filter" meta={cat ? categoryInfo(cat).name.toUpperCase() : "ALL CATEGORIES"} span={3} compact>{filters}</TPanel>
              <TPanel n={4} title={`Board · bets $5K+ from ${pro ? "Pro wallets" : "wallets up $1M+"}`} meta={`${bets.length} ROWS · 60 MIN LATE`} span={3} source={SOURCE} fetchedAt={now} testid="board-late">
                <LiveFeed initial={{ now, pulse: pl, bets: [...bets] }} n={30} cats={cat ? [cat] : []} board copy={false} tier={tier} polymarket={viewer.region === "non_us"} />
              </TPanel>
            </>
          )}
        </PanelGrid>
        <p className="t-disclaim">Information, not advice.</p>
      </div>
      {member ? null : <PayMoments ctx={{ count: pl.count, window: pl.window, biggest: null }} now={now} />}
      <ScrollFx />
    </Frame>
  );
}
