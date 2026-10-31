/* A company's insider trades (/insider-trading/<TICKER>): every open-market buy and sale its insiders filed on Form 4
 * that we hold, newest first, and "X insiders bought this month". Public: anyone sees the last 30 days; the full
 * history and Follow are for members. A lower-case ticker redirects to the upper-case one. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { unlockHref } from "@/components/app/links";
import { FollowButton } from "@/components/v2/FollowButton";
import { Avatar } from "@/components/v2/Avatar";
import { tickerMonogram } from "@/lib/moves/avatar";
import { calDate, exactDollars, followState } from "@/components/v2/profiles/shared";
import { OlderLocked, perShare, SecFrame, TradesTable } from "@/components/v2/sec/shared";
import { LineChart, type ChartDot } from "@/components/charts/LineChart";
import { Section } from "@/components/stats/Stats";
import { closesFor, type Close } from "@/lib/stocks/prices";
import { latestCluster } from "@/lib/stocks/returns";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { followList } from "@/lib/moves/store";
import { BAND } from "@/lib/photos";
import { isPaid } from "@/lib/plans";
import { companyHref, parseTicker, personName } from "@/lib/profiles/name";
import { boughtThisMonthLine, freeWindow, insidersBoughtThisMonth, insiderTotals, tradesByFiling } from "@/lib/profiles/sec";
import { historyOf, issuerForTicker, issuerTradesFor } from "@/lib/profiles/store";
import { SecPending } from "@/components/v2/sec/Pending";
import { EntityLd } from "@/lib/seo/jsonld";
import { companyTitle } from "@/lib/seo/titles";
import { insiderHref } from "@/lib/profiles/name";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

/** Other companies whose insiders bought in the last 30 days, most money first: internal links between companies. */
async function relatedCompanies(db: Db, issuerCik: string, now: number): Promise<Array<{ ticker: string; company: string }>> {
  const r = await db.execute(sql`select max(ticker) as ticker, max(company) as company from terminal.insider_trades
    where code = 'P' and ticker is not null and issuer_cik <> ${String(Number(issuerCik))} and filed_at > ${new Date(now - 30 * 86_400_000)}
    group by issuer_cik order by sum(value) desc limit 8`);
  return r.rows as Array<{ ticker: string; company: string }>;
}

export const dynamic = "force-dynamic";

