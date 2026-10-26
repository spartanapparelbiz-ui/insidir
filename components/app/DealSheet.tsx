"use client";
/* The Terminal's detail sheet: tapping a row opens the deal here instead of leaving the page. It slides up from the
 * bottom on phones and opens as a right-side panel on desktop. Progressive enhancement: rows stay real links to
 * /deal/[id]. The frame (focus, Escape, backdrop) is ./Sheet. The content comes from GET /api/deal/[id]
 * (lib/deal-view.ts, the deal page's own paywall), and its numbers follow live price ticks for this deal. */
import { useCallback, useEffect, useState } from "react";
import type { Live } from "@/components/live/useLive";
import type { DealOk, DealResponse, DealView } from "@/lib/deal-view";
import { DealDetail } from "./DealDetail";
import { applyTick } from "./live-rows";
import { Sheet } from "./Sheet";

const isResponse = (v: unknown): v is DealResponse =>
  typeof v === "object" && v !== null && typeof (v as DealResponse).now === "number" && typeof (v as DealResponse).view === "object";

function tick(view: DealOk, t: Parameters<typeof applyTick>[1], at: number): DealOk {
  const row = applyTick(view.row, t, at);
  const calc = view.calc && t.legs.length === view.calc.legs.length
    ? { ...view.calc, legs: view.calc.legs.map((l, i) => ({ ...l, avgPrice: (t.legs[i]?.priceCents ?? l.avgPrice * 100) / 100 })), maxSets: t.sets ?? view.calc.maxSets }
    : view.calc;
  return { ...view, row, calc };
}

export function DealSheet({ id, title, live, onClose }: { id: string; title: string; live: Live; onClose: () => void }) {
  const [res, setRes] = useState<{ now: number; view: DealView; unlockHref: string } | null>(null);
  const [error, setError] = useState(false);
  const [closed, setClosed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(false);
    fetch(`/api/deal/${encodeURIComponent(id)}`, { cache: "no-store", signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then(r => r.json() as Promise<unknown>)
      .then(body => { if (isResponse(body)) setRes(body); else setError(true); })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setError(true); });
    return () => ctrl.abort();
  }, [id, attempt]);

  // Live: this deal's price ticks and its closing.
  useEffect(() => {
    const offTick = live.on("price_tick", e => {
      if (e.oppId !== id) return;
      setRes(r => (r && r.view.state === "ok" ? { ...r, view: tick(r.view, e.data, e.at) } : r));
    });
    const offClosed = live.on("deal_closed", e => { if (e.oppId === id) setClosed(true); });
    return () => { offTick(); offClosed(); };
  }, [id, live]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const view = res?.view;
  const href = `/deal/${encodeURIComponent(id)}`;
  return (
    <Sheet labelledBy="dsheet-h" href={href} onClose={onClose}>
        {res && view?.state === "ok" ? (
          <DealDetail view={view} now={res.now} unlockHref={res.unlockHref} closed={closed} titleId="dsheet-h" heading="h2" />
        ) : res && view ? (
          <div className="dd">
            <h2 id="dsheet-h" className="dd-h">{view.state === "too_new" ? "This deal is still live" : "Deal not found"}</h2>
            <p className="muted">{view.state === "too_new"
              ? "Deals reach the free feed 30 minutes after they're found. Members see them as they happen."
              : "It may have closed, or it isn't available where you are."}</p>
            {view.state === "too_new" ? <a className="btn btn--primary" href={res.unlockHref} data-unlock="sheet-live">Unlock live deals</a> : null}
          </div>
        ) : (
          <div className="dd">
            <h2 id="dsheet-h" className="dd-h">{title}</h2>
            {error ? (
              <>
                <p className="muted" role="alert">Couldn&apos;t load this deal. Check your connection, then try again.</p>
                <div className="row-gap"><button type="button" className="btn btn--secondary" onClick={retry}>Try again</button><a className="btn btn--ghost" href={href}>Open full page</a></div>
              </>
            ) : <p className="muted" role="status">Loading the deal</p>}
          </div>
        )}
    </Sheet>
  );
}
