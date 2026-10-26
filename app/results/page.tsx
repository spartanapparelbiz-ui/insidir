/* Results (docs/INSIDIR-V2.md §6): every settled move, newest settlement first, filterable by tab, size and "top traders
 * only". Won or lost, the amount, and when. Our proof page: complete and honest, losses included. */
import type { Metadata } from "next";
import Link from "next/link";
import { SourceA } from "@/components/v2/MoveCard";
import { moveSource } from "@/lib/moves/source";
import { Photo } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { agoText, dollars } from "@/lib/moves/copy";
import { isTopTrader, walletLabel } from "@/lib/moves/records";
import { listMoves, recordsFor } from "@/lib/moves/store";
import type { Move, Tab } from "@/lib/moves/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results", description: "Every big move we've shown that has settled, won or lost. Real past moves. Not a promise." };

const SIZES = [10_000, 50_000, 100_000];

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ tab?: string; min?: string; top?: string }> }) {
  const now = Date.now();
  const sp = await searchParams;
  const viewer = await getViewer();
  const tab: Tab | null = sp.tab === "sports" || sp.tab === "markets" ? sp.tab : null;
  const min = SIZES.includes(Number(sp.min)) ? Number(sp.min) : 10_000;
  const topOnly = sp.top === "1";
  let rows: Move[] = [];
  let recs = new Map<string, Parameters<typeof isTopTrader>[0] & object>();
  if (hasDatabase()) {
    const db = getDb();
    rows = await listMoves(db, { settled: true, tab, min, limit: 200 }).catch(() => []);
    recs = await recordsFor(db, rows.map(r => r.wallet ?? "")).catch(() => new Map());
  }
  const shown = topOnly ? rows.filter(r => r.wallet && isTopTrader(recs.get(r.wallet))) : rows;
  const won = shown.filter(r => r.result === "won").length, lost = shown.filter(r => r.result === "lost").length;
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const v = { tab: tab ?? "", min: String(min), top: topOnly ? "1" : "", ...o };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    return `/results?${p}`;
  };
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/results" trialHref={unlockHref("insidir")} />
      <main className="wrap app2 results">
        <h1 className="feed2__h">Results</h1>
        <p className="results__label">Real past moves. Not a promise.</p>
        <div className="chips" aria-label="Filters">
          <Link className="chip2" aria-current={(!tab) ? "true" : undefined} href={q({ tab: null })}>All</Link>
          <Link className="chip2" aria-current={(tab === "sports") ? "true" : undefined} href={q({ tab: "sports" })}>Sports</Link>
          <Link className="chip2" aria-current={(tab === "markets") ? "true" : undefined} href={q({ tab: "markets" })}>Markets</Link>
          {SIZES.map(s => <Link key={s} className="chip2" aria-current={(min === s) ? "true" : undefined} href={q({ min: String(s) })}>{dollars(s).replace(",000", "k")}+</Link>)}
          <Link className="chip2" aria-current={(topOnly) ? "true" : undefined} href={q({ top: topOnly ? null : "1" })}>Top traders only</Link>
        </div>
        {shown.length ? (
          <>
            <p className="results__sum">{shown.length} settled: <span className="money">{won} won</span>, <span className="loss">{lost} lost</span>{shown.length - won - lost ? `, ${shown.length - won - lost} refunded` : ""}.</p>
            <ol className="rlist">
              {shown.map(r => (
                <li key={r.id} className="rlist__row">
                  <span className={`rlist__res rlist__res--${r.result}`}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Refunded"}</span>
                  <span className="rlist__what">
                    <span className="rlist__amt">{dollars(r.amount)}</span> on {r.outcome} · <Link href={`/market/${encodeURIComponent(r.marketId)}`}>{r.marketTitle}</Link>
                    <span className="rlist__who">{r.source === "kalshi" ? "Someone on Kalshi" : isTopTrader(recs.get(r.wallet ?? "")) ? `Top trader ${walletLabel(r.wallet!, r.walletName)}` : walletLabel(r.wallet!, r.walletName)}</span>
                  </span>
                  <span className="rlist__when"><time dateTime={new Date(r.settledAt ?? r.at).toISOString()}>{agoText(r.settledAt ?? r.at, now)}</time>
                      {moveSource(r) ? <SourceA link={moveSource(r)!} className="source rlist__src" /> : null}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="empty">
            <Photo n={2} className="empty__photo" wideOnly />
            <p className="empty__h">Nothing settled yet{topOnly ? " from top traders" : ""}.</p>
            <p className="empty__p">Moves show up here, won or lost, as their markets settle.</p>
            <Link className="btn btn--secondary" href="/feed">See the live feed</Link>
          </div>
        )}
      </main>
    </>
  );
}
