"use client";
/* Activity toasts: real events only (a new green deal, a deal that closed). One at a time, at most one every 10
 * seconds, gone after 5, dismissible, and no more than 4 per visit, so it never feels spammy. Bottom-left on
 * desktop, top on phones (clear of the sticky CTA). Free viewers' deals arrive 30 minutes late, and the text says so. */
import { useEffect, useRef, useState } from "react";
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";
import { ago, pct, span } from "@/lib/format";

export const TOAST_GAP_MS = 10_000;
export const TOAST_SHOW_MS = 5_000;
export const TOAST_MAX = 4;
const KEY = "insidir_toasts";

interface Toast { id: number; text: string }

function shownSoFar(): number {
  try { return Number(sessionStorage.getItem(KEY) ?? 0) || 0; } catch { return 0; }
}
function countOne(): void {
  try { sessionStorage.setItem(KEY, String(shownSoFar() + 1)); } catch { /* private mode: count in memory only */ }
}

export function Toasts({ serverNow }: { serverNow: number }) {
  const live = useLiveContext();
  const now = useServerNow(serverNow);
  const nowRef = useRef(now);
  nowRef.current = now;
  const [toast, setToast] = useState<Toast | null>(null);
  const lastAt = useRef(0);
  const used = useRef(0);
  const delayed = (live.hello?.delayMs ?? 0) > 0;

  useEffect(() => { used.current = shownSoFar(); }, []);

  useEffect(() => {
    const show = (id: number, text: string) => {
      const t = Date.now();
      if (used.current >= TOAST_MAX || t - lastAt.current < TOAST_GAP_MS) return;
      lastAt.current = t;
      used.current += 1;
      countOne();
      setToast({ id, text });
    };
    const offFound = live.on("deal_found", e => {
      const r = e.data.row;
      if (r.safety !== "green" || r.kind === "second_opinion") return;
      show(e.id, delayed
        ? `New green deal: ${pct(r.roi)} on ${r.title}. Members saw it ${ago(r.foundAt, nowRef.current)}.`
        : `New green deal just found: ${pct(r.roi)} on ${r.title}.`);
    });
    const offClosed = live.on("deal_closed", e => {
      const n = Math.max(1, Math.round((nowRef.current - e.data.firstSeenAt) / 60_000));
      show(e.id, `A deal just closed after ${span(e.data.lifeMs)}. Members caught it ${n} min ago.`);
    });
    return () => { offFound(); offClosed(); };
  }, [live, delayed]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_SHOW_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toast ? (
        <div className="toast" data-event-id={toast.id}>
          <p className="toast__text">{toast.text}</p>
          <button type="button" className="toast__x" onClick={() => setToast(null)} aria-label="Dismiss">Dismiss</button>
        </div>
      ) : null}
    </div>
  );
}
