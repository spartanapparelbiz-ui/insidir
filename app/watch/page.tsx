/* /watch, "Watch my bet" (members), on the terminal: tell Insidir what you hold (a market, a side, your price and stake)
 * or paste your public Polymarket address (read-only, no keys), and it watches the $1M+ money on those markets for you:
 * an explained alert when big money takes the other side, a wallet on your side sells, your side's price moves 5¢+, or
 * the market is about to close (lib/watch). Settled bets show what happened. Visitors see what it is and how to join.
 * Information, not advice. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { cents, signed } from "@/lib/briefing/math";
import { GET_CTA } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import { happenedFor, myRecord, type Happened } from "@/lib/watch/happened";
import { listWatched, type WatchedView } from "@/lib/watch/store";
import { sql } from "drizzle-orm";
import "../watch.css";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Watch my bet",
  description: "Tell Insidir what you hold. It watches the $1M+ money on that market and tells you, in plain words, what it means for your bet.",
  robots: { index: false },
};

const RESULT: Record<string, string> = { won: "Won", lost: "Lost", void: "Void", sold: "Sold" };
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ABOUT = "Tell us what you hold. We watch the $1M+ money on that market and tell you, in plain words, what it means for your bet: when big money takes the other side, when a wallet on your side sells, when the price moves 5¢ or more, and when it's about to close.";

function Bet({ b, alerts, happened }: { b: WatchedView; alerts: Array<{ headline: string; body: string | null; at: number }>; happened: Happened | null }) {
  const pnl = b.pnl;
  return (
    <li className="w-bet" id={b.id} data-testid="watch-bet" data-result={b.result ?? "open"}>
      <div className="w-bet__top">
        <h3 className="w-bet__title"><a href={marketPath(b.marketId, b.title)}>{b.title}</a></h3>
        <span className={`w-res w-res--${b.result ?? "open"}`}>{b.result ? RESULT[b.result] : "Watching"}</span>
      </div>
      <div className="w-nums">
        <span className="w-num"><span>Your side</span><b>{b.outcome}</b></span>
        <span className="w-num"><span>You paid</span><b>{cents(b.price)}</b></span>
        <span className="w-num"><span>Stake</span><b>{dollars(b.amount)}</b></span>
        <span className="w-num"><span>{b.result ? "Settled" : "Now"}</span><b>{b.priceNow === null ? "—" : cents(b.priceNow)}</b></span>
        <span className="w-num"><span>{b.result ? "Result" : "P&L now"}</span><b className={pnl ? (pnl > 0 ? "t-up" : "t-down") : ""} data-testid="watch-pnl">{pnl === null ? "—" : signed(pnl)}</b></span>
      </div>
      {alerts.length ? (
        <ul className="w-alerts" data-testid="watch-alerts">
          {alerts.map((a, i) => <li key={i}><span className="w-alert__t">{ET.format(new Date(a.at)).toUpperCase()} ET</span><p className="w-alert__h">{a.headline}</p>{a.body ? <p className="w-alert__m">{a.body}</p> : null}</li>)}
        </ul>
      ) : null}
      {happened ? (
        <div className="w-happened" data-testid="watch-happened">
          <p><strong>What happened.</strong> {happened.result}</p>
          {happened.right ? <p>{happened.right}</p> : null}
          {happened.following.map((l, i) => <p key={i}>{l}</p>)}
          {happened.mine ? <p><strong>{happened.mine}</strong></p> : null}
        </div>
      ) : null}
      <div className="w-bet__top" style={{ marginTop: 8, alignItems: "center" }}>
        <span className="w-src">{b.origin === "address" ? `From ${b.address ? `${b.address.slice(0, 6)}…${b.address.slice(-4)}` : "your address"}` : "Added by you"} · {ET.format(new Date(b.createdAt)).toUpperCase()} ET</span>
        <form method="post" action="/api/watch"><input type="hidden" name="action" value="remove" /><input type="hidden" name="id" value={b.id} /><button className="w-remove" type="submit">Stop watching</button></form>
      </div>
    </li>
  );
}

export default async function WatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [q, viewer] = await Promise.all([searchParams, getViewer()]);
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const ok = typeof q.ok === "string" ? q.ok.slice(0, 200) : null, error = typeof q.error === "string" ? q.error.slice(0, 200) : null;
  const head = (
    <header className="tg-head" data-testid="watch-hero">
      <h1 className="tg-h1" id="watch-h">Watch my bet.</h1>
      <p className="tg-sub">{ABOUT}</p>
    </header>
  );
  if (!member || !viewer.user || !hasDatabase()) {
    return (
      <Frame member={false} current="following" testid="watch-page">
        <div className="t-wrap tg-page">
          {head}
          <PanelGrid>
            <Panel n={1} title="Watch my bet · members" meta="Explained alerts" span={3} testid="watch-about">
              <table className="t-table">
                <thead><tr><th scope="col">We tell you when</th><th scope="col">With</th></tr></thead>
                <tbody>
                  <tr><td className="tg-wrapcell">A $1M+ wallet takes the other side</td><td className="tg-wrapcell t-muted">How much, and their record in that category</td></tr>
                  <tr><td className="tg-wrapcell">A wallet on your side sells</td><td className="tg-wrapcell t-muted">How much of it, at what price, how soon after buying</td></tr>
                  <tr><td className="tg-wrapcell">Your side&apos;s price moves 5¢ or more</td><td className="tg-wrapcell t-muted">Your own profit or loss right now</td></tr>
                  <tr><td className="tg-wrapcell">The market is about to close</td><td className="tg-wrapcell t-muted">The deadline and what it resolves on</td></tr>
                </tbody>
              </table>
              <div className="tg-row"><a className="t-cta" href="/go" data-testid="watch-join" data-checkout="watch">{GET_CTA}</a></div>
              <p className="tg-note">Members only. Alerts arrive within minutes of the trade we see. Information, not advice.</p>
            </Panel>
          </PanelGrid>
        </div>
      </Frame>
    );
  }
  const db = getDb(), userId = viewer.user.id, now = Date.now();
  const bets = await listWatched(db, userId).catch(() => [] as WatchedView[]);
  const told = bets.length ? (await db.execute(sql`select watch_id, headline, body, created_at from terminal.told_log where user_id = ${userId} and kind = 'alert' and watch_id is not null
      order by created_at desc limit 300`).catch(() => ({ rows: [] }))).rows as Array<{ watch_id: string; headline: string; body: string | null; created_at: string }> : [];
  const record = await myRecord(db, userId).catch(() => []);
  const settled = bets.filter(b => b.result && b.result !== "sold").slice(0, 20);
  const happened = new Map(await Promise.all(settled.map(async b => [b.id, await happenedFor(db, userId, b.id, record).catch(() => null)] as const)));
  const open = bets.filter(b => !b.result);
  return (
    <Frame member current="following" testid="watch-page">
      <div className="t-wrap tg-page">
        {head}
        {ok ? <p className="tg-msg" data-testid="watch-ok">{ok}</p> : null}
        {error ? <p className="tg-msg tg-msg--error" data-testid="watch-error">{error}</p> : null}
        <PanelGrid>
          <Panel n={1} title="Add a position" meta="Typed in, or read from your address" span={3} testid="watch-forms">
            <div className="w-forms">
              <form className="w-form tg-form" method="post" action="/api/watch" data-testid="watch-add">
                <input type="hidden" name="action" value="add" />
                <h3>Add a bet</h3>
                <label className="tg-field"><span>Market (its Polymarket or Insidir link)</span><input name="market" required placeholder="polymarket.com/event/…" /></label>
                <div className="w-row2">
                  <label className="tg-field"><span>Side</span><select name="side" defaultValue="yes"><option value="yes">Yes</option><option value="no">No</option></select></label>
                  <label className="tg-field"><span>Price paid (¢)</span><input name="price" type="number" min="1" max="99" step="0.1" required placeholder="62" /></label>
                  <label className="tg-field"><span>Stake ($)</span><input name="amount" type="number" min="1" step="any" required placeholder="100" /></label>
                </div>
                <div><button className="tg-btn" type="submit">Watch it</button></div>
              </form>
              <form className="w-form tg-form" method="post" action="/api/watch" data-testid="watch-import">
                <input type="hidden" name="action" value="import" />
                <h3>Or paste your Polymarket address</h3>
                <p className="tg-note" style={{ marginTop: 0 }}>Your public address (0x…), read-only: we never ask for keys or a login. Every open position on it gets watched.</p>
                <label className="tg-field"><span>Address</span><input name="address" required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" /></label>
                <div><button className="tg-btn" type="submit">Watch my positions</button></div>
              </form>
            </div>
          </Panel>
          {record.length ? (
            <Panel n={2} title="Your record by category" meta="Settled watched bets" span={3} testid="watch-record-panel" source="Your watched bets">
              <dl className="tg-kpis" data-testid="watch-record">
                {record.map(r => <div key={r.category} className="tg-kpi"><dt className="t-label">{isCategory(r.category) ? categoryInfo(r.category).name : r.category}</dt>
                  <dd className="tg-kpi__n">{r.won}–{r.lost}</dd><dd className={`tg-kpi__s ${r.net > 0 ? "t-up" : r.net < 0 ? "t-down" : ""}`}>{signed(r.net)}</dd></div>)}
              </dl>
            </Panel>
          ) : null}
          <Panel n={record.length ? 3 : 2} title="Watched positions and alerts" meta={`${open.length} open · ${bets.length - open.length} settled`} span={3} testid="watch-positions"
            source="Polymarket prices · Insidir alerts" fetchedAt={now}>
            <ol className="w-list" data-testid="watch-list">
              {[...open, ...bets.filter(b => b.result)].map(b => (
                <Bet key={b.id} b={b} happened={happened.get(b.id) ?? null}
                  alerts={told.filter(t => t.watch_id === b.id).slice(0, 3).map(t => ({ headline: t.headline, body: t.body, at: new Date(t.created_at).getTime() }))} />
              ))}
            </ol>
            {!bets.length ? <p className="t-empty">Nothing watched yet. Add a bet or paste your address above.</p> : null}
            <p className="tg-note">
              Every alert we send is kept, with how it turned out: <a href="/told" data-testid="watch-told-link">What we told you</a>. A wallet is only ever its tier and short address. Alerts arrive within minutes. Information, not advice.
            </p>
          </Panel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
