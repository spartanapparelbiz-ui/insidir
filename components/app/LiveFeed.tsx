"use client";
/* The ranked list. Everyone gets ticking "found X ago" text; paid plans also refresh from GET /api/feed every few
 * seconds without reloading (paused while the tab is hidden). The API returns rows already redacted for the
 * caller's plan. "Live" is shown only for a paid plan while the scanner is live and the last refresh worked. */
import { useEffect, useRef, useState } from "react";
import { DealRow } from "@/components/DealRow";
import type { FeedRow } from "@/lib/feed";
import type { DataStatus } from "@/lib/status";
import type { Plan, Venue } from "@/lib/types";
import { StatusBanner } from "./StatusBanner";

interface FeedResponse { now: number; plan: Plan; status: DataStatus; rows: FeedRow[] }

const isFeed = (v: unknown): v is FeedResponse =>
  typeof v === "object" && v !== null && Array.isArray((v as FeedResponse).rows) && typeof (v as FeedResponse).now === "number"
  && typeof (v as FeedResponse).status === "object";

/** Rows can't be live while the scanner is paused. */
const shown = (rows: FeedRow[], status: DataStatus, offline: boolean): FeedRow[] =>
  status.live && !offline ? rows : rows.map(r => (r.stale ? r : { ...r, stale: true }));

export function LiveFeed({ initialRows, initialNow, initialStatus, plan, pollMs, unlockHref, venues, emptyText }: {
  initialRows: FeedRow[]; initialNow: number; initialStatus: DataStatus; plan: Plan; pollMs: number; unlockHref: string;
  venues: Venue[]; emptyText: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [status, setStatus] = useState(initialStatus);
  const [offline, setOffline] = useState(false);
  const [plan_, setPlan] = useState(plan);
  // Server clock minus browser clock, so "found X ago" uses the server's time.
  const offset = useRef(initialNow - Date.now());
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (pollMs <= 0) return;
    let stop = false;
    let timer = 0;
    let ctrl: AbortController | null = null;
    const tick = async () => {
      if (!document.hidden) {
        ctrl = new AbortController();
        try {
          const res = await fetch("/api/feed", { cache: "no-store", signal: ctrl.signal, headers: { Accept: "application/json" } });
          const body: unknown = res.ok ? await res.json() : null;
          if (isFeed(body)) {
            offset.current = body.now - Date.now();
            setRows(body.rows); setStatus(body.status); setPlan(body.plan); setOffline(false);
          } else setOffline(true);
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) setOffline(true);
        }
      }
      if (!stop) timer = window.setTimeout(tick, pollMs);
    };
    timer = window.setTimeout(tick, pollMs);
    const onVisible = () => { if (!document.hidden) { window.clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; window.clearTimeout(timer); ctrl?.abort(); document.removeEventListener("visibilitychange", onVisible); };
  }, [pollMs]);

  const live = plan_ !== "free" && status.live && !offline;
  const list = shown(rows, status, offline);
  return (
    <section className="feed" aria-labelledby="feed-h">
      <div className="feed__head">
        <h1 id="feed-h" className="feed__h">Deals</h1>
        {live ? <span className="livetag"><span className="livetag__dot" aria-hidden="true" />Live</span>
          : plan_ === "free" ? <span className="dim small">30 min delay</span> : <span className="dim small">Not live</span>}
      </div>
      <StatusBanner status={status} venues={venues} offline={offline} />
      {list.length ? (
        <div className="deals">
          {list.map(r => <DealRow key={r.id} row={r} now={now} unlockHref={unlockHref} />)}
        </div>
      ) : (
        <div className="empty"><p className="empty__h">No deals right now</p><p className="muted small">{emptyText}</p></div>
      )}
    </section>
  );
}
