"use client";
/* The live Terminal list. The server renders the rows first (works without JS); then the live pipe (useLive, one
 * EventSource per page) takes over: a deal_found slides in at the top with a brief highlight, price ticks update
 * rows in place, a deal_closed greys its row and drops it after a short beat. A slow resync from GET /api/feed every
 * minute (and on reconnect) catches anything missed. Every row's "Found X ago" counts up. Nothing is ever shown as
 * live while the scanner or the connection is down ("Live data paused, retrying").
 *
 * Free viewers: the server sends the delayed, redacted versions; when a deal closes before the free feed could show
 * it, a line says when members got it and when the free feed would have.
 *
 * Two views. Simple (the default): each deal is a card that reads like a sentence (components/simple/DealCard), and
 * "Show me how" opens the three-step walkthrough in a sheet. Pro: the dense table; tapping a row opens the detail
 * sheet. */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { DealRow, DealRowHead, type RowMotion } from "@/components/DealRow";
import { DealCard } from "@/components/simple/DealCard";
import { HowSheet } from "@/components/simple/HowSheet";
import { useLive } from "@/components/live/useLive";
import type { FeedRow } from "@/lib/feed";
import type { DataStatus } from "@/lib/status";
import type { Plan, Venue } from "@/lib/types";
import type { View } from "@/lib/view";
import { DealSheet } from "./DealSheet";
import { applyTick, missedByDelay, missedLine, quietLine } from "./live-rows";
import { StatusBanner } from "./StatusBanner";

interface FeedResponse { now: number; plan: Plan; status: DataStatus; rows: FeedRow[] }

const isFeed = (v: unknown): v is FeedResponse =>
  typeof v === "object" && v !== null && Array.isArray((v as FeedResponse).rows) && typeof (v as FeedResponse).now === "number"
  && typeof (v as FeedResponse).status === "object";

/** How long a new row stays highlighted, and how long a closed row stays (grey) before it drops off. */
const NEW_MS = 1_800;
const CLOSING_MS = 2_500;
const TICK_MS = 1_000;
const RESYNC_MS = 60_000;

/** A short, quiet tone (no audio file). The context is unlocked on the first tap, as browsers require. */
let audio: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio ??= Ctx ? new Ctx() : null;
    return audio;
  } catch { return null; }
}
function chime() {
  const ctx = audioCtx();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.32);
}

