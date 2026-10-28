/* Results: every settled move, newest settlement first, 50 a page, filterable by tab and size. Won, lost or refunded,
 * the amount, when, and the public record behind it. Public, no log-in: our proof page, complete and honest, losses
 * included (the live feed stays for members). The totals at the top are the home trust block's (lib/trust.ts, one
 * query, one cache), so the two always match. */
import type { Metadata } from "next";
import Link from "next/link";
import { SourceA } from "@/components/v2/MoveCard";
import { moveSource } from "@/lib/moves/source";
import { Photo } from "@/components/Photo";
import { SPOT } from "@/lib/photos";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { getViewer } from "@/lib/auth/viewer";
import { memo } from "@/lib/memo";
import { trustFacts } from "@/lib/trust";
import { RecordCount, RecordLines } from "@/components/TrustBlock";
import { SOLD_EARLY_SHARE } from "@/lib/moves/realize";
import { ScrollOffer } from "@/components/home/ScrollOffer";
import { isPaid } from "@/lib/plans";
import { getDb, hasDatabase } from "@/lib/db";
import { agoText, dollars } from "@/lib/moves/copy";
import { GET_CTA } from "@/lib/copy";
import { isTopTrader, walletLabel } from "@/lib/moves/records";
import { moveFace } from "@/lib/moves/avatar";
import { avatarsOrNone } from "@/lib/moves/avatar-store";
import { Avatar } from "@/components/v2/Avatar";
import { listMoves, recordsFor } from "@/lib/moves/store";
import type { Move, Tab } from "@/lib/moves/types";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results", description: "Every big move we've shown that has settled, won or lost. Real past moves. Not a promise." };

const SIZES = [10_000, 50_000, 100_000];
const PER_PAGE = 50;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ tab?: string; min?: string; top?: string; page?: string }> }) {
  const now = Date.now();
  const sp = await searchParams;
  const viewer = await getViewer();
  const member = Boolean(viewer.user) && isPaid(viewer.plan);
  const page = Math.max(1, Math.min(1000, Math.floor(Number(sp.page) || 1)));
  const tab: Tab | null = sp.tab === "sports" || sp.tab === "markets" ? sp.tab : null;
  const min = SIZES.includes(Number(sp.min)) ? Number(sp.min) : 10_000;
  const topOnly = member && sp.top === "1";
  let rows: Move[] = [];
  let more = false;
  let total: Awaited<ReturnType<typeof trustFacts>>["settled"] = null;
  let recs = new Map<string, Parameters<typeof isTopTrader>[0] & object>();
  let avatars = new Map<string, string>();
  if (hasDatabase()) {
    const db = getDb();
    const [page1, facts] = await Promise.all([
      listMoves(db, { settled: true, tab, min, limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE }).catch(() => []),
      memo("trust", 60_000, () => trustFacts(db)).catch(() => null),
    ]);
    more = page1.length > PER_PAGE;
    rows = page1.slice(0, PER_PAGE);
    total = facts?.settled ?? null;
    [recs, avatars] = await Promise.all([member ? recordsFor(db, rows.map(r => r.wallet ?? "")).catch(() => new Map()) : Promise.resolve(recs), avatarsOrNone(db, rows.map(r => r.wallet ?? ""))]);
  }
  const shown = topOnly ? rows.filter(r => r.wallet && isTopTrader(recs.get(r.wallet))) : rows;
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const v = { tab: tab ?? "", min: String(min), top: topOnly ? "1" : "", page: "", ...o };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    return `/results?${p}`;
  };
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/results" trialHref={unlockHref()} />
      <main className="wrap app2 results dark">
        <PageBand n={BAND.results} title="Results" />
        <p className="results__label">Real past moves. Not a promise.</p>
        {total ? (
          <section className="results__total" aria-label="Every settled move" data-testid="results-total">
            <RecordCount r={total} />
            <RecordLines r={total} net />
            <p className="trust__fine">Polymarket wallets, every settled bet of every size. Kalshi trades are anonymous, so we can&apos;t tell a new bet from someone closing one: they&apos;re listed below but not counted.</p>
          </section>
        ) : null}
        <div className="chips" aria-label="Filters">
          <Link className="chip2" aria-current={(!tab) ? "true" : undefined} href={q({ tab: null })}>All</Link>
          <Link className="chip2" aria-current={(tab === "sports") ? "true" : undefined} href={q({ tab: "sports" })}>Sports</Link>
          <Link className="chip2" aria-current={(tab === "markets") ? "true" : undefined} href={q({ tab: "markets" })}>Markets</Link>
          {SIZES.map(s => <Link key={s} className="chip2" aria-current={(min === s) ? "true" : undefined} href={q({ min: String(s) })}>{dollars(s).replace(",000", "k")}+</Link>)}
          {member ? <Link className="chip2" aria-current={(topOnly) ? "true" : undefined} href={q({ top: topOnly ? null : "1" })}>Top traders only</Link> : null}
        </div>
        {shown.length ? (
          <>
            <ol className="rlist">
              {shown.map(r => (
                <li key={r.id} className="rlist__row">
                  {(r.soldShare ?? 0) > SOLD_EARLY_SHARE && r.result !== "void"
                    ? <span className="rlist__res rlist__res--sold">Sold early</span>
                    : <span className={`rlist__res rlist__res--${r.result}`}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Refunded"}</span>}
                  <span className="rlist__what">
                    <span className="rlist__amt">{dollars(r.amount)}</span> on {r.outcome} · {member ? <Link href={`/market/${encodeURIComponent(r.marketId)}`}>{r.marketTitle}</Link> : r.marketTitle}
                    <span className="rlist__who facerow"><Avatar face={moveFace(r, avatars)} />{r.source === "kalshi" ? "Someone on Kalshi" : member && isTopTrader(recs.get(r.wallet ?? "")) ? `Top trader ${walletLabel(r.wallet!, r.walletName)}` : walletLabel(r.wallet!, r.walletName)}</span>
                    {moveSource(r) ? <SourceA link={moveSource(r)!} className="source rlist__src" /> : null}
                  </span>
                  <span className="rlist__when"><time dateTime={new Date(r.settledAt ?? r.at).toISOString()}>{agoText(r.settledAt ?? r.at, now)}</time></span>
                </li>
              ))}
            </ol>
            <nav className="pager" aria-label="Pages">
              {page > 1 ? <Link className="btn btn--secondary" href={q({ page: page === 2 ? null : String(page - 1) })} rel="prev">Newer</Link> : <span />}
              <span className="pager__n">Page {page}</span>
              {more ? <Link className="btn btn--secondary" href={q({ page: String(page + 1) })} rel="next">Older</Link> : <span />}
            </nav>
          </>
        ) : (
          <div className="empty">
            <Photo n={SPOT.resultsEmpty} className="empty__photo" wideOnly />
            <p className="empty__h">Nothing settled yet{topOnly ? " from top traders" : ""}.</p>
            <p className="empty__p">Moves show up here, won or lost, as their markets settle.</p>
            <Link className="btn btn--secondary" href={member ? "/feed" : "/start"}>{member ? "See the live feed" : GET_CTA}</Link>
          </div>
        )}
      </main>
      {member ? null : <ScrollOffer where="results" />}
    </>
  );
}
