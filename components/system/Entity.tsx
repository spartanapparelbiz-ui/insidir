/* Pieces every entity page (market, race, wallet, bet) shares: the breadcrumb (visible, and as schema.org JSON-LD by
 * EntityLd), the Kalshi-first price panel, and the related stage's links. Server components. */
import type { Nearest } from "@/lib/twins/nearest";
import type { ReactNode } from "react";
import type { MarketTwin } from "@/lib/entities/market";
import type { Region } from "@/lib/types";
import { Panel } from "./index";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);

export function Crumbs({ trail }: { trail: ReadonlyArray<readonly [string, string]> }) {
  return (
    <nav className="s-crumbs b-small" aria-label="Breadcrumb" data-testid="crumbs" data-m="lift">
      <ol>{trail.map(([name, href], i) => <li key={href}>{i < trail.length - 1 ? <a className="s-link" href={href}>{name}</a> : <span aria-current="page">{name}</span>}</li>)}</ol>
    </nav>
  );
}

/** Kalshi first: the twin's market and price, one tap to it; then Polymarket's price. No approved twin: it says so and
 *  shows no Kalshi link. A US viewer never gets a Polymarket link. */
export function KalshiFirst({ twin, yesLabel, noLabel, polyYes, polyUrl, region, result, near = null, testid = "kalshi-first" }: {
  twin: MarketTwin | null; yesLabel: string; noLabel: string; polyYes: number | null; polyUrl: string | null; region: Region | null; result?: ReactNode; testid?: string;
  /** No exact twin: the nearest lines Kalshi lists for this game, as labelled alternatives (lib/twins/nearest.ts). */
  near?: Nearest | null;
}) {
  return (
    <Panel className="s-col s-kfirst" testid={testid} data-twin={twin ? "yes" : "no"}>
      {result ? <p className="b-msg" data-testid="entity-result">{result}</p> : null}
      {twin ? (
        <>
          <p className="b-label">On Kalshi</p>
          <p className="s-strong" data-testid="kalshi-title">{twin.title}</p>
          <div className="s-ticket__px">
            <span><span className="b-small">{yesLabel}</span><br /><span className="s-big b-num" data-testid="kalshi-yes">{(twin.yesAsk ?? twin.yes) !== null ? cents((twin.yesAsk ?? twin.yes)!) : "No offer now"}</span></span>
            <span><span className="b-small">{noLabel}</span><br /><span className="s-big b-num" data-testid="kalshi-no">{twin.noAsk !== null ? cents(twin.noAsk) : twin.yes !== null ? cents(1 - twin.yes) : "No offer now"}</span></span>
          </div>
          <div className="b-ctas"><a className="b-btn b-btn-lg b-primary" href={twin.url} target="_blank" rel="noopener noreferrer" data-testid="open-kalshi">Open on Kalshi</a></div>
          {/(SPREAD|TOTAL)-/.test(twin.kalshiId) ? <p className="b-small" data-testid="kalshi-line">Kalshi lists every line for this game on one page: pick “{twin.title}”.</p> : null}
        </>
      ) : near ? (
        <div data-testid="kalshi-near">
          <p className="b-small">Kalshi doesn&apos;t list {near.team ? `${near.team} −${near.line}` : `${near.line} points`}. Kalshi has {near.alternatives.map(a => a.line).join(" and ")}{near.kind === "total" ? " points" : ""}: a different line, so a different bet.</p>
          <ul className="s-lockrows">{near.alternatives.map(a => (
            <li key={a.url}><a className="s-link" href={a.url} target="_blank" rel="noopener noreferrer" data-testid="kalshi-near-line">{a.title}</a>{a.yes !== null ? <span className="b-small b-num"> · {cents(a.yes)}</span> : null}</li>
          ))}</ul>
        </div>
      ) : <p className="b-small" data-testid="no-twin">No Kalshi twin for this market. It shows here once Kalshi lists the same market and we have matched it.</p>}
      <p className="b-small" data-testid="poly-price">On Polymarket, where the wallets trade: {polyYes !== null ? <><b className="b-num">{cents(polyYes)}</b> {yesLabel}</> : "no price yet"}
        {region === "non_us" && polyUrl ? <> · <a className="s-link" href={polyUrl} target="_blank" rel="noopener noreferrer">See it on Polymarket</a></> : null}</p>
    </Panel>
  );
}

export function RelatedLinks({ items, kind, testid = "related" }: { items: ReadonlyArray<{ href: string; title: string; sub?: ReactNode }>; kind: "market" | "race" | "wallet" | "bet"; testid?: string }) {
  if (!items.length) return null;
  return (
    <ul className="s-lockrows s-wrows" data-testid={testid}>
      {items.map(x => <li key={x.href}><a className="s-link s-strong" href={x.href} data-entity={kind}>{x.title}</a>{x.sub ? <span className="b-small"> · {x.sub}</span> : null}</li>)}
    </ul>
  );
}
