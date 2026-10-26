"use client";
/* The Terminal's detail sheet: tapping a row opens the deal here instead of leaving the page. It slides up from the
 * bottom on phones and opens as a right-side panel on desktop. Progressive enhancement: rows stay real links to
 * /deal/[id]. The content comes from GET /api/deal/[id] (lib/deal-view.ts, the deal page's own paywall), and its
 * numbers follow live price ticks for this deal. Escape, the close button or the backdrop close it; focus stays
 * inside while it's open and goes back to the row afterwards. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Live } from "@/components/live/useLive";
import type { DealOk, DealResponse, DealView } from "@/lib/deal-view";
import { DealDetail } from "./DealDetail";
import { applyTick } from "./live-rows";
import { UNLOCK } from "@/lib/copy";
import { SkeletonLine } from "@/components/ui/Skeleton";

/** The drawer while the deal loads: the real layout's shape (tags, title, the $1 bar, the numbers, both legs). */
function DealSkeleton() {
  return (
    <div className="dd" role="status" aria-label="Loading the deal">
      <SkeletonLine w={120} h={16} />
      <SkeletonLine w="60%" h={28} />
      <SkeletonLine w="100%" h={48} />
      <div className="dd-nums">{Array.from({ length: 6 }, (_, i) => <div key={i} className="dd-num"><SkeletonLine w={80} h={12} /><SkeletonLine w={64} h={22} /></div>)}</div>
      <div className="legs legs--skel"><SkeletonLine w="100%" h={120} /><SkeletonLine w="100%" h={120} /></div>
    </div>
  );
}

const isResponse = (v: unknown): v is DealResponse =>
  typeof v === "object" && v !== null && typeof (v as DealResponse).now === "number" && typeof (v as DealResponse).view === "object";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const [closed, setClosed] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

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
    const offClosed = live.on("deal_closed", e => { if (e.oppId === id) setClosed(e.data.closedAt); });
    return () => { offTick(); offClosed(); };
  }, [id, live]);

  // Focus in, trap, Escape; give focus back to whatever opened the sheet; no page scroll behind it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    el?.querySelector<HTMLElement>("[data-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
      const first = items[0], last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; opener?.focus(); };
  }, []);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const view = res?.view;
  const href = `/deal/${encodeURIComponent(id)}`;
  return (
    <div className="dsheet">
      <div className="dsheet__scrim" onClick={onClose} aria-hidden="true" />
      <div className="dsheet__panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="dsheet-h">
        <div className="dsheet__bar">
          <a className="btn btn--ghost dsheet__full" href={href}>Open full page</a>
          <button type="button" className="btn btn--secondary dsheet__x" onClick={onClose} data-close>Close</button>
        </div>
        {res && view?.state === "ok" ? (
          <DealDetail view={view} now={res.now} unlockHref={res.unlockHref} closed={closed !== null} closedAt={closed} titleId="dsheet-h" heading="h2" />
        ) : res && view ? (
          <div className="dd">
            <h2 id="dsheet-h" className="dd-h">{view.state === "too_new" ? "This deal is still live" : "Deal not found"}</h2>
            <p className="muted">{view.state === "too_new"
              ? "Deals reach the free feed 30 minutes after they're found. Members see them as they happen."
              : "It may have closed, or it isn't available where you are."}</p>
            {view.state === "too_new" ? <a className="btn btn--primary" href={res.unlockHref} data-unlock="sheet-live">{UNLOCK}</a> : null}
          </div>
        ) : (
          <div className="dd">
            <h2 id="dsheet-h" className="dd-h">{title}</h2>
            {error ? (
              <>
                <p className="muted" role="alert">Couldn&apos;t load this deal. Check your connection, then try again.</p>
                <div className="row-gap"><button type="button" className="btn btn--secondary" onClick={retry}>Try again</button><a className="btn btn--ghost" href={href}>Open full page</a></div>
              </>
            ) : <DealSkeleton />}
          </div>
        )}
      </div>
    </div>
  );
}
