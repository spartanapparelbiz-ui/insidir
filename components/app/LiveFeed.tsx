"use client";
/* The live Terminal: a dense, aligned table (components/app/DealTable.tsx) under a toolbar (heartbeat, today's
 * totals, filters, sort, compact). The server renders the rows first (works without JS); then the live pipe (useLive,
 * one EventSource per page) takes over: a new deal slides in at the top and its profit flashes white, price ticks
 * update rows in place (the numbers flash), a closed deal greys for 5 seconds then collapses. A slow resync from
 * GET /api/feed every minute (and on reconnect) catches anything missed. Nothing is ever shown as live while the
 * scanner or the connection is down. The tab title carries the live count: "(3) Insidir Terminal".
 *
 * Keyboard: J / K move between rows, Enter opens the drawer, Esc closes it, / jumps to search.
 * Free viewers: the same table with paid cells as lock bars (never sent), and one bar pinned at the top. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { useLive } from "@/components/live/useLive";
import type { FeedRow } from "@/lib/feed";
import { money2, pct2 } from "@/lib/format";
import type { DataStatus } from "@/lib/status";
import { categoriesOf, filterRows, NO_FILTER, SORTS, sortRows, type SortKey, type TableFilter } from "@/lib/terminal-table";
import type { Plan, Safety, Venue } from "@/lib/types";
import { DealSheet } from "./DealSheet";
import { DealTable, type RowMotion } from "./DealTable";
import { applyTick, missedByDelay } from "./live-rows";
import { StatusBanner } from "./StatusBanner";
import { TerminalTips } from "./TerminalTips";

interface FeedResponse { now: number; plan: Plan; status: DataStatus; rows: FeedRow[] }

const isFeed = (v: unknown): v is FeedResponse =>
  typeof v === "object" && v !== null && Array.isArray((v as FeedResponse).rows) && typeof (v as FeedResponse).now === "number"
  && typeof (v as FeedResponse).status === "object";

/** How long a new row is highlighted, how long a closed row stays (grey) before it collapses, and the collapse. */
const NEW_MS = 1_800;
const CLOSING_MS = 5_000;
const GONE_MS = 320;
const TICK_MS = 1_000;
const RESYNC_MS = 60_000;
const COMPACT_KEY = "insidir_compact";

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

export interface TerminalTotals { found: number; bestRoi: number | null }

