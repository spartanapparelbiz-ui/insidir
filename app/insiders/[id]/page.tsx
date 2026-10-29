/* An insider (/insiders/<cik>-<slug>): the person as the SEC files them, their role(s), every open-market buy and sale
 * on their Form 4s we hold, total bought, and how the stock did after their buys (the filed price against the latest
 * close we hold; left out when we hold none). Public: anyone sees the last 30 days; the full history and Follow are
 * for members (lib/profiles/sec.ts freeWindow). A bare /insiders/<cik> or an old slug redirects to the canonical one. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { unlockHref } from "@/components/app/links";
import { SourceA } from "@/components/v2/MoveCard";
import { Avatar } from "@/components/v2/Avatar";
import { tickerMonogram } from "@/lib/moves/avatar";
import { FollowButton } from "@/components/v2/FollowButton";
import { calDate, exactDollars, followState, signedPct } from "@/components/v2/profiles/shared";
import { OlderLocked, perShare, roleLine, SecFrame, TradesTable } from "@/components/v2/sec/shared";
import { Section, Table, Tiles } from "@/components/stats/Stats";
import { closesFor, SPY } from "@/lib/stocks/prices";
import { AFTER_DAYS, afterBuy, averageAfter } from "@/lib/stocks/returns";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { followList } from "@/lib/moves/store";
import { profileSource } from "@/lib/moves/source";
import { BAND } from "@/lib/photos";
import { isPaid } from "@/lib/plans";
import { companyHref, insiderHref, parseCikSlug, personName } from "@/lib/profiles/name";
import { afterBuys, freeWindow, insiderTotals, tradesByFiling } from "@/lib/profiles/sec";
import { historyOf, insiderTradesFor, latestCloses } from "@/lib/profiles/store";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const ref = parseCikSlug(id);
  if (!ref || !hasDatabase()) return null;
  const db = getDb();
  const [trades, hist] = await Promise.all([insiderTradesFor(db, ref.cik, 1000).catch(() => []), historyOf(db, "owner", ref.cik).catch(() => null)]);
  const filed = trades[0]?.ownerName ?? hist?.name ?? null;
  if (!filed) return null;
  return { ref, trades, hist, filed, name: personName(filed), href: insiderHref(ref.cik, filed) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const x = await load((await params).id);
  if (!x) return { title: "Insider", robots: { index: false } };
  const latest = x.trades[0];
  const role = latest ? roleLine(latest.role, latest.company) : "SEC filer";
  return {
    title: `${x.name}: insider trades`,
    description: `Every open-market buy and sale ${x.name} (${role}) has reported to the SEC on Form 4, with the price and the filing.`,
    alternates: { canonical: x.href },
  };
}

export default async function InsiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const x = await load(id);
  if (!x) notFound();
  if (`/insiders/${id}` !== x.href) permanentRedirect(x.href);
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const db = getDb();
  const following = paid && viewer.user ? (await followList(db, viewer.user.id).catch(() => [])).some(f => f.kind === "insider" && f.target === x.ref.cik) : false;
  const all = tradesByFiling(x.trades);
  const { shown, older } = paid ? { shown: all, older: 0 } : freeWindow(all, now);
  const t = insiderTotals(paid ? x.trades : freeWindow(x.trades, now).shown);
  const closes = await latestCloses(db, shown.flatMap(r => (r.code === "P" && r.ticker ? [r.ticker] : []))).catch(() => new Map());
  const after = afterBuys(shown, closes, now);
  // 30 / 90 / 180 days after each buy against the S&P 500 (SPY), from daily closes (lib/stocks/prices.ts).
  const buys = shown.filter(r => r.code === "P" && r.ticker && r.tradeDate);
  const fromDate = buys.reduce((a, r) => (r.tradeDate! < a ? r.tradeDate! : a), "9999-12-31");
  const series = buys.length ? await closesFor(db, [...new Set(buys.map(r => r.ticker!)), SPY], fromDate).catch(() => new Map()) : new Map();
  const today = new Date(now).toISOString().slice(0, 10);
  const perBuy = buys.filter(r => series.get(r.ticker!.toUpperCase())?.length).map(r => ({ r, after: AFTER_DAYS.map(d => afterBuy(series.get(r.ticker!.toUpperCase())!, series.get(SPY) ?? [], r.tradeDate!, d, today)) }));
  const avg = averageAfter(perBuy.map(p => p.after));
  const roles = [...new Map(x.trades.map(r => [`${r.role}|${r.company}`, { line: roleLine(r.role, r.company), ticker: r.ticker }])).values()];
  return (
    <SecFrame viewer={viewer} current="/insiders">
      <header className="trader__head">
        <Photo n={BAND.profile.stocks} className="trader__photo" band par eager />
        <div className="trader__id">
          <Avatar face={{ src: null, mono: tickerMonogram(x.trades.find(r => r.ticker)?.ticker, x.trades[0]?.company ?? x.name) }} size="profile" />
          <div>
            <p className="trader__kicker">{roles[0]?.line ?? "SEC filer"}</p>
            <h1 className="trader__name">{x.name}</h1>
            <SourceA link={profileSource({ kind: "insider", cik: x.ref.cik })} className="source source--dark" />
          </div>
        </div>
        <div className="trader__acts">
          <FollowButton kind="insider" target={x.ref.cik} state={followState(viewer, following)} trialHref={unlockHref()} label="Follow insider" />
        </div>
      </header>
      {roles.length ? (
        <section className="block" aria-labelledby="roles-h">
          <h2 id="roles-h" className="block__h">{roles.length === 1 ? "Role" : "Roles"}</h2>
          <ul className="sec__roles">{roles.map(r => (
            <li key={r.line}>{r.line}{r.ticker ? <> · <Link href={companyHref(r.ticker)}>{`All ${r.ticker} insider trades`}</Link></> : null}</li>
          ))}</ul>
        </section>
      ) : null}
      <dl className="record record--wide">
        <div><dt>{paid ? "Total bought" : "Bought, last 30 days"}</dt><dd className="money">{exactDollars(t.bought)}</dd><span className="record__sub">{t.buys} {t.buys === 1 ? "filing" : "filings"}</span></div>
        <div><dt>{paid ? "Total sold" : "Sold, last 30 days"}</dt><dd>{exactDollars(t.sold)}</dd><span className="record__sub">{t.sales} {t.sales === 1 ? "filing" : "filings"}</span></div>
      </dl>
      {after.overall ? (
        <p className="sec__after" data-testid="after-buys">
          Since their buys: <b className={after.overall.change >= 0 ? "money" : "loss"}>{signedPct(after.overall.change)}</b>, the price on each filing against the close on {calDate(after.overall.asOf)} ({after.overall.buys} {after.overall.buys === 1 ? "buy" : "buys"}, weighted by dollars).
        </p>
      ) : null}
      <p className="note psource">
        {x.hist?.completeSince ? `Every Form 4 they filed since ${calDate(x.hist.completeSince)}, open-market trades of stock only.`
          : x.hist ? `Still reading their SEC history (${x.hist.pending} filings to go). Open-market trades of stock only.`
          : "Open-market trades of stock from the Form 4s we've read."} Form 4s are filed up to 2 business days after the trade. <Link href="/data">About our data</Link>
      </p>
      {perBuy.length ? (
        <Section id="after-h" title="After their buys" note="How the stock did 30, 90 and 180 days after each open-market buy, from the first close on or after the trade date, against the S&P 500 (SPY) over the same days. Past results.">
          <Tiles cols={3} label="Average after their buys" tiles={avg.map(a => ({
            label: `${a.days} days after, average of ${a.n} ${a.n === 1 ? "buy" : "buys"}${a.vs !== null ? ` · ${a.vs >= 0 ? "+" : "−"}${Math.abs(a.vs).toFixed(1)} pts vs S&P 500` : ""}`,
            value: a.pct === null ? "Not reached yet" : `${a.pct >= 0 ? "+" : "−"}${Math.abs(a.pct).toFixed(1)}%`, tone: a.pct === null ? undefined : a.pct >= 0 ? "money" : "loss",
          }))} />
          <div className="dsub">
            <Table label="Each buy" head={["Buy", "30 days", "90 days", "180 days"]} numeric={[1, 2, 3]}
              rows={perBuy.slice(0, 50).map(({ r, after }) => [
                <span key="b">{r.ticker} · {calDate(r.tradeDate!)}<span className="dtable__sub">{exactDollars(r.value)} at {perShare(r.price)}</span></span>,
                ...after.map((a, i) => a.pct === null ? <span key={i} className="tile__na">Not yet</span>
                  : <span key={i} className={a.pct >= 0 ? "money" : "loss"}>{`${a.pct >= 0 ? "+" : "−"}${Math.abs(a.pct).toFixed(1)}%`}<span className="dtable__sub">{a.vs === null ? "" : `${a.vs >= 0 ? "+" : "−"}${Math.abs(a.vs).toFixed(1)} pts vs S&P`}</span></span>),
              ])} />
          </div>
        </Section>
      ) : null}
      <section className="block" aria-labelledby="trades-h">
        <h2 id="trades-h" className="block__h">{paid ? "Every trade" : "Trades in the last 30 days"}</h2>
        {shown.length ? <TradesTable rows={shown} show="company" since={after.perBuy} /> : <p className="note">{paid ? "No open-market buys or sales of stock on file yet." : "No trades filed in the last 30 days."}</p>}
      </section>
      {paid ? null : <OlderLocked older={older} what="trades" />}
    </SecFrame>
  );
}
