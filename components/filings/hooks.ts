"use client";
/* The terminal's data layer, all in the browser (docs/RESEARCH-DESK.md):
 *   - one member-state load; watchlists, journals and positions update optimistically and save debounced (positions
 *     roll back if the server refuses);
 *   - one live poll of the shared feed every 15 s (60 s in a background tab) that also carries EDGAR's health;
 *   - the tape: immutable id buckets fetched on scroll (browser-cached for a day), merged with the live rows;
 *   - the SEC ticker directory fetched once and searched in memory;
 *   - hotkeys, a clock, and per-browser preferences in localStorage.
 * The server never sorts or filters for a member. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bucketOf, mergeRows } from "@/lib/filings/filter";
import type { EdgarHealth } from "@/lib/filings/store";
import type { AnomalyRow, FilingRow, Journal, MemberState, Position, Watchlist } from "@/lib/filings/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: init?.method ? "no-store" : "default" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
}

export const POLL_VISIBLE_MS = 15_000;
export const POLL_HIDDEN_MS = 60_000;
const WEEK = 7 * 86_400_000;
const LIVE_CAP = 2_000;

/** Calls `fn` now and every `visibleMs` while the tab is visible (`hiddenMs` when it isn't); at once on refocus. */
export function usePoll(fn: () => Promise<void> | void, visibleMs: number, hiddenMs: number, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
    const tick = async () => {
      try { await ref.current(); } catch { /* the next tick retries */ }
      if (!stopped) timer = setTimeout(tick, document.visibilityState === "visible" ? visibleMs : hiddenMs);
    };
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void tick(); } };
    void tick();
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [visibleMs, hiddenMs, enabled]);
}

