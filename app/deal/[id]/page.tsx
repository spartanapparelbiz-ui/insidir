/* One deal: the play, both legs with deep links, the safety light with both markets' rule texts side by side, fees,
 * fillable size, days to resolution, and (paid) the calculator. Free viewers see the deal as the delayed feed does
 * (lib/feed.ts redacts it): no sizes, no dollar profit, calculator locked. */
import type { Metadata } from "next";
import Link from "next/link";
import { Ago } from "@/components/app/Ago";
import { Beacons } from "@/components/app/Beacons";
import { Calculator } from "@/components/app/Calculator";
import { Locked } from "@/components/app/Locked";
import { unlockHref } from "@/components/app/links";
import { SafetyLight } from "@/components/SafetyLight";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import type { CalcLeg } from "@/lib/calculator";
import { LOCK_LINE } from "@/lib/copy";
import { feedFor, type FeedViewer } from "@/lib/feed";
import { feeModelFor } from "@/lib/fees";
import { centsText, days, pct, usd } from "@/lib/format";
import { isPaid } from "@/lib/plans";
import { marketsByKey, storedOpp } from "@/lib/queries";
import { FRESH_MS } from "@/lib/status";
import type { VMarket } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deal", robots: { index: false } };

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
const date = (ms: number | null): string => (ms ? new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "Not stated");

function Num({ k, v, cls }: { k: string; v: string | null; cls?: string }) {
  return <div className="bignum"><span className="num__k">{k}</span><span className={`bignum__v ${cls ?? ""}`}>{v ?? <span className="blur" aria-label="Locked" />}</span></div>;
}

