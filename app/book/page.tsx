/* /book: every bet the member placed from Insidir (one-tap copies and Autopilot matches they marked placed). Open ones at
 * Kalshi's price now, settled ones at their own fill price, losses included: exposure by category, win rate, net,
 * average entry. Matches waiting for "placed or skipped?" come first; fill prices can be corrected. A daily summary
 * push at the member's time, a CSV of everything and a monthly statement PDF. Insidir never places a bet. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, Stage } from "@/components/system";
import { Rows } from "@/components/system/Figures";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { bookFor, summarize, type Entry } from "@/lib/book/book";
import { category, isCategory } from "@/lib/brand/categories";
import { sentAfter } from "@/lib/autopilot/engine";
import { agoText } from "@/lib/moves/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book", robots: { index: false } };

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Math.abs(n) < 100 && n % 1 ? 2 : 0, maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(n)}`;
const cents = (p: number | null) => (p === null ? "No price" : `${Math.round(p * 100)}¢`);
const catName = (c: string) => (isCategory(c) ? category(c).name : c);
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });
const NOTICES: Record<string, string> = { placed: "Marked placed. It's in your Book.", skipped: "Marked skipped.", saved: "Saved.", error: "That didn't save. Try again." };

function FillForm({ e }: { e: Entry }) {
  return (
    <form method="post" action="/api/book" className="ap-inline">
      <input type="hidden" name="action" value="fill" /><input type="hidden" name="kind" value={e.kind} /><input type="hidden" name="id" value={e.id} />
      <label className="b-small">Your fill (¢)<input type="number" name="fill" min={1} max={99} step={1} defaultValue={Math.round(e.price * 100)} className="s-input ap-num" /></label>
      <button type="submit" className="b-btn b-btn-lg b-ghost" data-testid="book-fill-save">Save</button>
    </form>
  );
}

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [viewer, q] = await Promise.all([requireMember("/book"), searchParams]);
  const now = Date.now(), user = viewer.user!;
  const { entries, pending } = await bookFor(getDb(), user.id, now).catch(() => ({ entries: [] as Entry[], pending: [] }));
  const s = summarize(entries);
  const open = entries.filter(e => e.result === null), settled = entries.filter(e => e.result !== null);
  const notice = q.marked ? NOTICES[q.marked] : q.saved ? NOTICES.saved : q.error ? NOTICES.error : null;
  const head = s.open ? `${s.open} open · ${usd(s.exposure)} at risk${s.live !== null ? ` · ${signed(s.live)} at Kalshi prices` : ""}.` : s.settled ? `${s.settled} settled · ${signed(s.net)} net.` : "Your Book.";
  const thisMonth = new Date(now), months = [0, 1, 2].map(i => new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - i, 15)));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <Frame member current="book" testid="book-page">
      <Stage first className="ap-stage" testid="book-head" labelledBy="bk-h">
        <div className="b-head">
          <h1 id="bk-h" className="b-h2 ap-h1" data-testid="book-head-line">{head}</h1>
          <p className="b-sub">Every trade you placed from Insidir: open ones at Kalshi&apos;s price now, settled ones at your own price, losses included.</p>
          {notice ? <p className="b-msg" role="status" data-testid="book-notice">{notice}</p> : null}
        </div>

        <section className="ap-sec" aria-labelledby="bk-sum">
          <h2 id="bk-sum" className="b-sr">Summary</h2>
          <Panel className="s-col s-col--wide" testid="book-summary">
            <dl className="ap-ticket">
              <div><dt className="b-small">Open</dt><dd data-testid="book-open">{s.open}</dd></div>
              <div><dt className="b-small">At risk</dt><dd data-testid="book-exposure">{usd(s.exposure)}</dd></div>
              <div><dt className="b-small">Open P&amp;L at Kalshi</dt><dd data-testid="book-live">{s.live === null ? "No price yet" : signed(s.live)}</dd></div>
              <div><dt className="b-small">Settled</dt><dd data-testid="book-settled">{s.won} won · {s.lost} lost</dd></div>
              <div><dt className="b-small">Win rate</dt><dd data-testid="book-winrate">{s.winRate === null ? "None settled" : `${Math.round(s.winRate * 100)}%`}</dd></div>
              <div><dt className="b-small">Net</dt><dd data-testid="book-net">{signed(s.net)}</dd></div>
            </dl>
            {s.avgEntry !== null && s.winRate !== null ? <p className="b-small" data-testid="book-entry-vs">Average entry {cents(s.avgEntry)} against a {Math.round(s.winRate * 100)}% win rate: paying {cents(s.avgEntry)} breaks even at {Math.round(s.avgEntry * 100)}%.</p> : null}
          </Panel>
          {s.byCategory.length ? <Panel className="s-col s-col--wide"><Rows label="Exposure by category" rows={s.byCategory.map(c => ({ key: c.category, attrs: { "data-testid": "book-cat" },
            title: <>{catName(c.category)}</>, sub: <>{c.open} open</>, right: usd(c.exposure) }))} /></Panel> : null}
        </section>

        {pending.length ? (
          <section className="ap-sec" aria-labelledby="bk-p">
            <h2 id="bk-p" className="b-h2 ap-h2">Did you place these?</h2>
            <Panel className="s-col s-col--wide" testid="book-pending">
              <ul className="s-rows">
                {pending.map(m => (
                  <li key={m.id} className="s-row ap-pending" data-testid="book-pending-row">
                    <div className="ap-pending__t"><a className="s-link" href={`/t/${m.id}`}>{m.title}</a><span className="b-small">{m.outcome} · {m.contracts} at {cents(m.limitPrice)} limit · {sentAfter(m.latencyMs)} · {agoText(m.matchedAt.getTime(), now)}</span></div>
                    <form method="post" action="/api/book" className="ap-inline">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="b-small">Fill (¢)<input type="number" name="fill" min={1} max={99} step={1} defaultValue={Math.round((m.limitPrice ?? 0) * 100)} className="s-input ap-num" /></label>
                      <button type="submit" name="action" value="placed" className="b-btn b-btn-lg b-primary" data-testid="book-placed">Placed</button>
                      <button type="submit" name="action" value="skipped" className="b-btn b-btn-lg b-ghost" data-testid="book-skipped">Skipped</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        ) : null}

        <section className="ap-sec" aria-labelledby="bk-o">
          <h2 id="bk-o" className="b-h2 ap-h2">Open.</h2>
          {open.length ? <Panel className="s-col s-col--wide"><Rows label="Open" rows={open.map(e => ({
            key: e.key, attrs: { "data-testid": "book-row", "data-state": "open", "data-kind": e.kind },
            title: <a className="s-link" href={e.url}>{e.title}</a>,
            sub: <><b>{e.outcome}</b> · {e.contracts} at {cents(e.price)} · {e.kind === "match" ? "Autopilot" : "Copy"} · Kalshi {e.mark === null ? "has no price now" : `${cents(e.mark)} now`}<details><summary className="b-small">Correct your fill</summary><FillForm e={e} /></details></>,
            right: e.live === null ? usd(e.cost) : signed(e.live),
          }))} /></Panel> : <Panel className="s-form"><p className="b-small" data-testid="book-open-empty">Nothing open. Copies and the Autopilot matches you mark placed show here.</p></Panel>}
        </section>

        <section className="ap-sec" aria-labelledby="bk-s">
          <h2 id="bk-s" className="b-h2 ap-h2">Settled.</h2>
          {settled.length ? <Panel className="s-col s-col--wide"><Rows label="Settled" rows={settled.map(e => ({
            key: e.key, attrs: { "data-testid": "book-row", "data-state": e.result ?? "open", "data-kind": e.kind },
            title: <a className="s-link" href={e.url}>{e.title}</a>,
            sub: <><b>{e.outcome}</b> · {e.contracts} at {cents(e.price)} · {e.result === "won" ? "Won" : e.result === "lost" ? "Lost" : "Void"}<details><summary className="b-small">Correct your fill</summary><FillForm e={e} /></details></>,
            right: signed(e.pnl ?? 0),
          }))} /></Panel> : <Panel className="s-form"><p className="b-small" data-testid="book-settled-empty">Nothing settled yet.</p></Panel>}
        </section>

        <section className="ap-sec" aria-labelledby="bk-x">
          <h2 id="bk-x" className="b-h2 ap-h2">Summary and exports.</h2>
          <Panel className="s-col s-col--wide s-form">
            <form method="post" action="/api/book" className="ap-inline" data-testid="book-push">
              <input type="hidden" name="action" value="push" />
              <label className="b-small">Daily summary push at<input type="time" name="at" defaultValue={user.settings.bookPushAt ?? ""} className="s-input ap-num" /></label>
              <button type="submit" className="b-btn b-btn-lg b-ghost">Save</button>
            </form>
            <p className="b-small">{user.settings.bookPushAt ? `Every day at ${user.settings.bookPushAt}, your time. Clear the time to turn it off.` : "Off. Pick a time to get one push a day with your open trades and yesterday's results."}</p>
            <div className="b-ctas">
              <a className="b-btn b-btn-lg b-ghost" href="/api/book/csv" data-testid="book-csv" download>Download CSV</a>
              {months.map(d => <a key={ym(d)} className="b-btn b-btn-lg b-ghost" href={`/api/book/statement?month=${ym(d)}`} data-testid="book-statement" download>{MONTH.format(d)} statement (PDF)</a>)}
            </div>
          </Panel>
          <p className="b-small b-center">Logged by you. We never place a trade or hold funds. Kalshi&apos;s fees aren&apos;t included. Past results, not a promise.</p>
        </section>
      </Stage>
    </Frame>
  );
}