export function LiveFeed({ initialRows, initialNow, initialStatus, plan, maxRows, unlockHref, venues, emptyText, medianGapMin, soundOnGreen, view = "simple" }: {
  initialRows: FeedRow[]; initialNow: number; initialStatus: DataStatus; plan: Plan; maxRows: number | null; unlockHref: string;
  venues: Venue[]; emptyText: string; medianGapMin: number | null; soundOnGreen: boolean; view?: View;
}) {
  const live = useLive();
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [motion, setMotion] = useState<Record<string, RowMotion>>({});
  const [status, setStatus] = useState(initialStatus);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);
  // Simple view: the deal whose walkthrough is open, with its last row in case it closes and drops off the list.
  const [how, setHow] = useState<{ row: FeedRow; closed: boolean } | null>(null);
  // Server clock minus browser clock, so "found X ago" uses the server's time.
  const offset = useRef(initialNow - Date.now());
  const [now, setNow] = useState(initialNow);
  const timers = useRef(new Set<number>());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);

  useEffect(() => { if (live.hello || live.scanner) offset.current = live.skewMs; }, [live.skewMs, live.hello, live.scanner]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => window.clearInterval(t);
  }, []);

  const mark = useCallback((id: string, m: RowMotion, ms: number, after?: () => void) => {
    setMotion(x => ({ ...x, [id]: m }));
    later(() => { setMotion(x => { const { [id]: _, ...rest } = x; return rest; }); after?.(); }, ms);
  }, [later]);

  // Live events.
  const sound = useRef(soundOnGreen);
  sound.current = soundOnGreen;
  useEffect(() => {
    const offFound = live.on("deal_found", e => {
      const row = e.data.row;
      setRows(prev => {
        const next = prev.some(r => r.id === row.id) ? prev.map(r => (r.id === row.id ? row : r)) : [row, ...prev];
        return maxRows === null ? next : next.slice(0, maxRows);
      });
      if (!live.reducedMotion) mark(row.id, "new", NEW_MS);
      if (sound.current && row.safety === "green" && !row.locked && !row.stale) chime();
    });
    const offTick = live.on("price_tick", e => {
      const row = rowsRef.current.find(r => r.id === e.oppId);
      if (!row || row.locked) return;
      setRows(prev => prev.map(r => (r.id === e.oppId ? applyTick(r, e.data, e.at) : r)));
      if (!live.reducedMotion) mark(e.oppId, "tick", TICK_MS);
    });
    const offClosed = live.on("deal_closed", e => {
      setHow(h => (h && h.row.id === e.oppId ? { ...h, closed: true } : h));
      if (rowsRef.current.some(r => r.id === e.oppId)) mark(e.oppId, "closing", CLOSING_MS, () => setRows(p => p.filter(r => r.id !== e.oppId)));
    });
    return () => { offFound(); offTick(); offClosed(); };
  }, [live, live.on, live.reducedMotion, mark, maxRows]);

  // Sound needs a tap before the browser lets a page play it.
  useEffect(() => {
    if (!soundOnGreen) return;
    const unlock = () => { void audioCtx()?.resume().catch(() => undefined); };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [soundOnGreen]);

  // Slow resync (and on every reconnect): new rows slide in; rows no longer listed drop off.
  const resync = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store", headers: { Accept: "application/json" } });
      const body: unknown = res.ok ? await res.json() : null;
      if (!isFeed(body)) { setFetchFailed(true); return; }
      offset.current = body.now - Date.now();
      setStatus(body.status);
      setFetchFailed(false);
      const had = new Set(rowsRef.current.map(r => r.id));
      for (const r of body.rows) if (!had.has(r.id) && !live.reducedMotion) mark(r.id, "new", NEW_MS);
      setRows(body.rows);
    } catch { setFetchFailed(true); }
  }, [live.reducedMotion, mark]);
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void resync(); }, RESYNC_MS);
    return () => window.clearInterval(t);
  }, [resync]);
  const wasLive = useRef(true);
  useEffect(() => {
    if (live.status === "live" && !wasLive.current) void resync();
    wasLive.current = live.status === "live" || live.status === "connecting";
  }, [live.status, resync]);

  // What's live: the scanner's own heartbeat (from the stream when it's up), the connection, then each row.
  const scanner: DataStatus = live.scanner ? { live: live.scanner.live, paused: live.scanner.paused, lastScanAt: live.scanner.lastScanAt } : status;
  const offline = live.status === "offline" || fetchFailed;
  const isLive = plan !== "free" && scanner.live && !offline;
  const list = useMemo(() => rows.map(r => (r.stale || (scanner.live && !offline) ? r : { ...r, stale: true })), [rows, scanner.live, offline]);
  const anyLocked = list.some(r => r.locked);
  const delayMs = live.hello?.delayMs ?? 30 * 60_000;

  // Free plan: deals that closed before the free feed could show them (newest first, from the stream's own events).
  const missed = useMemo(() => {
    if (plan !== "free") return [];
    const shown = new Set(rows.map(r => r.id));
    const out: Array<{ id: number; text: string }> = [];
    for (const e of live.events) {
      if (e.type !== "deal_closed" || shown.has(e.oppId) || !missedByDelay(e.data, delayMs)) continue;
      out.push({ id: e.id, text: missedLine(e.data, delayMs, now) });
      if (out.length === 3) break;
    }
    return out;
  }, [plan, rows, live.events, delayMs, now]);

  const quiet = quietLine(medianGapMin);
  const allQuiet = !list.some(r => !r.stale);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const hl = e.target instanceof Element ? e.target.closest<HTMLElement>("a.sd-how") : null;
    const row = hl ? list.find(r => r.id === hl.dataset.dealHow) : undefined;
    if (hl && row) { e.preventDefault(); setHow({ row, closed: false }); return; }
    const link = e.target instanceof Element ? e.target.closest("a.tr-link") : null;
    const art = link?.closest<HTMLElement>("[data-deal]");
    const id = art?.dataset.deal;
    if (!link || !id) return;
    e.preventDefault();
    setOpen({ id, title: link.textContent ?? "" });
  };
  const close = useCallback(() => setOpen(null), []);
  const closeHow = useCallback(() => setHow(null), []);
  const howRow = how ? (list.find(r => r.id === how.row.id) ?? how.row) : null;

  return (
    <section className="feed" aria-labelledby="feed-h">
      <div className="feed__head">
        <h1 id="feed-h" className="feed__h">{view === "pro" ? "Deals" : "Today's price gaps"}</h1>
        <p className="feed__state" role="status">
          {isLive ? <><span className="feed__dot" aria-hidden="true" />Live</> : plan === "free" ? "30 min delay" : "Not live"}
        </p>
      </div>
      <StatusBanner status={scanner} venues={venues} offline={offline} />
      {list.length && view === "pro" ? (
        <div className="tr-list" onClick={onClick}>
          <DealRowHead locked={anyLocked} />
          {list.map(r => <DealRow key={r.id} row={r} now={now} unlockHref={unlockHref} motion={motion[r.id] ?? null} />)}
        </div>
      ) : list.length ? (
        <div className="sd-list" onClick={onClick}>
          {list.map(r => <DealCard key={r.id} row={r} now={now} unlockHref={unlockHref} motion={motion[r.id] ?? null} heading="h2" />)}
        </div>
      ) : (
        <div className="empty">
          <p className="empty__h">No deals right now</p>
          <p className="muted small">{emptyText}</p>
          {quiet ? <p className="muted small">{quiet}</p> : null}
        </div>
      )}
      {list.length && allQuiet && isLive && quiet ? <p className="feed__quiet">{quiet}</p> : null}
      {missed.length ? (
        <section className="missed" aria-labelledby="missed-h">
          <h2 id="missed-h" className="missed__h">Closed before the free feed could show them</h2>
          <ul>{missed.map(m => <li key={m.id}>{m.text}</li>)}</ul>
        </section>
      ) : null}
      {open ? <DealSheet id={open.id} title={open.title} live={live} onClose={close} /> : null}
      {how && howRow ? <HowSheet row={howRow} closed={how.closed} unlockHref={unlockHref} onClose={closeHow} /> : null}
    </section>
  );
}