export function LiveFeed({ initialRows, initialNow, initialStatus, plan, maxRows, unlockHref, unlockLabel, venues, medianGapMin, soundOnGreen,
  totals, missedToday, todayStart, filtered, tips = true, alertsOn = true }: {
  initialRows: FeedRow[]; initialNow: number; initialStatus: DataStatus; plan: Plan; maxRows: number | null; unlockHref: string; unlockLabel: string;
  venues: Venue[]; medianGapMin: number | null; soundOnGreen: boolean;
  totals: TerminalTotals; missedToday: number; todayStart: number;
  /** The member's saved filters (Settings) are narrowing the feed. */
  filtered: boolean;
  /** First-visit tips: off while onboarding is showing (one dialog at a time). */
  tips?: boolean;
  /** A member with no alerts on gets "Turn on alerts" as the page's one primary action. */
  alertsOn?: boolean;
}) {
  const live = useLive();
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [motion, setMotion] = useState<Record<string, RowMotion>>({});
  const [status, setStatus] = useState(initialStatus);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);
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
      if (rowsRef.current.some(r => r.id === e.oppId)) {
        mark(e.oppId, "closing", CLOSING_MS, () => mark(e.oppId, "gone", GONE_MS, () => setRows(p => p.filter(r => r.id !== e.oppId))));
      }
      // Only closings after the page loaded: the server's count already covers the ones before.
      if (e.at > initialNow && missedByDelay(e.data, delayRef.current)) setMissedLive(x => (x.includes(e.id) || e.data.firstSeenAt < todayStart ? x : [...x, e.id]));
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
  const list = useMemo(() => rows.map(r => (r.stale || (scanner.live && !offline) ? r : { ...r, stale: true })), [rows, scanner.live, offline]);
  const delayMs = live.hello?.delayMs ?? 30 * 60_000;

  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;
  const [missedLive, setMissedLive] = useState<number[]>([]);

  // Controls: filters, sort, compact (remembered on this device), search, the keyboard-selected row.
  const [filter, setFilter] = useState<TableFilter>(NO_FILTER);
  const [sort, setSort] = useState<SortKey>("perDay");
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { setCompact(localStorage.getItem(COMPACT_KEY) === "1"); } catch { /* private mode */ } }, []);
  const toggleCompact = () => setCompact(c => { try { localStorage.setItem(COMPACT_KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  const search = useRef<HTMLInputElement>(null);
  const tableBox = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const shown = useMemo(() => sortRows(filterRows(list, filter), sort), [list, filter, sort]);
  const cats = useMemo(() => categoriesOf(list), [list]);
  const liveCount = list.filter(r => !r.stale && !r.locked).length;
  const available = plan === "free" ? null : list.filter(r => !r.stale && r.profit !== null).reduce((s, r) => s + (r.profit ?? 0), 0);
  const missedCount = missedToday + missedLive.length;

  // The tab title carries the live count.
  useEffect(() => { document.title = liveCount ? `(${liveCount}) Insidir Terminal` : "Terminal | Insidir"; }, [liveCount]);

  const openRow = useCallback((id: string) => {
    const r = rowsRef.current.find(x => x.id === id);
    if (r) { setSelected(id); setOpen({ id, title: r.title }); }
  }, []);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const tr = e.target instanceof Element ? e.target.closest<HTMLElement>("tr[data-deal]") : null;
    if (!tr?.dataset.deal) return;
    e.preventDefault();
    openRow(tr.dataset.deal);
  };
  const focusRow = useCallback((id: string) => {
    setSelected(id);
    tableBox.current?.querySelector<HTMLElement>(`tr[data-deal="${CSS.escape(id)}"]`)?.focus();
  }, []);
  // J / K / Enter on the table, / anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // On phones search sits behind "Filters and sort": open it, then focus once it's shown.
      if (e.key === "/" && !typing) { e.preventDefault(); setFiltersOpen(true); window.setTimeout(() => search.current?.focus(), 0); return; }
      if (typing) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "J" && e.key !== "K") return;
      if (!shown.length) return;
      e.preventDefault();
      const i = Math.max(0, shown.findIndex(r => r.id === selected));
      const next = e.key.toLowerCase() === "j" ? Math.min(shown.length - 1, selected ? i + 1 : 0) : Math.max(0, i - 1);
      focusRow(shown[next]!.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, shown, selected, focusRow]);
  const onTableKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const tr = e.target instanceof Element ? e.target.closest<HTMLElement>("tr[data-deal]") : null;
    if (e.key === "Enter" && tr?.dataset.deal) { e.preventDefault(); openRow(tr.dataset.deal); }
  };
  const close = useCallback(() => setOpen(null), []);

  const scanAgo = scanner.lastScanAt !== null ? Math.max(0, Math.floor((now - scanner.lastScanAt) / 1000)) : null;
  const beat = offline ? "Not connected" : !scanner.live ? "Live data paused" : scanAgo !== null ? `Scanning. Last scan ${scanAgo}s ago` : "Scanning";
  const set = <K extends keyof TableFilter>(k: K, v: TableFilter[K]) => setFilter(f => ({ ...f, [k]: v }));
  const anyFilter = filter.category || filter.minRoi > 0 || filter.minSize > 0 || filter.safety || filter.q.trim();
  const gap = medianGapMin !== null && Number.isFinite(medianGapMin) ? Math.max(1, Math.round(medianGapMin)) : null;

  return (
    <section className="feed term" aria-labelledby="feed-h">
      <div className="tbar">
        <div className="tbar__top">
          <h1 id="feed-h" className="tbar__h">Terminal</h1>
          {plan !== "free" && !alertsOn ? <a className="btn btn--primary tbar__alerts" href="/alerts">Turn on alerts</a> : null}
          <p className={`tbar__beat${scanner.live && !offline ? "" : " tbar__beat--paused"}`} role="status" aria-live="off">
            {beat}{plan === "free" ? ". Free feed: 30 min delay" : ""}
          </p>
        </div>
        <dl className="tbar__totals" aria-label="Today">
          <div className="tbar__total"><dt>Deals found today</dt><dd>{totals.found}</dd></div>
          {totals.bestRoi !== null ? <div className="tbar__total"><dt>Best ROI today</dt><dd>{pct2(totals.bestRoi)}</dd></div> : null}
          {available !== null && available > 0 ? <div className="tbar__total"><dt>Net P&L available now</dt><dd>{money2(available)}</dd></div> : null}
        </dl>
        <div className={`tbar__filters${filtersOpen ? " tbar__filters--open" : ""}`}>
          <button type="button" className="btn btn--secondary tbar__toggle tbar__more" aria-expanded={filtersOpen} aria-controls="tbar-controls"
            onClick={() => setFiltersOpen(o => !o)}>Filters and sort{anyFilter ? " (on)" : ""}</button>
          <div className="tbar__controls" id="tbar-controls">
            <label className="tbar__field tbar__search">Search
              <input ref={search} className={`input${filter.q.trim() ? " input--on" : ""}`} type="search" placeholder="Event or venue  ( / )" value={filter.q} onChange={e => set("q", e.target.value)} />
            </label>
            <label className="tbar__field">Category
              <select className={`input${filter.category ? " input--on" : ""}`} value={filter.category} onChange={e => set("category", e.target.value)}>
                <option value="">All</option>
                {cats.map(c => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="tbar__field">Min ROI %
              <input className={`input tbar__num${filter.minRoi > 0 ? " input--on" : ""}`} type="number" inputMode="decimal" min={0} step={0.1} value={filter.minRoi ? Math.round(filter.minRoi * 10_000) / 100 : ""}
                placeholder="0" onChange={e => set("minRoi", Math.max(0, Number(e.target.value) || 0) / 100)} />
            </label>
            {plan !== "free" ? (
              <label className="tbar__field">Min size $
                <input className={`input tbar__num${filter.minSize > 0 ? " input--on" : ""}`} type="number" inputMode="decimal" min={0} step={10} value={filter.minSize || ""} placeholder="0"
                  onChange={e => set("minSize", Math.max(0, Number(e.target.value) || 0))} />
              </label>
            ) : null}
            <label className="tbar__field">Rules
              <select className={`input${filter.safety ? " input--on" : ""}`} value={filter.safety} onChange={e => set("safety", e.target.value as Safety | "")}>
                <option value="">Any</option><option value="green">Same rules</option><option value="yellow">Check rules</option><option value="red">Skip</option>
              </select>
            </label>
            <label className="tbar__field">Sort by
              <select className="input" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
                {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn--secondary tbar__toggle" aria-pressed={compact} onClick={toggleCompact}>Compact</button>
          </div>
        </div>
      </div>
      <StatusBanner status={scanner} venues={venues} offline={offline} />
      <div ref={tableBox} className="term-box" data-term-box onClick={onClick} onKeyDown={onTableKey}>
        {plan === "free" ? (
          <div className="freebar">
            <p>You&apos;re seeing deals 30 min late.{missedCount > 0 ? <> <strong>{missedCount}</strong> closed before you could see them today.</> : null}</p>
            <a className="btn btn--primary" href={unlockHref} data-unlock="plan-banner">{unlockLabel}</a>
          </div>
        ) : null}
        {shown.length ? (
          <>
            <DealTable rows={shown} now={now} motion={motion} selected={selected} compact={compact} caption={`Deals, ${SORTS.find(s => s.key === sort)?.label.toLowerCase()} first`} />
            {tips ? <TerminalTips /> : null}
          </>
        ) : (
          <div className="dt-empty">
            {list.length && anyFilter ? (
              <>
                <p className="dt-empty__h">No deals match these filters</p>
                <p className="muted small">{list.length} {list.length === 1 ? "deal is" : "deals are"} hidden by them.</p>
                <button type="button" className="btn btn--secondary" onClick={() => setFilter(NO_FILTER)}>Clear filters</button>
              </>
            ) : plan === "free" ? (
              <>
                <p className="dt-empty__h">No deals in the free feed right now</p>
                <p className="muted small">The free feed shows deals 30 minutes after they&apos;re found.{gap ? ` Deals usually show up every ${gap} min.` : ""} Members see them as they happen.</p>
                <a className="btn btn--primary" href={unlockHref} data-unlock="empty">{unlockLabel}</a>
              </>
            ) : (
              <>
                <p className="dt-empty__h">No green deals right now.</p>
                <p className="muted small">{gap ? `They usually show up every ${gap} min. ` : ""}Turn on alerts and we&apos;ll tell you.{filtered ? " Your saved filters may be hiding some." : ""}</p>
                <a className="btn btn--primary" href="/alerts">Turn on alerts</a>
              </>
            )}
          </div>
        )}
      </div>
      {open ? <DealSheet id={open.id} title={open.title} live={live} onClose={close} /> : null}
    </section>
  );
}
