/* Whales (Pro): the latest large trades, as recorded by the worker. Only venues the viewer's region allows. */
import type { Metadata } from "next";
import { Ago } from "@/components/app/Ago";
import { Beacons } from "@/components/app/Beacons";
import { Locked } from "@/components/app/Locked";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { centsText, usd } from "@/lib/format";
import { entitlements } from "@/lib/plans";
import { whales } from "@/lib/queries";
import { allowedVenues } from "@/lib/region";
import { VENUE_NAME } from "@/lib/types";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Big bets", robots: { index: false } };

const short = (w: string): string => (w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);

export default async function WhalesPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const allowed = entitlements(viewer.plan).whales;
  const venues = allowedVenues(viewer.region);
  const trades = allowed ? (await whales(100)).filter(t => venues.includes(t.venue)) : [];
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/whales" />
      <main className="wrap app">
        <Beacons where="whales" />
        <h1 className="page__h">Big bets</h1>
        {allowed ? <p className="muted small">The biggest bets on the apps you use, newest first.</p> : null}
        {!allowed ? (
          <Locked title="Whales" text="See the latest large trades as they happen: who traded, which market, which side, how much and at what price." href={unlockHref("pro", "/whales")} plan="pro" where="whales" />
        ) : trades.length ? (
          <div className="scroll-x">
            <table className="table whales">
              <thead><tr><th>When</th><th>Wallet</th><th>Market</th><th>Trade</th><th className="r">Size</th><th className="r">Price</th><th className="r">Cash</th></tr></thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={`${t.txHash ?? t.wallet}-${i}`}>
                    <td className="nowrap"><Ago at={t.timestamp} now={now} /></td>
                    <td className="nowrap" title={t.wallet}>{t.name ?? short(t.wallet)}</td>
                    <td>{t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer">{t.marketTitle}</a> : t.marketTitle}<span className="dim tiny calc__lbl">{VENUE_NAME[t.venue]}</span></td>
                    <td className="nowrap whales__side">{t.side === "SELL" ? "Sold" : "Bought"} {t.outcome}</td>
                    <td className="r">{Math.round(t.contracts).toLocaleString("en-US")}</td>
                    <td className="r">{centsText(Math.round(t.price * 1000) / 10)}</td>
                    <td className="r">{usd(t.cash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><p className="empty__h">No big bets yet</p><p className="muted small">Big bets show up here as soon as we see them. Leave this page open, or check back later.</p></div>
        )}
      </main>
    </>
  );
}