async function load(raw: string) {
  const ticker = parseTicker(raw);
  if (!ticker || !hasDatabase()) return null;
  const co = await issuerForTicker(getDb(), ticker).catch(() => null);
  return co ? { ...co, raw } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const co = await load((await params).ticker);
  if (!co) return { title: "Insider trading", robots: { index: false } };
  const trades = await issuerTradesFor(getDb(), co.issuerCik, 50).catch(() => []);
  const last = trades.find(t => t.code === "P");
  const m = companyTitle(co.company, co.ticker, last ? { owner: personName(last.ownerName), role: last.role, value: tradesByFiling([last], true)[0]?.value ?? last.value, filedAt: last.filedAt } : null);
  return { title: { absolute: `${m.title} · Insidir` }, description: m.description, alternates: { canonical: companyHref(co.ticker) }, openGraph: { title: m.title, description: m.description, url: companyHref(co.ticker) } };
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const co = await load(raw);
  if (!co) {
    const t = parseTicker(raw);
    if (!t) notFound();
    if (decodeURIComponent(raw) !== t) permanentRedirect(companyHref(t));
    return <SecPending title={`${t} insider trading`} what={t} edgar={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${t}&type=4&owner=include&count=40`} />;
  }
  if (decodeURIComponent(raw) !== co.ticker) permanentRedirect(companyHref(co.ticker));
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const db = getDb();
  const [trades, hist, following] = await Promise.all([
    issuerTradesFor(db, co.issuerCik).catch(() => []),
    historyOf(db, "issuer", co.issuerCik).catch(() => null),
    paid && viewer.user ? followList(db, viewer.user.id).then(l => l.some(f => f.kind === "company" && f.target === co.issuerCik)).catch(() => false) : Promise.resolve(false),
  ]);
  const all = tradesByFiling(trades, true);
  const insiders = [...new Map(trades.map(t => [t.ownerCik, { cik: t.ownerCik, name: t.ownerName, role: t.role }])).values()].slice(0, 20);
  const related = await relatedCompanies(db, co.issuerCik, now).catch(() => []);
  const { shown, older } = paid ? { shown: all, older: 0 } : freeWindow(all, now);
  const month = insidersBoughtThisMonth(trades, now);
  const t = insiderTotals(freeWindow(trades, now).shown);
  const date = (r: { tradeDate: string | null; filedAt: Date }) => r.tradeDate ?? r.filedAt.toISOString().slice(0, 10);
  const cluster = latestCluster(shown.filter(r => r.code === "P").map(r => ({ ownerCik: r.ownerCik, ownerName: r.ownerName, date: date(r) })));
  // The price (daily closes, lib/stocks/prices.ts) with every insider trade on it: a dot per filing, sized by value.
  const closes: Close[] = (await closesFor(db, [co.ticker], new Date(now - 2 * 365 * 86_400_000).toISOString().slice(0, 10)).catch(() => new Map<string, Close[]>())).get(co.ticker) ?? [];
  const maxV = Math.max(1, ...shown.map(r => r.value));
  const dots: ChartDot[] = shown.filter(r => r.price > 0).map(r => ({ t: Date.parse(`${date(r)}T16:00:00Z`), v: r.price, r: 3 + 9 * Math.sqrt(r.value / maxV),
    label: `${personName(r.ownerName)} ${r.code === "P" ? "bought" : "sold"} ${exactDollars(r.value)} at ${perShare(r.price)}`, tone: r.code === "P" ? "won" : "lost" }));
  return (
    <SecFrame viewer={viewer} current="/insider-trading">
      <header className="trader__head">
        <Photo n={BAND.profile.stocks} className="trader__photo" band par eager />
        <div className="trader__id">
          <Avatar face={{ src: null, mono: tickerMonogram(co.ticker, co.company) }} size="profile" />
          <div>
            <p className="trader__kicker">Insider trading · {co.ticker}</p>
            <h1 className="trader__name">{co.company}</h1>
            <p className="sec__month" data-testid="bought-this-month">{boughtThisMonthLine(month)}</p>
          </div>
        </div>
        <div className="trader__acts">
          <FollowButton kind="company" target={co.issuerCik} state={followState(viewer, following)} trialHref={unlockHref()} label="Follow company" />
        </div>
      </header>
      {cluster ? (
        <p className="cluster" data-testid="cluster-buy"><span className="rpill rpill--won">Cluster buy</span>
          {cluster.owners.length} insiders bought between {calDate(cluster.from)} and {calDate(cluster.to)}: {cluster.owners.slice(0, 4).map(personName).join(", ")}{cluster.owners.length > 4 ? ` and ${cluster.owners.length - 4} more` : ""}.</p>
      ) : null}
      <Section id="price-h" title="Price" note="Daily closing price, with every insider trade we show on it: green buys, red sales, bigger for more money.">
        <LineChart points={closes.map(c => ({ t: Date.parse(`${c.date}T21:00:00Z`), v: c.close }))} dots={dots} format="usd" baseline="first" label={`${co.ticker}, daily close`}
          windows={[{ key: "1m", label: "1M", since: now - 30 * 86_400_000 }, { key: "3m", label: "3M", since: now - 91 * 86_400_000 }, { key: "1y", label: "1Y", since: now - 365 * 86_400_000 }, { key: "all", label: "All", since: null }]}
          initial="1y" empty="No daily prices for this ticker yet." />
      </Section>
      <dl className="record record--wide">
        <div><dt>Insiders bought, last 30 days</dt><dd className="money">{exactDollars(t.bought)}</dd><span className="record__sub">{t.buys} {t.buys === 1 ? "filing" : "filings"}</span></div>
        <div><dt>Insiders sold, last 30 days</dt><dd>{exactDollars(t.sold)}</dd><span className="record__sub">{t.sales} {t.sales === 1 ? "filing" : "filings"}</span></div>
      </dl>
      <p className="note psource">
        {hist?.completeSince ? `Every Form 4 filed at ${co.company} since ${calDate(hist.completeSince)}, open-market trades of stock only.`
          : "Open-market trades of stock from the Form 4s we've read."} Form 4s are filed up to 2 business days after the trade. <Link href="/data">About our data</Link>
      </p>
      <section className="block" aria-labelledby="trades-h">
        <h2 id="trades-h" className="block__h">{paid ? "Every insider trade" : "Insider trades in the last 30 days"}</h2>
        {shown.length ? <TradesTable rows={shown} show="insider" /> : <p className="note">{paid ? "No open-market buys or sales of stock on file yet." : "No insider trades filed in the last 30 days."}</p>}
      </section>
      {paid ? null : <OlderLocked older={older} what="trades" />}
      {insiders.length ? (
        <section className="block" aria-labelledby="insiders-h">
          <h2 id="insiders-h" className="block__h">Insiders at {co.company}</h2>
          <ul className="seo__links">{insiders.map(i => <li key={i.cik}><Link href={insiderHref(i.cik, i.name)}>{personName(i.name)}</Link><span> · {i.role}</span></li>)}</ul>
        </section>
      ) : null}
      {related.length ? (
        <section className="block" aria-labelledby="related-h">
          <h2 id="related-h" className="block__h">Other companies with insider buying, last 30 days</h2>
          <ul className="seo__links">{related.map(r => <li key={r.ticker}><Link href={companyHref(r.ticker)}>{r.company} ({r.ticker})</Link></li>)}</ul>
        </section>
      ) : null}
      <EntityLd trail={[["Stocks", "/stocks"], [`${co.company} (${co.ticker})`, companyHref(co.ticker)]]} name={`${co.company} (${co.ticker}) insider trades`} path={companyHref(co.ticker)}
        description={`Every open-market insider purchase and sale at ${co.company} (${co.ticker}) reported to the SEC on Form 4.`} updated={trades[0]?.filedAt ?? null} sources={["https://www.sec.gov/edgar/search/"]} keywords={[co.ticker, co.company, "insider buying", "Form 4"]} />
    </SecFrame>
  );
}
