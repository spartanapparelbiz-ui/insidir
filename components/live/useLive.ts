"use client";
/* The browser side of the live pipe. Opens /api/live (Server-Sent Events), keeps the latest events (newest first),
 * and lets components subscribe to one type. It closes the stream while the tab is hidden and reopens it when the
 * tab comes back, and paces bursts so a person can read them: at most one event per type is handed out every
 * PACE_MS, price ticks keep only the latest per deal. Reports the user's reduced-motion preference so components
 * can swap motion for instant updates. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveEvent, LiveHello, LiveStatus } from "@/lib/live/types";

export const PACE_MS = 1_200;
export const KEEP = 40;

export type LiveConnection = "connecting" | "live" | "paused" | "offline";

export interface Live {
  status: LiveConnection;
  scanner: LiveStatus | null;
  hello: LiveHello | null;
  /** Newest first, at most KEEP. */
  events: LiveEvent[];
  /** Server time minus browser time, so "Xs ago" uses the server's clock. */
  skewMs: number;
  reducedMotion: boolean;
  on<T extends LiveEvent["type"]>(type: T, fn: (e: Extract<LiveEvent, { type: T }>) => void): () => void;
}

type Handler = (e: LiveEvent) => void;

export function useLive({ enabled = true }: { enabled?: boolean } = {}): Live {
  const [status, setStatus] = useState<LiveConnection>("connecting");
  const [scanner, setScanner] = useState<LiveStatus | null>(null);
  const [hello, setHello] = useState<LiveHello | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [skewMs, setSkew] = useState(0);
  const [reducedMotion, setReduced] = useState(false);
  const handlers = useRef(new Map<string, Set<Handler>>());
  const queue = useRef<LiveEvent[]>([]);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const deliver = useCallback((e: LiveEvent) => {
    if (seen.current.has(e.id)) return;
    seen.current.add(e.id);
    setEvents(prev => [e, ...prev].slice(0, KEEP));
    for (const fn of handlers.current.get(e.type) ?? []) fn(e);
  }, []);

  // Pace: hand out queued events one at a time (price ticks: the latest per deal at once).
  useEffect(() => {
    const t = setInterval(() => {
      const q = queue.current;
      if (!q.length) return;
      const ticks = q.filter(e => e.type === "price_tick");
      const rest = q.filter(e => e.type !== "price_tick");
      const latest = new Map<string, LiveEvent>();
      for (const e of ticks) latest.set(e.oppId ?? "", e);
      for (const e of latest.values()) deliver(e);
      const next = rest.shift();
      if (next) deliver(next);
      queue.current = rest;
    }, PACE_MS);
    return () => clearInterval(t);
  }, [deliver]);

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    const open = () => {
      if (es) return;
      setStatus("connecting");
      es = new EventSource("/api/live");
      es.addEventListener("open", () => setStatus("live"));
      es.addEventListener("error", () => setStatus(document.hidden ? "paused" : "offline"));
      es.addEventListener("hello", ev => {
        const h = JSON.parse((ev as MessageEvent<string>).data) as LiveHello;
        setHello(h);
        setSkew(h.serverNow - Date.now());
      });
      es.addEventListener("status", ev => {
        const s = JSON.parse((ev as MessageEvent<string>).data) as LiveStatus;
        setScanner(s);
        setSkew(s.serverNow - Date.now());
      });
      es.addEventListener("backlog", ev => {
        const list = JSON.parse((ev as MessageEvent<string>).data) as LiveEvent[];
        for (const e of list) seen.current.add(e.id);
        setEvents(prev => [...prev, ...list].filter((e, i, a) => a.findIndex(x => x.id === e.id) === i).sort((a, b) => b.id - a.id).slice(0, KEEP));
      });
      for (const type of ["deal_found", "deal_closed", "price_tick", "whale"] as const) {
        es.addEventListener(type, ev => { queue.current.push(JSON.parse((ev as MessageEvent<string>).data) as LiveEvent); });
      }
    };
    const shut = () => { es?.close(); es = null; };
    const onVis = () => {
      if (document.hidden) { shut(); setStatus("paused"); } else open();
    };
    if (!document.hidden) open(); else setStatus("paused");
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); shut(); };
  }, [enabled]);

  const on = useCallback(<T extends LiveEvent["type"]>(type: T, fn: (e: Extract<LiveEvent, { type: T }>) => void) => {
    const set = handlers.current.get(type) ?? new Set<Handler>();
    const h = fn as Handler;
    set.add(h);
    handlers.current.set(type, set);
    return () => { set.delete(h); };
  }, []);

  return { status, scanner, hello, events, skewMs, reducedMotion, on };
}
