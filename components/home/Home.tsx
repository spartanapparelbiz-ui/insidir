/* The member home: the terminal workspace, no marketing. Under the chrome (top bar with the command line, ticker,
 * function keys: components/brand/app/Shell.tsx), one tiled grid of panels, each numbered, with its counts and fetch
 * time, and a source line:
 *   0 Today          what the $1M+ wallets bet today (KPIs) and whether the feed is live
 *   1 Board          the live board, sides shown (arrow keys move, Enter opens the bet)
 *   2 Watch my bet   their watched positions, price now and P&L, and their latest alerts
 *   3 Alerts log     time-stamped, explained (What we told you)
 *   4 Wallet monitor a wallet they follow (else the top wallet, said so): P&L, record, latest bets
 *   5 Market         their market (watched, followed, else the most-bet now): price, $1M+ money per side, Kalshi
 *   6 Daily Brief    the 8 AM ET brief's first lines
 *   7 Top position   today's #1 open position as a ticket (chart, Copy, Follow)
 *   8 Disagree       where the millionaire money and the price disagree most
 *   9 Two prices     the same bet on Kalshi and Polymarket, per $100
 *   10 Wallets       wallets worth following (last 10 closed, all-time profit, today's bets, Follow)
 *   11 Your desk     open copies, the wallets they follow, pings
 *   12 Money stream  money by category, hour by hour (when it reads as a stream)
 *   13 Election      tonight's races (Election Day only)
 * Every number is from Insidir's data (lib/home/data.ts, lib/home/workspace.ts); a panel with nothing to show says so. */
import { Frame } from "@/components/brand/app/Frame";
import { PingsLink } from "@/components/desk/Act";
import { LiveBoard } from "@/components/system/LiveBoard";
import { Meter } from "@/components/system/Meter";
import { RaceCards } from "@/components/system/Races";
import { Stream } from "@/components/system/Stream";
import { Ticket } from "@/components/system/Ticket";
import { WalletCards } from "@/components/system/WalletCards";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import type { Home } from "@/lib/home/data";
import { workspace, type Workspace } from "@/lib/home/workspace";
import { dollars } from "@/lib/money";
import { AskPanel } from "./AskPanel";
import { FocusSearch } from "./FocusSearch";
import "@/app/home-terminal.css";

/** The briefing's compact rows on the home: what it takes to win, price and payout, the big money, the read. */
const BRIEF_ROWS: ReadonlyArray<readonly [string, string]> = [["rules", "Wins if"], ["cost", "Price · pays"], ["who", "Big money"], ["read", "The read"]];

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const since = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const ET_HM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ET_MDHM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const stamp = (ms: number, now: number) => (now - ms < 20 * 3_600_000 ? ET_HM.format(new Date(ms)) : ET_MDHM.format(new Date(ms)).toUpperCase());
const RESULT: Record<string, string> = { won: "WON", lost: "LOST", void: "VOID", sold: "SOLD" };
const tone = (v: number | null) => (v === null || Math.round(v) === 0 ? "" : v > 0 ? "t-up" : "t-down");

const EMPTY: Workspace = { watched: [], told: [], monitor: null, market: null, brief: null, briefing: null, fetchedAt: 0 };

