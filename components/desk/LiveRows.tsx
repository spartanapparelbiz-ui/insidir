"use client";
/* Today's millionaire bets, kept live: /api/millionaires/live every 15 s while the tab is visible. Motion only when
 * the data changes: a new bet slides in with a brief violet edge; a price that moved flashes green or red once. */
import { useEffect, useRef, useState } from "react";
import type { BoardBet } from "@/lib/millionaires/queries";
import { BetRows } from "./Parts";

export function LiveRows({ initial, now: now0, n = 14, cats = [], board = false, copy = true }: { initial: BoardBet[]; now: number; n?: number; cats?: readonly string[]; board?: boolean; copy?: boolean }) {
  const [bets, setBets] = useState(initial);
  const [now, setNow] = useState(now0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Map<string, 1 | -1>>(new Map());
  const seen = useRef(new Set(initial.map(b => b.id)));
  const prev = useRef(new Map(initial.map(b => [b.id, b.priceNow])));
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/millionaires/live?n=${n}${cats.length ? `&cats=${cats.join(",")}` : ""}${board ? "&board=1" : ""}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      const fr = new Set<string>(), mv = new Map<string, 1 | -1>();
      for (const b of j.bets) {
        if (!seen.current.has(b.id)) { fr.add(b.id); seen.current.add(b.id); }
        const p = prev.current.get(b.id);
        if (p != null && b.priceNow != null && p !== b.priceNow) mv.set(b.id, b.priceNow > p ? 1 : -1);
        prev.current.set(b.id, b.priceNow);
      }
      setBets(j.bets); setNow(j.now); setFresh(fr); setMoved(mv);
      if (mv.size) setTimeout(() => !stop && setMoved(new Map()), 700);
    };
    const id = setInterval(tick, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, board, cats.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bets.length) return <p className="dk-dim dk-empty">No millionaire bet in the last day here yet. The second one lands, it shows up.</p>;
  return <BetRows bets={bets} now={now} copy={copy} fresh={fresh} moved={moved} />;
}
