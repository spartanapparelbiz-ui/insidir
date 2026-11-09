/* The record (/results), on the terminal. First, how every settled millionaire bet did over the last 30 days, losses
 * included (lib/results/record.ts): won and lost, $100 on every bet at the price the wallet paid (only from 30 settled
 * bets), by category and by day. Then following the pings on Kalshi (lib/results/pings.ts): every buy ping on a market
 * with a Kalshi twin, at Kalshi's price when it was sent, settled with the bet. Then the latest settled bets (wallets
 * as short addresses, never a name or a picture). Public. Past results, not a promise. */
import type { Metadata } from "next";
import { isReady } from "@/lib/features";
import { Frame } from "@/components/brand/app/Frame";
import { BetRow } from "@/components/brand/BetRow";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo } from "@/lib/brand/categories";
import { PAST } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { betPath } from "@/lib/entities/slug";
import { memo } from "@/lib/memo";
import { recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid, TRIAL } from "@/lib/plans";
import { MIN_SETTLED, millionaireRecord, settledCount, STAKE, type RecordView, type Tally } from "@/lib/results/record";
import { kalshiPingRecord, type KalshiRecord } from "@/lib/results/pings";
import { autopilotBacktests } from "@/lib/db/schema";
import { REPORT_KEY, type RulesReport } from "@/lib/autopilot/report";
import { eq } from "drizzle-orm";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The record", description: "Following the pings on Kalshi, and how every settled millionaire bet did, losses included: won and lost, $100 on every one. Past results, not a promise." };

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const tone = (v: number) => (v > 0 ? "t-up" : v < 0 ? "t-down" : "t-flat");
const DAYF = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-11-04" → "Wed, Nov 4". */
const dayLabel = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? DAYF.format(new Date(`${d}T12:00:00Z`)) : d);
const categoryName = (c: string) => { try { return categoryInfo(c as Parameters<typeof categoryInfo>[0]).name; } catch { return c; } };
const tallyText = (t: Tally) => `${t.won} won, ${t.lost} lost${t.void ? `, ${t.void} voided` : ""}`;
const RES: Record<string, string> = { won: "Won", lost: "Lost", void: "Voided" };

