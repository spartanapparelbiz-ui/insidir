"use client";
/* "The live board": today's millionaire bets as a written list, not an odds board. Rows stagger in; a category filter
 * narrows them; selecting a row reveals its Copy (only there); the price change is the only green or red. Refreshes
 * every 30 s while visible; a new bet slides in once. No team logos in rows. */
import { useEffect, useMemo, useRef, useState } from "react";
import { category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { decidedText, decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);
const ago = (ms: number, now: number) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : `${Math.floor(s / 3600)}h ago`; };

export function LiveBoard({ initial, now: now0, copy = true }: { initial: BoardBet[]; now: number; copy?: boolean }) {
  const [bets, setBets] = useState(initial);
  const [now, setNow] = useState(now0);
  const [cat, setCat] = useState<CategorySlug | "all">("all");
  const [sel, setSel] = useState<string | null>(null);
  const seen = useRef(new Set(initial.map(b => b.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    let stop = false;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/millionaires/live?n=24", { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      const fr = new Set(j.bets.filter(b => !seen.current.has(b.id)).map(b => b.id));
      for (const b of j.bets) seen.current.add(b.id);
      setBets(j.bets.filter(b => b.tier === "millionaire")); setNow(j.now); setFresh(fr);
    }, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  const cats = useMemo(() => [...new Set(bets.map(b => b.category))], [bets]);
  const rows = cat === "all" ? bets : bets.filter(b => b.category === cat);
  return (
    <div className="s-board" data-testid="live-board">
      <div className="s-filters" role="group" aria-label="Category">
        <button type="button" className="b-btn b-panel-pill" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
        {cats.map(c => <button key={c} type="button" className="b-btn b-panel-pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{categoryInfo(c).name}</button>)}
      </div>
      <ol className="s-rows" data-stagger="">
        {rows.map((b, i) => {
          const dec = decision(b), on = sel === b.id, d = b.priceThen !== null && b.priceNow !== null ? Math.round((b.priceNow - b.priceThen) * 100) : null;
          return (
            <li key={b.id} className={`s-row${on ? " is-sel" : ""}${fresh.has(b.id) ? " is-new" : ""}`} style={{ "--i": Math.min(i, 12) } as React.CSSProperties} data-testid="bet-row" data-bet={b.id}>
              <button type="button" className="s-row__main" onClick={() => setSel(on ? null : b.id)} aria-expanded={on}>
                <span className="s-row__t">{b.title}</span>
                <span className="b-small">{dollars(b.amount)} on <b>{b.outcome}</b> at {cents(b.priceThen)} · now {cents(b.priceNow)}{d ? <span className={d > 0 ? "s-up" : "s-down"}> {d > 0 ? "up" : "down"} {Math.abs(d)}¢</span> : null} · {b.short}{b.pnl !== null ? ` (${b.pnl >= 0 ? "+" : "−"}${dollars(Math.abs(b.pnl))} all-time)` : ""} · {ago(b.at, now)}</span>
              </button>
              {on ? <span className="s-row__act">{dec ? <span className="b-small">{decidedText(dec, b.outcome)}</span> : copy ? <a className="b-btn b-btn-lg b-primary" href={`/copy/${encodeURIComponent(b.id)}`} data-testid="bet-copy">Copy at {cents(b.priceNow)}</a> : null}</span> : null}
            </li>
          );
        })}
      </ol>
      {rows.length ? null : <p className="b-empty">No millionaire bet in this category today yet.</p>}
    </div>
  );
}