function Rules({ m, fallback }: { m: VMarket | null; fallback: string }) {
  if (!m) return <div className="rule"><p className="rule__h">{fallback}</p><p className="dim small">Rule text not loaded.</p></div>;
  return (
    <div className="rule">
      <p className="rule__venue dim tiny">{VENUE_NAME[m.venue]}</p>
      <p className="rule__h">{m.title}</p>
      <p className="rule__meta dim tiny">YES pays on: {m.yesLabel} · Closes {date(m.closeTime)}{m.resolutionSource ? ` · Source: ${m.resolutionSource}` : ""}</p>
      <div className="rule__text small">{m.rules || "The venue publishes no rule text for this market."}</div>
    </div>
  );
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const id = safeDecode((await params).id);
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const stored = id.length <= 200 ? await storedOpp(id) : null;
  const unlock = unlockHref("insidir", `/deal/${encodeURIComponent(id)}`);
  // Region always applies; the viewer's own filters don't (they asked for this deal).
  const fv: FeedViewer = { plan: viewer.plan, region: viewer.region, minRoi: Number.NEGATIVE_INFINITY, minSizeUsd: 0, categories: [], venues: [], showYellow: true, showRed: true };
  const gone = Boolean(stored && paid && !stored.active);
  const row = stored ? feedFor([gone ? { ...stored, active: true } : stored], fv, now)[0] : undefined;
  const header = <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/deal" />;

  if (!stored || !row) {
    // A free viewer asking for a deal a member could see right now: it's just too new for the delayed feed.
    const tooNew = Boolean(stored && !paid && feedFor([stored], { ...fv, plan: "pro" }, now).length);
    return (
      <>
        {header}
        <main className="wrap app">
          <Beacons where="deal" />
          <section className="empty">
            <p className="empty__h">{tooNew ? "This deal is still live" : "Deal not found"}</p>
            <p className="muted small">{tooNew ? "Deals reach the free feed 30 minutes after they're found. Members see them as they happen." : "It may have closed, or it isn't available in your region."}</p>
            <div className="row-gap">
              {tooNew ? <a className="btn btn--primary" href={unlock} data-unlock="deal-live">Unlock</a> : null}
              <Link className="btn btn--secondary" href="/terminal">See today&apos;s live deals</Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  const opp = paid ? stored.live : stored.snapshot;
  const lock = opp.kind !== "second_opinion";
  const markets = await marketsByKey(opp.legs.map(l => ({ venue: l.venue, id: l.marketId })));
  const marketOf = (venue: VMarket["venue"], marketId: string): VMarket | null => markets.get(`${venue}:${marketId}`) ?? null;
  const uniqueMarkets = [...new Map(opp.legs.map(l => [`${l.venue}:${l.marketId}`, l])).values()];
  const notLive = gone || row.stale;
  const calcLegs: CalcLeg[] = opp.legs.map(l => ({
    label: l.label, venue: l.venue, side: l.side, avgPrice: l.avgPrice,
    fee: marketOf(l.venue, l.marketId)?.fee ?? feeModelFor(l.venue, opp.categories[0] ?? "other"),
  }));
  const freshAt = row.lastSeenAt;

  return (
    <>
      {header}
      <main className="wrap app deal-page">
        <Beacons where="deal" />
        <p className="small"><Link href="/terminal" className="muted">← Terminal</Link></p>
        <header className="dp__head">
          <div className="dp__tags">
            <SafetyLight safety={row.safety} long />
            {notLive ? <span className="notlive">{gone ? "No longer live" : row.locked ? "30 min delay · not live" : "Not live"}</span> : null}
          </div>
          <h1 className="dp__h">{row.title}</h1>
          <p className="dp__play">{row.play}</p>
          <p className="dim small">
            <Ago at={row.foundAt} now={now} prefix="Found " />
            {!row.locked ? <> · <Ago at={freshAt} now={now} prefix="last confirmed " /></> : null}
            {" "}· resolves in {days(row.days)}
            {!row.locked && now - freshAt > FRESH_MS ? " · prices may have moved" : ""}
          </p>
        </header>

        <section className="dp__nums" aria-label="Numbers">
          {lock ? (
            <>
              <Num k="ROI" v={pct(row.roi)} />
              <Num k="Profit" v={row.profit === null ? null : usd(row.profit)} cls="profit" />
              <Num k="Max fillable" v={row.cost === null ? null : usd(row.cost + (row.fees ?? 0))} />
              <Num k="Fees" v={row.fees === null ? null : usd(row.fees)} />
              <Num k="Sets" v={row.sets === null ? null : Math.floor(row.sets).toLocaleString("en-US")} />
              <Num k="Resolves in" v={days(row.days)} />
            </>
          ) : (
            <>
              <Num k="Gap" v={`${row.gapCents ?? 0}¢`} />
              <Num k="Resolves in" v={days(row.days)} />
            </>
          )}
        </section>
        {lock ? <p className="muted small">{LOCK_LINE}</p> : <p className="notlock"><b>Not a lock.</b> The two venues price the same outcome {row.gapCents ?? 0}¢ apart. Buying one side doesn&apos;t lock in anything.</p>}
        {row.locked ? <a className="btn btn--primary" href={unlock} data-unlock="deal-nums">Unlock sizes and profit</a> : null}

        <section className="sec2" aria-labelledby="legs-h">
          <h2 id="legs-h" className="sec2__h">{row.legs.length > 2 ? `The ${row.legs.length} legs` : row.legs.length === 2 ? "Both legs" : "The market"}</h2>
          <div className="legs">
            {row.legs.map((l, i) => {
              const full = paid && lock ? opp.legs[i] : undefined;
              return (
                <div key={i} className="leg card">
                  <p className="leg__venue dim tiny">{l.venueName}</p>
                  <p className="leg__side"><span className="leg__dir">{l.side.toUpperCase()}</span> at <b>{centsText(l.priceCents)}</b></p>
                  <p className="muted small">{l.label}</p>
                  {full ? (
                    <dl className="kv kv--small">
                      <div><dt>Contracts</dt><dd>{Math.floor(full.contracts).toLocaleString("en-US")}</dd></div>
                      <div><dt>Worst price</dt><dd>{centsText(Math.round(full.worstPrice * 1000) / 10)}</dd></div>
                      <div><dt>Cost</dt><dd>{usd(full.cost)}</dd></div>
                      <div><dt>Fee</dt><dd>{usd(full.fee)}</dd></div>
                    </dl>
                  ) : null}
                  {l.url ? <a className="btn btn--secondary btn--block" href={l.url} target="_blank" rel="noopener noreferrer">Open on {l.venueName}</a> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="sec2" aria-labelledby="safety-h">
          <h2 id="safety-h" className="sec2__h">Safety: <SafetyLight safety={row.safety} /></h2>
          {row.safetyNotes.length ? <ul className="notes">{row.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="muted small">{uniqueMarkets.length > 1 ? "No differences found between the markets' rules." : "The rules as the venue publishes them."}</p>}
          <div className={`rules${uniqueMarkets.length === 2 ? " rules--two" : ""}`}>
            {uniqueMarkets.map(l => <Rules key={`${l.venue}:${l.marketId}`} m={marketOf(l.venue, l.marketId)} fallback={l.label} />)}
          </div>
        </section>

        {lock ? (
          <section className="sec2" aria-label="Calculator">
            {gone ? <p className="muted small">This deal is no longer live, so the calculator is off.</p>
              : paid ? <Calculator legs={calcLegs} payoutPerSet={opp.sets > 0 ? opp.payout / opp.sets : 0} maxSets={opp.sets} />
                : <Locked title="Calculator" text="Type an amount and see the contracts per side, cost, fees, payout and profit at today's prices." href={unlock} plan="insidir" where="deal-calc" />}
          </section>
        ) : null}
      </main>
    </>
  );
}
