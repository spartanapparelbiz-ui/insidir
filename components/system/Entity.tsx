/* Pieces every entity page (market, race, wallet, bet) shares: the breadcrumb (visible, and as schema.org JSON-LD by
 * EntityLd), the terminal page head (TermHead), the Kalshi-first price panel (Kalshi and Polymarket side by side as bid
 * boxes with Custodious Blue probability bars), and the related links as a table. Server components. */
import type { Nearest } from "@/lib/twins/nearest";
import type { ReactNode } from "react";
import type { MarketTwin } from "@/lib/entities/market";
import type { Region } from "@/lib/types";
import "@/app/pages-terminal.css";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);

export function Crumbs({ trail }: { trail: ReadonlyArray<readonly [string, string]> }) {
  return (
    <nav className="s-crumbs b-small" aria-label="Breadcrumb" data-testid="crumbs">
      <ol>{trail.map(([name, href], i) => <li key={href}>{i < trail.length - 1 ? <a className="s-link" href={href}>{name}</a> : <span aria-current="page">{name}</span>}</li>)}</ol>
    </nav>
  );
}

/** A terminal page's head: breadcrumb, a small mono label, the title (Plex Sans Condensed, never a photo hero), a muted
 *  mono subline, and what sits at its right (Follow, Start for $1). */
export function TermHead({ title, sub, label, crumbs, right, id, testid, children }: {
  title: ReactNode; sub?: ReactNode; label?: ReactNode; crumbs?: ReactNode; right?: ReactNode; id?: string; testid?: string; children?: ReactNode;
}) {
  return (
    <header className="t-pagehead" data-testid={testid}>
      <div className="t-pagehead__l">
        {crumbs}
        {label ? <p className="t-label t-pagehead__label">{label}</p> : null}
        {typeof title === "string" ? <h1 id={id} className="t-pagehead__h">{title}</h1> : title}
        {sub ? <div className="t-pagehead__sub">{sub}</div> : null}
        {children}
      </div>
      {right ? <div className="t-pagehead__r">{right}</div> : null}
    </header>
  );
}

/** One side's price as a bid box row: the label, the price, a Custodious Blue probability bar. */
function Bid({ label, price, testid }: { label: string; price: number | null; testid?: string }) {
  const w = `${Math.round(Math.max(0, Math.min(1, price ?? 0)) * 100)}%`;
  return (
    <div className="t-bidrow">
      <span className="t-bidrow__l">{label}</span>
      <span className="t-bidrow__px b-num" data-testid={testid}>{price !== null ? cents(price) : "No offer now"}</span>
      <span className="t-bar" aria-hidden="true"><span style={{ width: w }} /></span>
    </div>
  );
}

/** Kalshi first: the twin's market and price, one tap to it; then Polymarket's price beside it. No approved twin: it
 *  says so and shows no Kalshi link. A US viewer never gets a Polymarket link. */
export function KalshiFirst({ twin, yesLabel, noLabel, polyYes, polyUrl, region, result, near = null, testid = "kalshi-first" }: {
  twin: MarketTwin | null; yesLabel: string; noLabel: string; polyYes: number | null; polyUrl: string | null; region: Region | null; result?: ReactNode; testid?: string;
  /** No exact twin: the nearest lines Kalshi lists for this game, as labelled alternatives (lib/twins/nearest.ts). */
  near?: Nearest | null;
}) {
  const kYes = twin ? twin.yesAsk ?? twin.yes : null;
  const kNo = twin ? twin.noAsk ?? (twin.yes !== null ? 1 - twin.yes : null) : null;
  return (
    <div className="t-px" data-testid={testid} data-twin={twin ? "yes" : "no"}>
      {result ? <p className="t-px__result" data-testid="entity-result">{result}</p> : null}
      <div className="t-px__grid">
        <div className="t-bid">
          <p className="t-label">Kalshi</p>
          {twin ? (
            <>
              <p className="t-bid__title" data-testid="kalshi-title">{twin.title}</p>
              <Bid label={yesLabel} price={kYes} testid="kalshi-yes" />
              <Bid label={noLabel} price={kNo} testid="kalshi-no" />
              <a className="b-btn t-btn2 t-bid__go" href={twin.url} target="_blank" rel="noopener noreferrer" data-testid="open-kalshi">Open on Kalshi</a>
              {/(SPREAD|TOTAL)-/.test(twin.kalshiId) ? <p className="t-note" data-testid="kalshi-line">Kalshi lists every line for this game on one page: pick “{twin.title}”.</p> : null}
            </>
          ) : near ? (
            <div data-testid="kalshi-near">
              <p className="t-note">Kalshi doesn&apos;t list {near.team ? `${near.team} −${near.line}` : `${near.line} points`}. Kalshi has {near.alternatives.map(a => a.line).join(" and ")}{near.kind === "total" ? " points" : ""}: a different line, so a different bet.</p>
              <ul className="t-list">{near.alternatives.map(a => (
                <li key={a.url}><a className="s-link" href={a.url} target="_blank" rel="noopener noreferrer" data-testid="kalshi-near-line">{a.title}</a>{a.yes !== null ? <span className="t-muted b-num"> · {cents(a.yes)}</span> : null}</li>
              ))}</ul>
            </div>
          ) : <p className="t-note" data-testid="no-twin">No Kalshi twin for this market. It shows here once Kalshi lists the same market and we have matched it.</p>}
        </div>
        <div className="t-bid" data-testid="poly-price">
          <p className="t-label">Polymarket · where the wallets bet</p>
          {polyYes !== null ? (
            <>
              <Bid label={yesLabel} price={polyYes} />
              <Bid label={noLabel} price={1 - polyYes} />
            </>
          ) : <p className="t-note">No price yet.</p>}
          {region === "non_us" && polyUrl ? <a className="s-link t-note" href={polyUrl} target="_blank" rel="noopener noreferrer">See it on Polymarket</a> : null}
        </div>
      </div>
    </div>
  );
}

export function RelatedLinks({ items, kind, testid = "related" }: { items: ReadonlyArray<{ href: string; title: string; sub?: ReactNode }>; kind: "market" | "race" | "wallet" | "bet"; testid?: string }) {
  if (!items.length) return null;
  const head = kind === "market" ? "Market" : kind === "race" ? "Race" : kind === "wallet" ? "Wallet" : "Bet";
  return (
    <div className="t-scroll">
      <table className="t-table" data-testid={testid}>
        <thead><tr><th>{head}</th><th className="r"><span className="b-sr">Detail</span></th></tr></thead>
        <tbody>{items.map(x => (
          <tr key={x.href}><td className="t-ell"><a className="s-link" href={x.href} data-entity={kind}>{x.title}</a></td><td className="r t-muted">{x.sub ?? ""}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
