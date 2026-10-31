"use client";
/* The home page's three markets as tabs (Stocks · Sports · Prediction markets), each showing one readable live card:
 * the newest large position there, as visitors see it (30 minutes late) or live for members. Every panel is in the
 * page from the server; the tabs only switch which one shows, so the numbers are final on first paint. The first tab
 * follows where the visitor came from (stocks first for our stock accounts, app/page.tsx). Arrow keys move between
 * tabs (WAI-ARIA tabs pattern). */
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { MoveArt } from "@/components/MoveArt";
import { dollars } from "@/lib/moves/copy";
import type { PreviewRow } from "@/lib/markets/preview";

export type TabKind = "stocks" | "sports" | "markets";
export interface TabData { row: PreviewRow | null; total: number; window: string; live: boolean }

const NAME: Record<TabKind, string> = { stocks: "Stocks", sports: "Sports", markets: "Prediction markets" };
const SOURCE: Record<TabKind, string> = { stocks: "SEC Form 4 filings", sports: "Polymarket · Kalshi", markets: "Polymarket · Kalshi" };
const MORE: Record<TabKind, string> = { stocks: "Every insider trade", sports: "Every large sports position", markets: "Every large prediction-market position" };
const pct = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);
const signedPct = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p * 100).toFixed(1)}%`;

function Card({ kind, d }: { kind: TabKind; d: TabData }) {
  const r = d.row;
  if (!r) return <p className="mtab__empty">No large {kind === "stocks" ? "insider trades" : "positions"} yet {d.window ? d.window.toLowerCase() : "today"}. New ones show here as they come in.</p>;
  const facts: Array<[string, string, string?]> = kind === "stocks"
    ? [["Insider", r.insider ?? "—"], ["Filed", r.filed ?? "—"], ["Since the filing", r.change == null ? "—" : signedPct(r.change), r.change == null ? undefined : r.change >= 0 ? "money" : "loss"]]
    : [["Their price", pct(r.entry)], ["Now", pct(r.now)], [r.result ? "Result" : "Status", r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : r.result ? "Voided" : "Open", r.result === "won" ? "money" : r.result === "lost" ? "loss" : undefined]];
  return (
    <article className="mcard" data-testid={`mcard-${kind}`}>
      <p className="mcard__top"><MoveArt art={r.art} className="art40" /><span>{NAME[kind]} · {r.ago}</span></p>
      <h3 className="mcard__h"><Link href={r.href}>{r.headline}</Link></h3>
      <p className="mcard__amt num">{(r.n ?? 1) > 1 ? `${r.n} positions · ${dollars(r.amount)}` : dollars(r.amount)}</p>
      {kind !== "stocks" && r.subline ? <p className="mcard__sub">{r.subline}</p> : null}
      <dl className="mcard__facts">{facts.map(([k, v, tone]) => <div key={k}><dt>{k}</dt><dd className={`num${tone ? ` ${tone}` : ""}`}>{v}</dd></div>)}</dl>
      {r.record ? <p className="mcard__rec">{r.record}</p> : null}
      {r.note ? <p className="mcard__note"><span>Analyst note</span> {r.note}</p> : null}
    </article>
  );
}

export function MarketTabs({ order, data }: { order: TabKind[]; data: Record<TabKind, TabData> }) {
  const [on, setOn] = useState<TabKind>(order[0]!);
  const refs = useRef<Partial<Record<TabKind, HTMLButtonElement | null>>>({});
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = order.indexOf(on);
    const j = e.key === "ArrowRight" ? (i + 1) % order.length : e.key === "ArrowLeft" ? (i - 1 + order.length) % order.length : e.key === "Home" ? 0 : e.key === "End" ? order.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    setOn(order[j]!);
    refs.current[order[j]!]?.focus();
  };
  const d = data[on];
  return (
    <section className="mtabs" aria-labelledby="mtabs-h">
      <div className="pg">
        <h2 id="mtabs-h" className="sr-only">Live now</h2>
        <div className="mtabs__list" role="tablist" aria-label="Markets">
          {order.map(k => (
            <button key={k} ref={el => { refs.current[k] = el; }} type="button" role="tab" id={`mtab-${k}`} aria-controls={`mpanel-${k}`} aria-selected={on === k}
              tabIndex={on === k ? 0 : -1} className={`mtabs__tab${on === k ? " is-on" : ""}`} onClick={() => setOn(k)} onKeyDown={key}>{NAME[k]}</button>
          ))}
        </div>
        {order.map(k => (
          <div key={k} role="tabpanel" id={`mpanel-${k}`} aria-labelledby={`mtab-${k}`} hidden={on !== k} className="mtabs__panel">
            <Card kind={k} d={data[k]} />
            <p className="mtabs__foot">
              <span>{SOURCE[k]} · {data[k].live ? "Live" : "30 minutes late"}</span>
              <Link className="tlink tlink--go" href={`/${k}`}>{MORE[k]} <span className="arrow" aria-hidden="true">→</span></Link>
            </p>
          </div>
        ))}
        <p className="sr-only" aria-live="polite">{NAME[on]}: {d.row ? d.row.headline : "nothing yet"}</p>
      </div>
    </section>
  );
}
