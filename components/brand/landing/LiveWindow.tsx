"use client";
/* The homepage's product window: the Live feed itself, six real rows from /api/millionaires/live (board=1: a visitor
 * gets them 60 minutes late and never the side), re-read every 15 seconds; a new row fades in over 150ms. Numbers,
 * addresses and times in the mono face. No mock rows: with nothing to show it says what will appear. */
import { useEffect, useRef, useState } from "react";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";

const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);

export function LiveWindow({ initial, now: now0 }: { initial: BoardBet[]; now: number }) {
  const [rows, setRows] = useState(initial.slice(0, 6));
  const [now, setNow] = useState(now0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef(new Set(initial.map(r => r.id)));
  useEffect(() => {
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/millionaires/live?n=6&board=1", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      setFresh(new Set(j.bets.filter(b => !seen.current.has(b.id)).map(b => b.id)));
      for (const b of j.bets) seen.current.add(b.id);
      setRows(j.bets.slice(0, 6)); setNow(j.now);
    };
    const id = setInterval(read, 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="lx-window" data-testid="live-window">
      <div className="lx-window__bar">
        <span className="lx-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="lx-window__title">Live</span>
        <span className="lx-window__meta lx-mono">60 min delayed<span className="lx-hide-s"> · sides for members</span></span>
      </div>
      {rows.length ? (
        <table className="lx-feed lx-feed--live">
          <thead><tr><th scope="col">Time</th><th scope="col" className="lx-hide-s">Wallet</th><th scope="col">Market</th><th scope="col" className="lx-r">Size</th><th scope="col" className="lx-r lx-hide-s">Price</th><th scope="col" className="lx-r">Side</th></tr></thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.id} className={fresh.has(b.id) ? "lx-new" : undefined} data-testid="live-window-row">
                <td className="lx-mono lx-dim">{ago(now - b.at)}</td>
                <td className="lx-mono lx-hide-s">{b.short}</td>
                <td className="lx-market">{b.title}</td>
                <td className="lx-mono lx-r lx-accent">{dollars(b.amount)}</td>
                <td className="lx-mono lx-r lx-dim lx-hide-s">{b.outcome ? cents(b.priceThen) : "—"}</td>
                <td className="lx-r">{b.outcome ? b.outcome : <span className="lx-chip">Members</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="lx-empty">The next position from a wallet up $1M+ shows here 60 minutes after it lands.</p>}
    </div>
  );
}