export async function HomePage({ d, search }: { d: Home; search: boolean }) {
  const live = d.polledAt !== null && d.now - d.polledAt < 5 * 60_000;
  const ws = hasDatabase() ? await workspace(getDb(), d.userId, d.wallets[0]?.wallet ?? null, d.now).catch(() => EMPTY) : EMPTY;
  const k = d.today ?? (d.day ? { money: d.day.money, bets: d.day.bets, wallets: null } : null);
  const open = ws.watched.filter(w => !w.result);
  const alerts = ws.told.filter(t => t.kind === "alert");
  const m = ws.market?.money ?? null;
  const yesPx = m?.priceNow ?? null;
  const mil = m ? { yes: m.millionaire.yes.dollars, no: m.millionaire.no.dollars } : null;
  const milTotal = mil ? mil.yes + mil.no : 0;
  let n = 0;
  return (
    <Frame member current="home" testid="member-home">
      <FocusSearch on={search} />
      <div className="t-wrap t-home" data-home="workspace">
        <PanelGrid testid="home-grid">
          <Panel n={n++} title="Today · wallets up $1M+" span={3} testid="home-hero" meta={<span data-testid="home-status">{live ? <>LIVE · POLLED {since(d.now - d.polledAt!)} AGO</> : <>PAUSED{d.polledAt ? <> · LAST POLL {since(d.now - d.polledAt)} AGO</> : null}</>}{d.lastBetAt ? <> · LAST BET {since(d.now - d.lastBetAt)} AGO</> : null}</span>}>
            <div className="t-today">
              <h1 className="t-h1" id="hero-h">{d.insight.hero ?? "Wallets up $1M+. Live."}</h1>
              {k ? (
                <dl className="t-kpis">
                  <div><dt className="t-label">{d.today ? "Bet today" : "Bet, last 24h"}</dt><dd className="t-kpi">{dollars(k.money)}</dd></div>
                  <div><dt className="t-label">Bets</dt><dd className="t-kpi">{k.bets.toLocaleString("en-US")}</dd></div>
                  {k.wallets !== null ? <div><dt className="t-label">Wallets</dt><dd className="t-kpi">{k.wallets.toLocaleString("en-US")}</dd></div> : null}
                  <div><dt className="t-label">You follow</dt><dd className="t-kpi">{d.desk.following}</dd></div>
                  <div><dt className="t-label">Watching</dt><dd className="t-kpi">{open.length}</dd></div>
                </dl>
              ) : <p className="t-empty">No $5K+ bets from wallets up $1M+ in the last 24 hours.</p>}
            </div>
          </Panel>

          <Panel n={n++} title="Board · bets $5K+ from wallets up $1M+" span={2} testid="home-board" compact
            meta={<>{d.board.length} BETS · 24H</>} source="Polymarket public data" fetchedAt={d.now}
            empty={d.board.length ? null : "No $5K+ bets from wallets up $1M+ in the last 24 hours. They show here the moment one lands."}>
            <LiveBoard initial={d.board.slice(0, 12)} now={d.now} />
            <p className="t-panel__links"><a className="t-link" href="/board">THE FULL BOARD →</a>{d.insight.board ? <span className="t-muted"> · {d.insight.board}</span> : null}</p>
            <p className="t-panel__links t-muted" data-testid="home-record-link">Every position we&apos;ve flagged, losses included: <a className="t-link" href="/record">the record</a>.</p>
          </Panel>

          <div className="t-stack">
            <Panel n={n++} title="Watch my bet" testid="home-watch" compact meta={<>{open.length} OPEN</>} source="Polymarket public data" fetchedAt={ws.fetchedAt || d.now}
              empty={open.length ? null : "You're not watching a bet yet."}>
              <div className="t-scroll"><table className="t-table t-table--compact">
                <thead><tr><th>Market</th><th>Side</th><th className="r">Entry</th><th className="r">Now</th><th className="r">P&amp;L</th></tr></thead>
                <tbody>{open.slice(0, 6).map(w => (
                  <tr key={w.id} data-testid="home-watch-row">
                    <td className="t-ell" title={w.title}><a href={marketPath(w.marketId, w.title)}>{w.title}</a></td>
                    <td>{w.outcome}</td>
                    <td className="r">{cents(w.price)}</td>
                    <td className="r">{w.priceNow === null ? "—" : cents(w.priceNow)}</td>
                    <td className={`r ${tone(w.pnl)}`}><b className="t-strong">{w.pnl === null ? "—" : signed(w.pnl)}</b></td>
                  </tr>
                ))}</tbody>
              </table></div>
              {alerts.length ? <ul className="t-lines">{alerts.slice(0, 2).map(a => <li key={a.id}><span className="t-muted">{stamp(a.at, d.now)}</span> {a.headline}</li>)}</ul> : null}
            </Panel>
            {open.length ? null : <p className="t-panel__links t-inpanel"><a className="t-link" href="/watch">ADD A POSITION OR A POLYMARKET ADDRESS →</a></p>}
            <Panel n={n++} title="Alerts log" testid="home-alerts" meta={<>{ws.told.length} LATEST</>} source="Insidir alerts and briefs" fetchedAt={ws.fetchedAt || d.now}
              empty={ws.told.length ? null : "No alerts yet. They show here, explained, when a watched bet moves or $1M+ money takes a side."}>
              <ol className="t-log">{ws.told.slice(0, 8).map(t => (
                <li key={t.id} data-testid="home-alert">
                  <span className="t-muted">{stamp(t.at, d.now)} ET · {t.kind === "alert" ? "ALERT" : "BRIEF"}{t.result ? <> · <span className={t.result === "won" ? "t-up" : t.result === "lost" ? "t-down" : ""}>{RESULT[t.result]}</span></> : null}</span>
                  <span>{t.headline}</span>
                  {t.body ? <span className="t-muted">{t.body}</span> : null}
                </li>
              ))}</ol>
              <p className="t-panel__links"><a className="t-link" href="/told">WHAT WE TOLD YOU →</a></p>
            </Panel>
          </div>

          <Panel n={n++} title="Wallet monitor" testid="home-monitor" meta={ws.monitor ? <>{ws.monitor.followed ? "A WALLET YOU FOLLOW" : "TOP WALLET · YOU FOLLOW NONE"}</> : null}
            source="Polymarket public data" fetchedAt={ws.fetchedAt || d.now} empty={ws.monitor ? null : "No wallet to show yet. Follow one on Wallets."}>
            {ws.monitor ? (
              <>
                <p className="t-monitor__who"><span className={`t-tagtier t-tagtier--${ws.monitor.tier ?? "pro"}`}>{ws.monitor.tier === "millionaire" ? "$1M+" : ws.monitor.tier === "pro" ? "PRO" : "WALLET"}</span> <a href={`/wallet/${ws.monitor.wallet}`}>{ws.monitor.short}</a></p>
                <dl className="t-kpis t-kpis--4">
                  <div><dt className="t-label">P&amp;L all-time</dt><dd className={`t-kpi ${tone(ws.monitor.pnl)}`}>{ws.monitor.pnl === null ? "—" : signed(ws.monitor.pnl)}</dd></div>
                  <div><dt className="t-label">Settled W–L</dt><dd className="t-kpi">{ws.monitor.record ? `${ws.monitor.record.won}–${ws.monitor.record.lost}` : "—"}</dd></div>
                  <div><dt className="t-label">$100 on each</dt><dd className={`t-kpi ${tone(ws.monitor.record?.net ?? null)}`}>{ws.monitor.record ? signed(ws.monitor.record.net) : "—"}</dd></div>
                  <div><dt className="t-label">Last 24h</dt><dd className="t-kpi">{ws.monitor.today.bets ? dollars(ws.monitor.today.dollars) : "—"}</dd></div>
                </dl>
                {ws.monitor.bets.length ? (
                  <div className="t-scroll"><table className="t-table t-table--compact">
                    <thead><tr><th>Time</th><th>Market</th><th>Side</th><th className="r">Price</th><th className="r">Size</th><th className="r">Result</th></tr></thead>
                    <tbody>{ws.monitor.bets.map(b => (
                      <tr key={b.id}><td className="t-muted">{stamp(b.at, d.now)}</td><td className="t-ell" title={b.title}><a href={marketPath(b.marketId, b.title)}>{b.title}</a></td><td>{b.outcome}</td>
                        <td className="r">{cents(b.price)}</td><td className="r"><b className="t-strong">{dollars(b.amount)}</b></td>
                        <td className={`r ${b.result === "won" ? "t-up" : b.result === "lost" ? "t-down" : "t-muted"}`}>{b.result ? RESULT[b.result] : "OPEN"}</td></tr>
                    ))}</tbody>
                  </table></div>
                ) : <p className="t-empty">No bets from this wallet on file yet.</p>}
              </>
            ) : null}
          </Panel>

          <Panel n={n++} title="Market" testid="home-market" meta={ws.market ? <>{ws.market.why === "watched" ? "YOU WATCH THIS" : ws.market.why === "followed" ? "YOU FOLLOW THIS" : "MOST $1M+ MONEY · 24H"}</> : null}
            source={ws.market?.twin ? "Polymarket + Kalshi" : "Polymarket public data"} fetchedAt={ws.fetchedAt || d.now} empty={m ? null : "No market with $1M+ money in the last 24 hours."}>
            {m ? (
              <>
                <p className="t-market__t"><a href={marketPath(m.marketId, m.title)}>{m.title}</a></p>
                <div className="t-bids">
                  <div className="t-bid"><span className="t-label">Polymarket · {m.yesLabel}</span><span className="t-kpi">{yesPx === null ? "—" : cents(yesPx)}</span></div>
                  <div className="t-bid"><span className="t-label">Polymarket · {m.noLabel}</span><span className="t-kpi">{yesPx === null ? "—" : cents(1 - yesPx)}</span></div>
                  {ws.market?.twin ? <div className="t-bid"><span className="t-label">Kalshi · {m.yesLabel}</span><span className="t-kpi">{ws.market.twin.yesAsk !== null ? cents(ws.market.twin.yesAsk) : ws.market.twin.yes !== null ? cents(ws.market.twin.yes) : "—"}</span></div> : null}
                </div>
                {!ws.market?.twin ? <p className="t-muted t-small">Kalshi doesn&apos;t list this market.</p> : null}
                {mil && milTotal > 0 ? (
                  <div className="t-sides">
                    {(["yes", "no"] as const).map(s => (
                      <div key={s} className="t-sideline">
                        <span className="t-label">{s === "yes" ? m.yesLabel : m.noLabel} · $1M+</span>
                        <span className="t-bar" role="img" aria-label={`${Math.round((mil[s] / milTotal) * 100)}% of the $1M+ money`}><span style={{ width: `${Math.round((mil[s] / milTotal) * 100)}%` }} /></span>
                        <span className="r"><b className="t-strong">{dollars(mil[s])}</b> <span className="t-muted">{m.millionaire[s].wallets} W · {Math.round((mil[s] / milTotal) * 100)}%</span></span>
                      </div>
                    ))}
                  </div>
                ) : <p className="t-empty">No $1M+ money on this market yet.</p>}
              </>
            ) : null}
          </Panel>

          <Panel n={n++} title="Bet Briefing" testid="home-briefing" meta={ws.briefing ? <>{ws.briefing.origin === "model" ? "AI-WORDED · NUMBERS FROM DATA" : "FROM DATA"}</> : null}
            source="Polymarket rules and prices · Insidir data" fetchedAt={ws.briefing?.createdAt ?? d.now}
            empty={ws.briefing ? null : m ? "The briefing for this market isn't ready yet. Open the market for it." : "No market to brief yet."}>
            {ws.briefing ? (
              <>
                <p className="t-market__t"><a href={marketPath(ws.briefing.marketId, ws.briefing.title)}>{ws.briefing.title}</a></p>
                <dl className="t-brief" data-testid="bet-briefing" data-origin={ws.briefing.origin}>
                  {BRIEF_ROWS.map(([key, label]) => {
                    const sec = ws.briefing!.sections.find(x => x.key === key);
                    return sec && sec.lines.length ? (
                      <div key={key} className="t-brief__row" data-testid="briefing-section" data-key={key}>
                        <dt className="t-label">{label}</dt>
                        <dd>{sec.lines.slice(0, key === "rules" ? 2 : 3).map((l, i) => <p key={i}>{l}</p>)}</dd>
                      </div>
                    ) : null;
                  })}
                </dl>
                <p className="t-panel__links"><a className="t-link" href={marketPath(ws.briefing.marketId, ws.briefing.title)}>THE FULL BRIEFING →</a> <span className="t-muted">Information, not advice.</span></p>
              </>
            ) : null}
          </Panel>

          <Panel n={n++} title="Daily Brief · 8 AM ET" testid="home-brief" meta={ws.brief ? <>{ws.brief.items.length} ITEMS</> : null} source="Insidir Daily Brief" fetchedAt={ws.brief?.now ?? d.now}
            empty={ws.brief?.items.length ? null : "Nothing from the $1M+ wallets overnight yet."}>
            <ol className="t-log">{ws.brief?.items.slice(0, 3).map(it => (
              <li key={it.key}><a href={it.href}>{it.lines[0]}</a><span className="t-muted">{it.lines[1]}</span></li>
            ))}</ol>
            <p className="t-panel__links"><a className="t-link" href="/brief">THE WHOLE BRIEF →</a></p>
          </Panel>

          <Panel n={n++} title="Ask Insidir" span={2} testid="home-ask" meta={<>ANSWERS ONLY FROM INSIDIR&apos;S DATA</>} source="Insidir tables · Polymarket public data" fetchedAt={d.now}>
            <AskPanel examples={[
              "Who's the best NFL wallet this month and what's he on today?",
              open.length ? "Is anyone big against my bets?" : "Is anyone big against my Chargers bet?",
              // A market that's still open and priced, so the price history is there to answer it.
              (() => { const t = d.board.find(b => b.priceNow !== null && b.priceNow > 0.01 && b.priceNow < 0.99)?.title ?? d.board.find(b => b.result === null)?.title ?? m?.title ?? null; return t ? `Why did the ${t.replace(/\?$/, "")} odds move?` : "Why did the Hegseth odds move?"; })(),
            ]} />
          </Panel>

          <Panel n={n++} title="Top position today" testid="home-top" source="Polymarket public data" fetchedAt={d.now} empty={d.top ? null : "No open position from a $1M+ wallet today."}>
            {d.top ? <Ticket bet={d.top.bet} edge={d.top.edge} art={null} testid="home-ticket" /> : null}
          </Panel>

          <Panel n={n++} title="Where they disagree with the price" testid="home-disagree" source="Polymarket public data" fetchedAt={d.now}
            empty={d.disagree.length ? null : "No market where the $1M+ money and the price disagree right now."}>
            {d.insight.disagree ? <p className="t-muted t-small">{d.insight.disagree}</p> : null}
            <ol className="t-log">{d.disagree.map(x => (
              <li key={x.marketId} data-testid="disagree-card"><a href={marketPath(x.marketId, x.title)}>{x.title}</a><Meter d={x} /></li>
            ))}</ol>
          </Panel>

          <Panel n={n++} title="Same bet, two prices" testid="home-gaps" compact source="Kalshi + Polymarket" fetchedAt={d.now}
            empty={d.gaps.length ? null : "No price gap between Kalshi and Polymarket right now."}>
            <div className="t-scroll"><table className="t-table t-table--compact">
              <thead><tr><th>Market</th><th className="r">Kalshi</th><th className="r">Poly</th><th className="r">Per $100</th></tr></thead>
              <tbody>{d.gaps.map(g => {
                const lo = Math.min(g.kalshi, g.polymarket), hi = Math.max(g.kalshi, g.polymarket), extra = 100 / lo - 100 / hi;
                return (
                  <tr key={g.title + g.outcome} data-testid="gap-card"><td className="t-ell" title={`${g.title} · ${g.outcome}`}>{g.title} · {g.outcome}</td>
                    <td className="r">{cents(g.kalshi)}</td><td className="r">{cents(g.polymarket)}</td><td className="r"><b className="t-strong">+{dollars(extra)}</b></td></tr>
                );
              })}</tbody>
            </table></div>
            <p className="t-panel__links t-muted">Per $100, what the cheaper venue pays more if it wins. In the US, Insidir links to Kalshi only.</p>
          </Panel>

          <Panel n={n++} title="Wallets worth following" span={2} testid="home-wallets" source="Polymarket public data" fetchedAt={d.now}
            empty={d.wallets.length ? null : "No wallet to suggest yet."}>
            {d.insight.wallets ? <p className="t-muted t-small">{d.insight.wallets}</p> : null}
            <WalletCards wallets={d.wallets} today={Boolean(d.today)} />
          </Panel>

          <Panel n={n++} title="Your desk" testid="home-desk" source="Your account" fetchedAt={d.now}>
            <div className="t-desk" data-testid="desk-copies">
              <p className="t-label">Your copies</p>
              {d.copies && d.copies.list.length ? (
                <ul className="t-lines">{d.copies.list.slice(0, 5).map(x => (
                  <li key={x.id}><span>{x.title} · <b>{x.outcome}</b> at {cents(x.price)}</span> <span className="t-muted">{x.result === "won" ? <span className="t-up">WON {signed(x.pnl ?? 0)}</span> : x.result === "lost" ? <span className="t-down">LOST {signed(x.pnl ?? 0)}</span> : x.result === "void" ? "VOID" : d.copyNow[x.id] !== undefined ? <>NOW {cents(d.copyNow[x.id]!)}{(() => { const mv = Math.round((d.copyNow[x.id]! - x.price) * 100); return mv ? <span className={mv > 0 ? "t-up" : "t-down"}> {mv > 0 ? "+" : "−"}{Math.abs(mv)}¢</span> : null; })()}</> : "OPEN"}</span></li>
                ))}</ul>
              ) : <p className="t-empty">Copy a bet from the board and it shows here, with its result.</p>}
              <a className="t-link" href="/copies/yours">ALL YOUR COPIES →</a>
            </div>
            <div className="t-desk" data-testid="desk-follows">
              <p className="t-label">Wallets you follow</p>
              {d.desk.following ? <p className="t-kpi">{d.desk.following}</p> : null}
              <p className="t-muted t-small">{d.desk.following ? "We ping you when they bet." : "You don't follow a wallet yet. Follow one and we ping you when it bets."}</p>
              <a className="t-link" href="/wallets">WALLETS →</a>
            </div>
            <div className="t-desk" data-testid="desk-pings">
              <p className="t-label">Pings on this device</p>
              <PingsLink />
              <p className="t-muted t-small">A ping within a minute of a $25K+ millionaire bet in your categories. At most 8 a day; quiet 11pm to 8am.</p>
            </div>
          </Panel>

          {d.stream ? (
            <Panel n={n++} title="Money by category · last 24h" span={3} testid="home-stream" source="Polymarket public data" fetchedAt={d.now}>
              <Stream data={d.stream} />
            </Panel>
          ) : null}

          {d.election && d.election.day.races.length ? (
            <Panel n={n++} title="Election · tonight, every race" span={3} testid="home-election" source="Polymarket public data" fetchedAt={d.now}>
              {d.election.insight ? <p className="t-muted t-small">{d.election.insight}</p> : null}
              <RaceCards races={d.election.day.races.slice(0, 6)} />
              <p className="t-panel__links"><a className="t-link" href="/election">EVERY RACE →</a></p>
            </Panel>
          ) : null}
        </PanelGrid>
      </div>
    </Frame>
  );
}
