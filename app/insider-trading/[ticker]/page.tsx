/* A company's insider trades (/insider-trading/<TICKER>): every open-market buy and sale its insiders filed on Form 4
 * that we hold, newest first, and "X insiders bought this month". Public: anyone sees the last 30 days; the full
 * history and Follow are for members. A lower-case ticker redirects to the upper-case one. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { unlockHref } from "@/components/app/links";
import { FollowButton } from "@/components/v2/FollowButton";
import { calDate, exactDollars, followState } from "@/components/v2/profiles/shared";
import { OlderLocked, SecFrame, TradesTable } from "@/components/v2/sec/shared";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { followList } from "@/lib/moves/store";
import { BAND } from "@/lib/photos";
import { isPaid } from "@/lib/plans";
import { companyHref, parseTicker } from "@/lib/profiles/name";
import { boughtThisMonthLine, freeWindow, insidersBoughtThisMonth, insiderTotals, tradesByFiling } from "@/lib/profiles/sec";
import { historyOf, issuerForTicker, issuerTradesFor } from "@/lib/profiles/store";

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
  return {
    title: `${co.company} (${co.ticker}) insider trading`,
    description: `Every insider buy and sale at ${co.company} (${co.ticker}) reported to the SEC on Form 4: who traded, how much, the price and the filing.`,
    alternates: { canonical: companyHref(co.ticker) },
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const co = await load(raw);
  if (!co) notFound();
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
  const { shown, older } = paid ? { shown: all, older: 0 } : freeWindow(all, now);
  const month = insidersBoughtThisMonth(trades, now);
  const t = insiderTotals(freeWindow(trades, now).shown);
  return (
    <SecFrame viewer={viewer} current="/insider-trading">
      <header className="trader__head">
        <Photo n={BAND.profile.stocks} className="trader__photo" band par eager />
        <div>
          <p className="trader__kicker">Insider trading · {co.ticker}</p>
          <h1 className="trader__name">{co.company}</h1>
          <p className="sec__month" data-testid="bought-this-month">{boughtThisMonthLine(month)}</p>
        </div>
        <div className="trader__acts">
          <FollowButton kind="company" target={co.issuerCik} state={followState(viewer, following)} trialHref={unlockHref()} label="Follow company" />
        </div>
      </header>
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
    </SecFrame>
  );
}
