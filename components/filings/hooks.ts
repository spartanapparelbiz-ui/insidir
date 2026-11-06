"use client";
/* The browser side of Filings: one member-state load, the shared feed polled every 15 s (60 s in a background tab) and
 * filtered here by the member's watchlists, the ticker directory loaded once and searched locally, and debounced saves.
 * The server never filters or sorts for a member; that work happens here. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnomalyRow, FilingRow, Journal, MemberState, Position, Watchlist } from "@/lib/filings/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
}

export const POLL_VISIBLE_MS = 15_000;
export const POLL_HIDDEN_MS = 60_000;
const WEEK = 7 * 86_400_000;

/** Calls `fn` now and every `visibleMs` while the tab is visible (`hiddenMs` when it isn't). */
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

/** The member's state (lists, cursor, positions, journal index) and its savers. */
export function useMember() {
  const [state, setState] = useState<MemberState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listSave, setListSave] = useState<SaveState>("idle");
  const reload = useCallback(async () => {
    try { setState(await api<MemberState>("/api/filings/me")); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const saveLists = useCallback(async (lists: Watchlist[]) => {
    setListSave("saving");
    try {
      // Lists made in this tab carry a negative id until the server gives them one.
      const body = { lists: lists.map(l => ({ name: l.name, items: l.items, ...(l.id > 0 ? { id: l.id } : {}) })) };
      const r = await api<{ lists: Watchlist[] }>("/api/filings/watchlists", { method: "PUT", body: JSON.stringify(body) });
      // New lists get their ids; keep what the member has typed since.
      setState(s => (s ? { ...s, watchlists: s.watchlists.map((l, i) => (l.id > 0 ? l : { ...l, id: r.lists[i]?.id ?? l.id })) } : s));
      setListSave("saved");
    } catch { setListSave("error"); }
  }, []);
  const lists = useDebouncedSave(saveLists, 600);
  const setWatchlists = useCallback((next: Watchlist[]) => {
    setState(s => (s ? { ...s, watchlists: next } : s));
    lists.queue(next);
  }, [lists]);

  const setPositions = useCallback(async (positions: Position[]): Promise<string | null> => {
    const version = state?.positionsVersion ?? 0;
    setState(s => (s ? { ...s, positions } : s));
    try {
      const r = await api<{ version: number }>("/api/filings/positions", { method: "PUT", body: JSON.stringify({ positions, version }) });
      setState(s => (s ? { ...s, positionsVersion: r.version } : s));
      return null;
    } catch (e) {
      if ((e as { status?: number }).status === 409) await reload();
      return (e as Error).message;
    }
  }, [state?.positionsVersion, reload]);

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

/** Watched companies' filings: loaded once for the last 7 days, then kept current from the shared feed. */
export function useWatchedFeed(watched: ReadonlySet<string>, enabled: boolean) {
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [failing, setFailing] = useState(false);
  const [fresh, setFresh] = useState<FilingRow[]>([]);
  const cursor = useRef(0);
  const key = useMemo(() => [...watched].sort().join(","), [watched]);

  const load = useCallback(async (since: number) => {
    if (!key) { setRows([]); return; }
    const r = await api<{ rows: FilingRow[] }>(`/api/filings/watched?ciks=${key}&since=${since}`);
    setRows(prev => merge(prev, r.rows));
  }, [key]);

  // A new watchlist set: reload the week for it.
  useEffect(() => { if (enabled) void load(Date.now() - WEEK).catch(() => setFailing(true)); }, [enabled, load]);

  usePoll(async () => {
    try {
      const r = await api<{ rows: FilingRow[]; cursor: number; gap: boolean }>(`/api/filings/feed?after=${cursor.current}`);
      if (r.gap) await load(Date.now() - WEEK);
      const mine = r.rows.filter(f => watched.has(f.cik));
      if (cursor.current > 0 && mine.length) { setRows(prev => merge(prev, mine)); setFresh(mine); }
      cursor.current = Math.max(cursor.current, r.cursor);
      setLastOk(Date.now()); setFailing(false);
    } catch { setFailing(true); }
  }, POLL_VISIBLE_MS, POLL_HIDDEN_MS, enabled);

  const clearFresh = useCallback(() => setFresh([]), []);
  return { rows, lastOk, failing, fresh, clearFresh };
}

const merge = (a: readonly FilingRow[], b: readonly FilingRow[]): FilingRow[] => {
  const by = new Map<number, FilingRow>();
  for (const r of [...a, ...b]) by.set(r.id, r);
  return [...by.values()].sort((x, y) => y.acceptedAt - x.acceptedAt || y.id - x.id);
};

/** The Stream, refreshed every minute while visible. */
export function useStream(enabled: boolean) {
  const [rows, setRows] = useState<AnomalyRow[] | null>(null);
  usePoll(async () => { setRows((await api<{ rows: AnomalyRow[] }>("/api/filings/stream")).rows); }, 60_000, 300_000, enabled);
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
  const byCik = useMemo(() => new Map((list ?? []).map(([t, c, title]) => [c, { ticker: t, cik: c, title }])), [list]);
  const byTicker = useMemo(() => new Map((list ?? []).map(([t, c, title]) => [t, { ticker: t, cik: c, title }])), [list]);
  const search = useCallback((q: string, n = 8): TickerHit[] => {
    const s = q.trim().toUpperCase();
    if (!s || !list) return [];
    const exact: TickerHit[] = [], prefix: TickerHit[] = [], name: TickerHit[] = [];
    for (const [t, c, title] of list) {
      if (t === s) exact.push({ ticker: t, cik: c, title });
      else if (t.startsWith(s)) prefix.length < n && prefix.push({ ticker: t, cik: c, title });
      else if (s.length > 2 && title.toUpperCase().includes(s)) name.length < n && name.push({ ticker: t, cik: c, title });
    }
    return [...exact, ...prefix.sort((a, b) => a.ticker.length - b.ticker.length), ...name].slice(0, n);
  }, [list]);
  return { ready: Boolean(list), search, byCik, byTicker };
}
