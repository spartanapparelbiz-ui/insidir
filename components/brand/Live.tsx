"use client";
/* The live parts: the hero's counter and the board strip, refreshed from /api/millionaires/live every 30 seconds while
 * the tab is visible. New rows slide in from above; numbers tick. Starts from the server's data, so the first paint is
 * complete without JavaScript. */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { BoardBet, Pulse } from "@/lib/millionaires/queries";
import { BetRow } from "./BetRow";
import { Tick } from "./motion";

interface LiveState { now: number; pulse: Pulse; bets: BoardBet[] }

function useLive(initial: LiveState, n: number, cats: readonly string[] = []): LiveState {
  const [s, set] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/millionaires/live?n=${n}${cats.length ? `&cats=${cats.join(",")}` : ""}`, { cache: "no-store" });
        if (r.ok && !stop) { const j = await r.json(); set({ now: j.now, pulse: j.pulse, bets: j.bets }); }
      } catch { /* keep what we have */ }
    };
    const id = setInterval(tick, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, cats.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

/** "● 14 millionaire bets in the last hour" (or "today" when the hour had none). */
export function LivePill({ initial }: { initial: Pulse }) {
  const [p, set] = useState(initial);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try { const r = await fetch("/api/millionaires/live?n=1", { cache: "no-store" }); if (r.ok) set((await r.json()).pulse); } catch { /* keep */ }
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="b-pill" data-testid="live-pill">
      <span className="b-dot" aria-hidden="true" />
      <span><Tick value={p.count} format={v => Math.round(v).toLocaleString("en-US")} /> millionaire {p.count === 1 ? "bet" : "bets"} {p.window === "hour" ? "in the last hour" : "today"}</span>
    </span>
  );
}

/** The board strip: the newest bets, animating in as they arrive. */
export function LiveBoard({ initial, n = 5, cats, rowHref, empty }: { initial: LiveState; n?: number; cats?: readonly string[]; rowHref?: (b: BoardBet) => string; empty: string }) {
  const s = useLive(initial, n, cats);
  const reduce = useReducedMotion();
  if (!s.bets.length) return <p className="b-muted" data-testid="board-empty">{empty}</p>;
  return (
    <ul className="b-rows" data-testid="board-rows">
      <AnimatePresence initial={false}>
        {s.bets.map(b => (
          <motion.li key={b.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}>
            <BetRow bet={b} now={s.now} href={rowHref?.(b)} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
