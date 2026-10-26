"use client";
/* The ledger: one row per receipt, wins and misses with the same weight. Receipt ID | Found at (exact UTC) | Event |
 * Prices at detection | Fillable size | Profit after fees | Settled outcome | Same-rules check. Each row expands (a
 * real button, keyboard friendly) to the fill at detection per leg, both rule texts (loaded on open from
 * /api/receipts/[id]), how each app settled, and links to both markets. */
import { useState } from "react";
import { SafetyLight } from "@/components/SafetyLight";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { Safety, Venue } from "@/lib/types";

export interface LedgerItem {
  id: number;
  rid: string;
  foundAt: string;
  title: string;
  safety: Safety;
  prices: string;
  size: string;
  profit: string;
  outcome: string;
  outcomeKind: "open" | "won" | "differently";
  check: "Passed" | "Failed" | "Pending";
  legs: Array<{ venue: Venue; venueName: string; side: string; label: string; contracts: string; avg: string; worst: string; cost: string; fee: string; result: string; url: string }>;
}

function Details({ item }: { item: LedgerItem }) {
  const [rules, setRules] = useState<Array<string | null> | null>(null);
  const [failed, setFailed] = useState(false);
  if (rules === null && !failed) {
    void fetch(`/api/receipts/${item.id}`, { headers: { Accept: "application/json" } })
      .then(r => (r.ok ? r.json() as Promise<{ rules: Array<string | null> }> : Promise.reject(new Error(String(r.status)))))
      .then(b => setRules(b.rules), () => setFailed(true));
  }
  return (
    <div className="rx-more">
      <div className="rx-more__legs">
        {item.legs.map((l, i) => (
          <section key={i} className="rx-leg" aria-label={`${l.venueName} leg`}>
            <h4 className="rx-leg__h">{l.side.toUpperCase()} on {l.venueName}</h4>
            <p className="rx-leg__label">{l.label}</p>
            <dl className="rx-kv">
              <div><dt>Contracts</dt><dd>{l.contracts}</dd></div>
              <div><dt>Avg price</dt><dd>{l.avg}</dd></div>
              <div><dt>Worst price</dt><dd>{l.worst}</dd></div>
              <div><dt>Cost</dt><dd>{l.cost}</dd></div>
              <div><dt>Fee</dt><dd>{l.fee}</dd></div>
              <div><dt>Settled on {l.venueName}</dt><dd>{l.result}</dd></div>
            </dl>
            <h5 className="rx-leg__k">Rules on {l.venueName}</h5>
            <div className="rx-rule">{failed ? "Couldn't load the rule text. Open the market to read it." : rules === null ? <><SkeletonLine w="100%" /><SkeletonLine w="80%" /></> : rules[i] ?? "We no longer store this market's rule text. Open the market to read it."}</div>
            {l.url ? <a className="btn btn--secondary rx-open" href={l.url} target="_blank" rel="noopener noreferrer">Open on {l.venueName}</a> : null}
          </section>
        ))}
      </div>
      <p className="rx-more__note">The fill at detection is what the order books could fill at the stated size when we found it (average and worst price per leg), not a full copy of the book.</p>
    </div>
  );
}

export function LedgerTable({ items }: { items: LedgerItem[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="rx-scroll" role="region" aria-label="Ledger" tabIndex={0}>
      <table className="rx-table">
        <caption className="sr-only">Every receipt in this view, newest first. Expand a row for the fill, both rule texts and how each app settled.</caption>
        <thead>
          <tr>
            <th scope="col" className="rx-c-id">Receipt</th><th scope="col" className="rx-c-at">Found at</th><th scope="col">Event</th>
            <th scope="col" className="rx-c-prices">Prices at detection</th><th scope="col" className="dt-r rx-c-num">Fillable size</th>
            <th scope="col" className="dt-r rx-c-num">Profit after fees</th><th scope="col" className="rx-c-out">Settled outcome</th><th scope="col" className="rx-c-chk">Same rules</th>
          </tr>
        </thead>
        {items.map(it => {
          const isOpen = open.has(it.id);
          return (
            <tbody key={it.id} className={isOpen ? "rx-open-row" : undefined}>
              <tr className="rx-row" data-receipt={it.rid}>
                <td className="rx-c-id">
                  <button type="button" className="rx-toggle mono" aria-expanded={isOpen} aria-controls={`rx-more-${it.id}`} onClick={() => toggle(it.id)}>
                    <span aria-hidden="true" className="rx-caret">{isOpen ? "−" : "+"}</span>{it.rid}
                  </button>
                </td>
                <td className="rx-c-at mono">{it.foundAt}</td>
                <th scope="row" className="rx-c-event"><span className="rx-title">{it.title}</span><SafetyLight safety={it.safety} /></th>
                <td className="rx-c-prices mono">{it.prices}</td>
                <td className="dt-r rx-c-num mono">{it.size}</td>
                <td className="dt-r rx-c-num"><span className="dt-profit">{it.profit}</span></td>
                <td className={`rx-c-out mono rx-out--${it.outcomeKind}`}>{it.outcome}</td>
                <td className={`rx-c-chk rx-chk--${it.check.toLowerCase()}`}>{it.check}</td>
              </tr>
              {isOpen ? (
                <tr className="rx-detail" id={`rx-more-${it.id}`}>
                  <td colSpan={8}><Details item={it} /></td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
