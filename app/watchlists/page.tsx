/* Watchlists and alerts (/watchlists; docs/INSIDIR-V3.md §3): the member's named lists of companies and people, which
 * forms alert from each, and the in-app alert inbox. An alert lands within minutes of a filing reaching EDGAR
 * (lib/stocks/watchlists.ts); the inbox shows how long after EDGAR's acceptance each one was made. Members only, and
 * Coming soon until `watchlists` is in FEATURES_READY. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { MarkAllRead, WatchlistEditor } from "@/components/sec/Actions";
import { fmt, SecHead, SecPage, SecSoon } from "@/components/sec/Sec";
import { secViewer } from "@/components/sec/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { FORM_FAMILIES, inbox, listsFor, type AlertView, type ListView } from "@/lib/stocks/watchlists";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Watchlists and alerts", robots: { index: false } };

const after = (a: AlertView) => (a.latencyMs === null ? null : a.latencyMs < 60_000 ? `${Math.max(1, Math.round(a.latencyMs / 1000))}s after EDGAR` : `${Math.round(a.latencyMs / 60_000)} min after EDGAR`);

export default async function WatchlistsPage() {
  const { paid, unread, userId } = await secViewer();
  if (!isReady("watchlists")) {
    return (
      <Frame member={paid} current="board" testid="watchlists-page">
        <SecSoon title="Watchlists and alerts" line="Save tickers and people, and get an in-app alert within minutes of a filing reaching EDGAR." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const db = hasDatabase() ? getDb() : null;
  const [lists, alerts] = db && userId ? await Promise.all([listsFor(db, userId).catch(() => [] as ListView[]), inbox(db, userId, 100).catch(() => [] as AlertView[])]) : [[] as ListView[], [] as AlertView[]];
  return (
    <Frame member current="board" testid="watchlists-page">
      <SecPage testid="watchlists">
        <SecHead current="watchlists" unread={unread} title="Watchlists and alerts" sub="Companies and people you follow. When one of them files, an alert lands here within minutes of the filing reaching EDGAR." />

        <section className="sec-section" aria-labelledby="inbox-h">
          <div className="sec-row"><h2 id="inbox-h" className="sec-h2">Alerts{unread ? ` · ${unread} unread` : ""}</h2><MarkAllRead disabled={!unread} /></div>
          {alerts.length ? (
            <div className="sec-wrap">
              <table className="sec-table" data-testid="alerts">
                <thead><tr><th scope="col">When</th><th scope="col">Filing</th><th scope="col">Speed</th><th scope="col">Source</th></tr></thead>
                <tbody>{alerts.map(a => (
                  <tr key={a.id} className={a.readAt ? undefined : "sec-alert-unread"} data-unread={a.readAt ? undefined : "1"}>
                    <td data-label="When">{fmt.etDate(a.createdAt)}<span className="sec-dim"> {fmt.etTime(a.createdAt)}</span></td>
                    <td data-label="Filing">{a.title}</td>
                    <td data-label="Speed" className="sec-dim">{after(a) ?? "—"}</td>
                    <td data-label="Source"><a className="sec-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.form} ↗</a></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="sec-empty" data-testid="alerts-empty">No alerts yet. Add a company or a person below, and their next filing lands here.</p>}
        </section>

        <section className="sec-section" aria-labelledby="lists-h">
          <h2 id="lists-h" className="sec-h2">Your watchlists</h2>
          <WatchlistEditor lists={lists} families={Object.entries(FORM_FAMILIES).map(([k, v]) => [k, v.label])} />
        </section>
        <p className="sec-cov">Alerts are in the app only. Information, not advice.</p>
      </SecPage>
    </Frame>
  );
}
