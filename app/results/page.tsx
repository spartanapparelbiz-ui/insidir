/* The record (/results), on the homepage's system. First, following the pings on Kalshi (lib/results/pings.ts): every
 * buy ping on a market with a Kalshi twin, at Kalshi's price when it was sent, settled with the bet. Then how every
 * settled millionaire bet did over the last 30 days, losses included (lib/results/record.ts): won and lost, $100 on
 * every bet at the price the wallet paid (only from 30 settled bets), by day and by category, and the latest settled
 * bets (wallets as short addresses, never a name or a picture). Public. Past results, not a promise. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { BetRow } from "@/components/brand/BetRow";
import { Lines, Panel, Pill, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The record", description: "Following the pings on Kalshi, and how every settled millionaire bet did, losses included: won and lost, $100 on every one. Past results, not a promise." };

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const DAYF = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-11-04" → "Wed, Nov 4". */
const dayLabel = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? DAYF.format(new Date(`${d}T12:00:00Z`)) : d);
const categoryName = (c: string) => { try { return categoryInfo(c as Parameters<typeof categoryInfo>[0]).name; } catch { return c; } };
const tallyText = (t: Tally) => `${t.won} won, ${t.lost} lost${t.void ? `, ${t.void} voided` : ""}`;

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
    rules = await memo("results:rules", 60_000, async () => ((await db.select().from(autopilotBacktests).where(eq(autopilotBacktests.key, REPORT_KEY)).limit(1))[0]?.result ?? null) as unknown as RulesReport | null).catch(() => null);
  }
  const n = rec ? settledCount(rec.total) : 0, kn = kal ? settledCount(kal.total) : 0;
  return (
    <Frame member={member} current="board" testid="results-page">
      <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.6, priority: true }} first testid="results-own" labelledBy="ro-h">
        <div className="b-head">
          <Lines as="h1" id="ro-h" lines={["How the millionaires' bets", "actually did."]} size={56} />
          <p className="b-sub" data-m="lift">Every settled bet from a wallet up $1M+ in the last {rec?.days ?? 30} days, at the price they paid. Losses included.</p>
        </div>
        <Panel className="s-col" testid="results-total">
          {rec && n ? (
            <>
              <p className="s-big b-num" data-testid="results-tally">{tallyText(rec.total)}</p>
              {rec.net !== null
                ? <p className="b-sub" data-testid="results-net">${STAKE} on every one at the price they paid: {dollars(rec.total.staked)} in, <b>{signed(rec.net)}</b> back.</p>
                : <p className="b-small" data-testid="results-building">The ${STAKE}-a-bet line shows from {MIN_SETTLED} settled bets: {n} so far.</p>}
              <p className="b-small">It&apos;s the price they paid, not one you could have got. {PAST}</p>
            </>
          ) : <p className="b-empty">No millionaire bet has settled in the last 30 days yet.</p>}
        </Panel>
      </Stage>

      {rec && rec.byCategory.length ? (
        <Stage bg={{ kind: "globe", dark: 0.6 }} testid="results-categories" labelledBy="rc-h">
          <div className="b-head"><Lines as="h2" id="rc-h" lines={["By category."]} size={48} /></div>
          <Panel className="s-col s-prose">
            <table data-testid="results-by-category">
              <thead><tr><th scope="col">Category</th><th scope="col">Record</th><th scope="col">${STAKE} a bet</th></tr></thead>
              <tbody>{rec.byCategory.map(c => <tr key={c.category}><th scope="row">{categoryInfo(c.category).name}</th><td>{tallyText(c)}</td><td className="b-num">{settledCount(c) >= MIN_SETTLED ? signed(c.back - c.staked) : `${settledCount(c)} of ${MIN_SETTLED}`}</td></tr>)}</tbody>
            </table>
          </Panel>
        </Stage>
      ) : null}

      <Stage testid="results-hero" labelledBy="r-h">
        <div className="b-head">
          <Lines as="h2" id="r-h" lines={["Following the pings", "on Kalshi."]} size={48} />
          <p className="b-sub" data-m="lift">Every time a $1M+ wallet bought into a market Kalshi also lists, we pinged members with Kalshi&apos;s price. Here is what $100 at that price did.</p>
        </div>
        <Panel className="s-col" testid="results-kalshi">
          {kal && kn ? (
            <>
              <p className="s-big b-num" data-testid="results-kalshi-tally">{tallyText(kal.total)}</p>
              {kal.net !== null
                ? <p className="b-sub" data-testid="results-kalshi-net">${STAKE} on every ping at Kalshi&apos;s price: {dollars(kal.total.staked)} in, <b>{signed(kal.net)}</b> back, before Kalshi&apos;s fees.</p>
                : <p className="b-small" data-testid="results-kalshi-building">The ${STAKE}-a-ping line shows from {MIN_SETTLED} settled pings: {kn} so far, {kal.pinged} sent in the last {kal.days} days.</p>}
              <p className="b-small">Kalshi&apos;s price when the ping went out, the same side the wallet bought. {PAST}</p>
            </>
          ) : <p className="b-empty" data-testid="results-kalshi-empty">{kal && kal.pinged ? `${kal.pinged} ${kal.pinged === 1 ? "ping" : "pings"} on Kalshi markets in the last ${kal.days} days; none has settled yet.` : "No ping on a Kalshi market has settled yet. The record starts with the first one."}</p>}
        </Panel>
        {kal && kal.latest.length ? (
          <Panel className="s-col s-prose">
            <table data-testid="results-kalshi-rows">
              <thead><tr><th scope="col">Ping</th><th scope="col">Kalshi then</th><th scope="col">Result</th></tr></thead>
              <tbody>{kal.latest.slice(0, 10).map(p => <tr key={p.id}><th scope="row">{p.kind === "add" ? "Added to" : "Bought"} {p.outcome} · {p.title}</th><td className="b-num">{Math.round(p.kalshiPrice * 100)}¢</td><td>{p.result === "won" ? "Won" : p.result === "lost" ? "Lost" : p.result === "void" ? "Voided" : "Open"}</td></tr>)}</tbody>
            </table>
          </Panel>
        ) : null}
      </Stage>

      {rules && rules.rows.length ? (
        <Stage testid="results-rules" labelledBy="rr-h">
          <div className="b-head"><Lines as="h2" id="rr-h" lines={["Every rule we tested."]} size={48} />
            <p className="b-sub">The last {rules.days} days of big bets, each rule followed on Kalshi at Kalshi&apos;s ask then + 1¢, $25 a bet, held to settlement, losses included. {rules.onKalshi.toLocaleString("en-US")} of {rules.bets.toLocaleString("en-US")} bets were on a market Kalshi lists; the rest can&apos;t be followed on Kalshi and are left out.</p></div>
          <Panel className="s-col s-col--wide s-prose">
            <table data-testid="results-rules-table">
              <thead><tr><th scope="col">Rule</th><th scope="col">Settled</th><th scope="col">Won · lost</th><th scope="col">Net</th><th scope="col">Return</th></tr></thead>
              <tbody>{rules.rows.filter(x => x.settled > 0).map(x => <tr key={x.key} data-leads={x.leads ? "1" : "0"}><th scope="row">{x.group === "Category" ? categoryName(x.name) : x.name}<span className="b-small"> · {x.group}</span></th>
                <td className="b-num">{x.settled}</td><td>{x.result.won} · {x.result.lost}</td><td className="b-num">{signed(x.result.net)}</td>
                <td className="b-num">{x.result.roi === null ? "" : `${x.result.roi >= 0 ? "+" : "−"}${Math.abs(Math.round(x.result.roi * 100))}%`}</td></tr>)}</tbody>
            </table>
            <p className="b-small">A rule is only recommended with {100} or more settled bets in profit. Kalshi&apos;s fees aren&apos;t taken off. {rules.note} Past results, not a promise.</p>
          </Panel>
        </Stage>
      ) : null}

      {rec && rec.byDay.length ? (
        <Stage bg={{ kind: "globe", dark: 0.65 }} testid="results-days" labelledBy="rd-h">
          <div className="b-head"><Lines as="h2" id="rd-h" lines={["Day by day."]} size={48} /></div>
          <Panel className="s-col s-prose">
            <table data-testid="results-by-day">
              <thead><tr><th scope="col">Day (ET)</th><th scope="col">Record</th><th scope="col">${STAKE} a bet</th></tr></thead>
              <tbody>{rec.byDay.slice(0, 7).map(d => <tr key={d.day}><th scope="row">{dayLabel(d.day)}</th><td>{tallyText(d)}</td><td className="b-num">{signed(d.back - d.staked)}</td></tr>)}</tbody>
            </table>
          </Panel>
        </Stage>
      ) : null}

      <Stage bg={{ kind: "globe", dark: 0.7 }} testid="results-latest" labelledBy="rl-h">
        <div className="b-head"><Lines as="h2" id="rl-h" lines={["The latest settled."]} size={48} /></div>
        {latest.length ? <ul className="b-rows s-board" data-testid="results-rows">{latest.map(b => <li key={b.id} data-entity="bet"><BetRow bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
          : <p className="b-empty b-center">Nothing settled yet.</p>}
        <p className="b-center b-small" style={{ marginTop: 14 }}><a href="/board">Every bet on the board</a></p>
        {member ? null : <div className="b-center"><div className="b-ctas"><Pill href="/go" data-checkout="results">Start for ${TRIAL.fee}</Pill></div></div>}
      </Stage>
    </Frame>
  );
}