export default async function ResultsPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  let rec: RecordView | null = null, latest: BoardBet[] = [], kal: KalshiRecord | null = null, rules: RulesReport | null = null;
  if (hasDatabase()) {
    const db = getDb();
    [rec, latest, kal] = await Promise.all([
      memo("results:record", 60_000, () => millionaireRecord(db, now)).catch(() => null),
      recentBets(db, { now, all: true, tier: "millionaire", limit: 200, member: true }).then(l => l.filter(b => b.result).slice(0, 10)).catch(() => []),
      memo("results:kalshi", 60_000, () => kalshiPingRecord(db, now)).catch(() => null),
    ]);
    if (isReady("autopilot")) rules = await memo("results:rules", 60_000, async () => ((await db.select().from(autopilotBacktests).where(eq(autopilotBacktests.key, REPORT_KEY)).limit(1))[0]?.result ?? null) as unknown as RulesReport | null).catch(() => null);
  }
  const n = rec ? settledCount(rec.total) : 0, kn = kal ? settledCount(kal.total) : 0;
  const SRC = "Polymarket public data · Insidir record";
  let p = 0;
  return (
    <Frame member={member} current="board" testid="results-page">
      <div className="t-wrap tg-page">
        <header className="tg-head">
          <h1 className="tg-h1" id="ro-h">How the millionaires&apos; bets actually did.</h1>
          <p className="tg-sub">Every settled bet from a wallet up $1M+ in the last {rec?.days ?? 30} days, at the price they paid. Losses included. {PAST}</p>
        </header>
        <PanelGrid>
          <Panel n={++p} title={`Record · settled $1M+ bets, last ${rec?.days ?? 30} days`} meta={n ? `${n} settled` : null} span={2} testid="results-own" source={SRC} fetchedAt={now}>
            <div data-testid="results-total">
              {rec && n ? (
                <>
                  <dl className="tg-kpis">
                    <div className="tg-kpi"><dt className="t-label">Record</dt><dd className="tg-kpi__n" data-testid="results-tally">{tallyText(rec.total)}</dd></div>
                    <div className="tg-kpi"><dt className="t-label">${STAKE} on every one</dt><dd className={`tg-kpi__n ${rec.net !== null ? tone(rec.net) : ""}`}>{rec.net !== null ? signed(rec.net) : "—"}</dd><dd className="tg-kpi__s">{rec.net !== null ? `${dollars(rec.total.staked)} in` : `from ${MIN_SETTLED} settled`}</dd></div>
                  </dl>
                  {rec.net !== null
                    ? <p className="tg-note" data-testid="results-net">${STAKE} on every one at the price they paid: {dollars(rec.total.staked)} in, <b>{signed(rec.net)}</b> back.</p>
                    : <p className="tg-note" data-testid="results-building">The ${STAKE}-a-bet line shows from {MIN_SETTLED} settled bets: {n} so far.</p>}
                  <p className="tg-note">It&apos;s the price they paid, not one you could have got. {PAST}</p>
                </>
              ) : <p className="t-empty">No millionaire bet has settled in the last 30 days yet.</p>}
            </div>
          </Panel>

          <Panel n={++p} title="By category" testid="results-categories" source={SRC} empty={rec && rec.byCategory.length ? null : "No settled bets by category yet."}>
            {rec && rec.byCategory.length ? (
              <table className="t-table" data-testid="results-by-category">
                <thead><tr><th scope="col">Category</th><th scope="col">Record</th><th scope="col" className="r">${STAKE} a bet</th></tr></thead>
                <tbody>{rec.byCategory.map(c => {
                  const net = c.back - c.staked, enough = settledCount(c) >= MIN_SETTLED;
                  return <tr key={c.category}><td>{categoryInfo(c.category).name}</td><td>{tallyText(c)}</td><td className={`r ${enough ? `t-strong ${tone(net)}` : "t-muted"}`}>{enough ? signed(net) : `${settledCount(c)} of ${MIN_SETTLED}`}</td></tr>;
                })}</tbody>
              </table>
            ) : null}
          </Panel>

          <Panel n={++p} title="Following the pings on Kalshi" meta={kal ? `${kal.pinged} sent · ${kal.days} days` : null} span={2} testid="results-hero" source="Kalshi prices · Polymarket public data" fetchedAt={now}>
            <p className="tg-note" style={{ marginTop: 0 }}>Every time a $1M+ wallet bought into a market Kalshi also lists, we pinged members with Kalshi&apos;s price. Here is what $100 at that price did.</p>
            <div data-testid="results-kalshi">
              {kal && kn ? (
                <>
                  <dl className="tg-kpis">
                    <div className="tg-kpi"><dt className="t-label">Record</dt><dd className="tg-kpi__n" data-testid="results-kalshi-tally">{tallyText(kal.total)}</dd></div>
                    <div className="tg-kpi"><dt className="t-label">${STAKE} on every ping</dt><dd className={`tg-kpi__n ${kal.net !== null ? tone(kal.net) : ""}`}>{kal.net !== null ? signed(kal.net) : "—"}</dd></div>
                  </dl>
                  {kal.net !== null
                    ? <p className="tg-note" data-testid="results-kalshi-net">${STAKE} on every ping at Kalshi&apos;s price: {dollars(kal.total.staked)} in, <b>{signed(kal.net)}</b> back, before Kalshi&apos;s fees.</p>
                    : <p className="tg-note" data-testid="results-kalshi-building">The ${STAKE}-a-ping line shows from {MIN_SETTLED} settled pings: {kn} so far, {kal.pinged} sent in the last {kal.days} days.</p>}
                </>
              ) : <p className="t-empty" data-testid="results-kalshi-empty">{kal && kal.pinged ? `${kal.pinged} ${kal.pinged === 1 ? "ping" : "pings"} on Kalshi markets in the last ${kal.days} days; none has settled yet.` : "No ping on a Kalshi market has settled yet. The record starts with the first one."}</p>}
            </div>
            {kal && kal.latest.length ? (
              <div className="t-scroll">
                <table className="t-table" data-testid="results-kalshi-rows">
                  <thead><tr><th scope="col">Ping</th><th scope="col" className="r">Kalshi then</th><th scope="col" className="r">Result</th></tr></thead>
                  <tbody>{kal.latest.slice(0, 10).map(x => <tr key={x.id}><td className="tg-mkt">{x.kind === "add" ? "Added to" : "Bought"} {x.outcome} · {x.title}</td><td className="r t-strong">{Math.round(x.kalshiPrice * 100)}¢</td>
                    <td className="r"><span className={`tg-res tg-res--${x.result ?? "open"}`}>{x.result ? RES[x.result] ?? x.result : "Open"}</span></td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <p className="tg-note">Kalshi&apos;s price when the ping went out, the same side the wallet bought. {PAST}</p>
          </Panel>

          <Panel n={++p} title="Day by day" meta="ET" testid="results-days" source={SRC} empty={rec && rec.byDay.length ? null : "No settled days yet."}>
            {rec && rec.byDay.length ? (
              <table className="t-table" data-testid="results-by-day">
                <thead><tr><th scope="col">Day (ET)</th><th scope="col">Record</th><th scope="col" className="r">${STAKE} a bet</th></tr></thead>
                <tbody>{rec.byDay.slice(0, 7).map(d => <tr key={d.day}><td>{dayLabel(d.day)}</td><td>{tallyText(d)}</td><td className={`r t-strong ${tone(d.back - d.staked)}`}>{signed(d.back - d.staked)}</td></tr>)}</tbody>
              </table>
            ) : null}
          </Panel>

          {rules && rules.rows.length ? (
            <Panel n={++p} title="Every rule we tested" meta={`${rules.days} days · $25 a bet`} span={3} testid="results-rules" source="Kalshi prices · Insidir backtest">
              <p className="tg-note" style={{ marginTop: 0 }}>The last {rules.days} days of big bets, each rule followed on Kalshi at Kalshi&apos;s ask then + 1¢, $25 a bet, held to settlement, losses included. {rules.onKalshi.toLocaleString("en-US")} of {rules.bets.toLocaleString("en-US")} bets were on a market Kalshi lists; the rest can&apos;t be followed on Kalshi and are left out.</p>
              <div className="t-scroll">
                <table className="t-table" data-testid="results-rules-table">
                  <thead><tr><th scope="col">Rule</th><th scope="col" className="r">Settled</th><th scope="col" className="r">Won · lost</th><th scope="col" className="r">Net</th><th scope="col" className="r">Return</th></tr></thead>
                  <tbody>{rules.rows.filter(x => x.settled > 0).map(x => <tr key={x.key} data-leads={x.leads ? "1" : "0"}><td>{x.group === "Category" ? categoryName(x.name) : x.name}<span className="t-muted"> · {x.group}</span></td>
                    <td className="r">{x.settled}</td><td className="r">{x.result.won} · {x.result.lost}</td><td className={`r t-strong ${tone(x.result.net)}`}>{signed(x.result.net)}</td>
                    <td className={`r ${x.result.roi === null ? "" : tone(x.result.roi)}`}>{x.result.roi === null ? "" : `${x.result.roi >= 0 ? "+" : "−"}${Math.abs(Math.round(x.result.roi * 100))}%`}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="tg-note">A rule is only recommended with {100} or more settled bets in profit. Kalshi&apos;s fees aren&apos;t taken off. {rules.note} Past results, not a promise.</p>
            </Panel>
          ) : null}

          <Panel n={++p} title="The latest settled" meta={latest.length ? `${latest.length} bets` : null} span={3} testid="results-latest" source={SRC} fetchedAt={now}>
            {latest.length ? <ul className="b-rows s-board" data-testid="results-rows">{latest.map(b => <li key={b.id} data-entity="bet"><BetRow polymarket={viewer.region === "non_us"} bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
              : <p className="t-empty">Nothing settled yet.</p>}
            <div className="tg-row">
              <a className="t-btn2" href="/board">Every bet on the board</a>
              <a className="t-btn2" href="/record">Every position we&apos;ve flagged</a>
              {member ? null : <a className="t-cta" href="/go" data-checkout="results">Start for ${TRIAL.fee}</a>}
            </div>
          </Panel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