/** Calls `save(value)` `ms` after the last change; `flush` saves now. */
export function useDebouncedSave<T>(save: (v: T) => Promise<void>, ms: number): { queue: (v: T) => void; flush: () => Promise<void>; pending: boolean } {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<{ v: T } | null>(null);
  const [pending, setPending] = useState(false);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = latest.current;
    latest.current = null;
    if (next) { try { await save(next.v); } finally { setPending(Boolean(latest.current)); } }
  }, [save]);
  const queue = useCallback((v: T) => { latest.current = { v }; setPending(true); clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), ms); }, [flush, ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { queue, flush, pending };
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/** The member's state and its savers. Every change shows at once; the server write follows. */
export function useMember() {
  const [state, setState] = useState<MemberState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listSave, setListSave] = useState<SaveState>("idle");
  const reload = useCallback(async () => {
    try { setState(await api<MemberState>("/api/filings/me", { method: "GET" })); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const saveLists = useCallback(async (lists: Watchlist[]) => {
    setListSave("saving");
    try {
      // Lists made in this tab carry a negative id until the server gives them one.
      const body = { lists: lists.map(l => ({ name: l.name, items: l.items, ...(l.id > 0 ? { id: l.id } : {}) })) };
      const r = await api<{ lists: Watchlist[] }>("/api/filings/watchlists", { method: "PUT", body: JSON.stringify(body) });
      setState(s => (s ? { ...s, watchlists: s.watchlists.map((l, i) => (l.id > 0 ? l : { ...l, id: r.lists[i]?.id ?? l.id })) } : s));
      setListSave("saved");
    } catch { setListSave("error"); }
  }, []);
  const lists = useDebouncedSave(saveLists, 500);
  const setWatchlists = useCallback((next: Watchlist[]) => {
    setState(s => (s ? { ...s, watchlists: next } : s));
    lists.queue(next);
  }, [lists]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const setPositions = useCallback(async (positions: Position[]): Promise<string | null> => {
    const before = stateRef.current;
    if (!before) return "Not loaded yet.";
    setState({ ...before, positions });
    try {
      const r = await api<{ version: number }>("/api/filings/positions", { method: "PUT", body: JSON.stringify({ positions, version: before.positionsVersion }) });
      setState(s => (s ? { ...s, positionsVersion: r.version } : s));
      return null;
    } catch (e) {
      // Roll back to what the server holds.
      if ((e as { status?: number }).status === 409) await reload(); else setState(s => (s ? { ...s, positions: before.positions } : s));
      return (e as Error).message;
    }
  }, [reload]);

  const markSeen = useCallback(async (id: number) => {
    setState(s => (s && id > s.seenId ? { ...s, seenId: id } : s));
    await api("/api/filings/seen", { method: "POST", body: JSON.stringify({ id }) }).catch(() => undefined);
  }, []);
  const acknowledge = useCallback(async (version: number) => {
    await api("/api/filings/ack", { method: "POST", body: JSON.stringify({ version }) });
    setState(s => (s ? { ...s, ackVersion: version } : s));
  }, []);
  const journalTouched = useCallback((j: Journal) => {
    setState(s => (s ? { ...s, journals: [{ cik: j.cik, ticker: j.ticker, status: j.status, notes: j.notes.length, updatedAt: j.updatedAt }, ...s.journals.filter(x => x.cik !== j.cik)] } : s));
  }, []);
  return { state, error, reload, setWatchlists, listSave, setPositions, markSeen, acknowledge, journalTouched };
}

export type Link = "connecting" | "live" | "slow" | "offline";

/** The shared feed: every filing that reaches Insidir while the terminal is open, EDGAR's health, and the link's own
 *  state and round-trip time. One request per poll, served from the server's shared cache. */
export function useLiveFeed(enabled: boolean) {
  const [live, setLive] = useState<FilingRow[]>([]);
  const [fresh, setFresh] = useState<FilingRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [edgar, setEdgar] = useState<EdgarHealth | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [rtt, setRtt] = useState<number | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [gapAt, setGapAt] = useState(0);
  const at = useRef(0);
  usePoll(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) { setLink("offline"); return; }
    const t0 = performance.now();
    try {
      const r = await api<{ rows: FilingRow[]; cursor: number; gap: boolean; edgar: EdgarHealth }>(`/api/filings/feed?after=${at.current}`, { method: "GET" });
      const ms = Math.round(performance.now() - t0);
      setRtt(ms); setLink(ms > 2_000 ? "slow" : "live"); setLastOk(Date.now()); setEdgar(r.edgar);
      if (r.gap) setGapAt(Date.now());
      if (at.current > 0 && r.rows.length) { setLive(prev => mergeRows(prev, r.rows).slice(0, LIVE_CAP)); setFresh(r.rows); }
      at.current = Math.max(at.current, r.cursor);
      setCursor(at.current);
    } catch { setLink(navigator.onLine ? "slow" : "offline"); }
  }, POLL_VISIBLE_MS, POLL_HIDDEN_MS, enabled);
  useEffect(() => {
    const off = () => setLink("offline"), on = () => setLink("connecting");
    window.addEventListener("offline", off); window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, []);
  const clearFresh = useCallback(() => setFresh([]), []);
  return { live, fresh, clearFresh, cursor, edgar, link, rtt, lastOk, gapAt };
}

/** The member's watched companies over the last 7 days: one indexed read on load, again when the list changes or the
 *  feed reports a gap. New filings arrive through useLiveFeed. */
export function useWatchedHistory(watched: ReadonlySet<string>, enabled: boolean, gapAt: number) {
  const [rows, setRows] = useState<FilingRow[]>([]);
  const key = useMemo(() => [...watched].sort().join(","), [watched]);
  useEffect(() => {
    if (!enabled) return;
    if (!key) { setRows([]); return; }
    let live = true;
    void api<{ rows: FilingRow[] }>(`/api/filings/watched?ciks=${key}&since=${Date.now() - WEEK}`, { method: "GET" })
      .then(r => { if (live) setRows(r.rows); }).catch(() => undefined);
    return () => { live = false; };
  }, [key, enabled, gapAt]);
  return rows;
}

/** The full tape: id buckets loaded newest first as the list scrolls. Old buckets never change, so the browser cache
 *  serves them on every later visit. */
export function useTape(cursor: number, enabled: boolean) {
  const [pages, setPages] = useState<Map<number, FilingRow[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const newest = cursor > 0 ? bucketOf(cursor) : -1;
  const next = useRef<number | null>(null);
  const busy = useRef(false);
  const load = useCallback(async (b: number) => {
    const r = await api<{ rows: FilingRow[] }>(`/api/filings/tape?bucket=${b}&newest=${newest}`, { method: b === newest ? "GET" : undefined });
    setPages(p => new Map(p).set(b, r.rows));
  }, [newest]);
  // Start (or refresh the head) whenever the cursor moves into a new bucket.
  useEffect(() => {
    if (!enabled || newest < 0) return;
    if (next.current === null) next.current = newest - 1;
    void load(newest).catch(() => undefined);
  }, [enabled, newest, load]);
  const loadMore = useCallback(async () => {
    if (busy.current || next.current === null || next.current < 0) return;
    busy.current = true; setLoading(true);
    try {
      // Skip empty buckets (every filing in them was unreadable) until one has rows or the start is reached.
      for (let tries = 0; tries < 5 && next.current !== null && next.current >= 0; tries++) {
        const b: number = next.current;
        next.current = b - 1;
        const r = await api<{ rows: FilingRow[] }>(`/api/filings/tape?bucket=${b}&newest=${newest}`);
        setPages(p => new Map(p).set(b, r.rows));
        if (r.rows.length) break;
      }
    } catch { /* retried on the next scroll */ } finally { busy.current = false; setLoading(false); }
  }, [newest]);
  const rows = useMemo(() => mergeRows([], [...pages.values()].flat()), [pages]);
  return { rows, loadMore, loading, done: next.current !== null && next.current < 0 };
}

/** The Stream, refreshed every minute while visible. */
export function useStream(enabled: boolean) {
  const [rows, setRows] = useState<AnomalyRow[] | null>(null);
  usePoll(async () => { setRows((await api<{ rows: AnomalyRow[] }>("/api/filings/stream", { method: "GET" })).rows); }, 60_000, 300_000, enabled);
  return rows;
}

export interface TickerHit { ticker: string; cik: string; title: string }
let directory: Promise<Array<[string, string, string]>> | null = null;
/** The SEC ticker directory, fetched once per page (browser-cached for an hour) and searched in memory. */
export function useTickers(active: boolean) {
  const [list, setList] = useState<Array<[string, string, string]> | null>(null);
  useEffect(() => {
    if (!active || list) return;
    directory ??= api<{ rows: Array<[string, string, string]> }>("/api/filings/tickers").then(r => r.rows).catch(() => { directory = null; return []; });
    void directory.then(setList);
  }, [active, list]);
  const byTicker = useMemo(() => new Map((list ?? []).map(([t, c, title]) => [t, { ticker: t, cik: c, title }])), [list]);
  const search = useCallback((q: string, n = 8): TickerHit[] => {
    const s = q.trim().toUpperCase();
    if (!s || !list) return [];
    const exact: TickerHit[] = [], prefix: TickerHit[] = [], name: TickerHit[] = [];
    for (const [t, c, title] of list) {
      if (t === s) exact.push({ ticker: t, cik: c, title });
      else if (t.startsWith(s)) { if (prefix.length < n) prefix.push({ ticker: t, cik: c, title }); }
      else if (s.length > 2 && name.length < n && title.toUpperCase().includes(s)) name.push({ ticker: t, cik: c, title });
    }
    return [...exact, ...prefix.sort((a, b) => a.ticker.length - b.ticker.length), ...name].slice(0, n);
  }, [list]);
  return { ready: Boolean(list), search, byTicker };
}

/** Single-key shortcuts, ignored while typing in a field (Escape always works) or with a modifier held. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
      if (typing && e.key !== "Escape") return;
      const fn = ref.current[e.key] ?? ref.current[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(e); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

/** The current time, ticking every `ms`. 0 until the page is live in the browser, so the server's render and the first
 *  browser render agree (a clock rendered on the server would never match the browser's second). */
export function useNow(ms: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** A per-browser preference (filters, last view). Storage can be missing or refuse; the default then applies. */
export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setV(JSON.parse(raw) as T); } catch { /* default */ }
  }, [key]);
  const set = useCallback((next: T) => {
    setV(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* not kept */ }
  }, [key]);
  return [v, set];
}
