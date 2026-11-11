"use client";
/* "The live board": millionaire bets as a written list, not an odds board. Each row: the market, then the money and the
 * time on the same line; under it, the side at its price, now, and the wallet. Repeats (same wallet, market and side
 * within 2 hours) are one row: "4 bets · $X total · avg 63¢". Selecting a row reveals its Copy (only there); the price
 * change is the only green or red. One row of category chips that scrolls sideways. Refreshes every 30 s while visible.
 * The default is every watched wallet up $100K+ (each row labelled with its tier); "$1M+" and "$100K–$1M" filter it. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Verify } from "@/components/brand/Verify";
import { betExplain } from "@/lib/brief/explain";
import { CATEGORIES, category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { decidedText, decision } from "@/lib/millionaires/decided";
import { groupBets } from "@/lib/millionaires/group";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { ChipRow } from "./ChipRow";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);
const ago = (ms: number, now: number) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : `${Math.floor(s / 3600)}h ago`; };

/** n: rows to fetch; cat: the server-side category (the board's ?cat=, kept when it refreshes); tier: millionaire
 *  ($1M+, the default) or pro; links: category chips as links to /board (the full board) rather than an in-place
 *  filter. */
export function LiveBoard({ initial, now: now0, copy = true, n = 24, cat: serverCat = null, tier = "all", links = false, polymarket = false }: { initial: BoardBet[]; now: number; copy?: boolean; n?: number; cat?: CategorySlug | null; tier?: "all" | "millionaire" | "pro"; links?: boolean;
  /** The viewer is outside the US: Verify may show the Polymarket market page. */
  polymarket?: boolean }) {
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
      const r = await fetch(`/api/millionaires/live?n=${n}${serverCat ? `&cats=${serverCat}` : ""}&tier=${tier}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      const fr = new Set(j.bets.filter(b => !seen.current.has(b.id)).map(b => b.id));
      for (const b of j.bets) seen.current.add(b.id);
      setBets(tier === "all" ? j.bets : j.bets.filter(b => b.tier === tier)); setNow(j.now); setFresh(fr);
    }, 10_000); // every 10 seconds: a new $1M+ bet is on the board within seconds of the poller saving it
    return () => { stop = true; clearInterval(id); };
  }, [n, serverCat, tier]);
  const cats = useMemo(() => [...new Set(bets.map(b => b.category))], [bets]);
  const rows = useMemo(() => groupBets(cat === "all" ? bets : bets.filter(b => b.category === cat)), [bets, cat]);
  const q = (c: CategorySlug | null, t: "all" | "millionaire" | "pro") => { const p = new URLSearchParams(); if (c) p.set("cat", c); if (t === "pro") p.set("tier", "pro"); if (t === "millionaire") p.set("tier", "1m"); const s = p.toString(); return `/board${s ? `?${s}` : ""}`; };
  return (
    <div className="s-board" data-testid="live-board">
      {links ? (
        <ChipRow>
          <a className="b-btn b-panel-pill" aria-pressed={!serverCat && tier === "all"} href="/board">All</a>
          <a className="b-btn b-panel-pill" aria-pressed={tier === "millionaire"} href={q(serverCat, tier === "millionaire" ? "all" : "millionaire")} data-testid="filter-1m" title="Wallets up $1M+ only">$1M+ only</a>
          <a className="b-btn b-panel-pill" aria-pressed={tier === "pro"} href={q(serverCat, tier === "pro" ? "all" : "pro")} data-testid="filter-pro" title="Wallets up $100K–$1M">$100K–$1M</a>
          {CATEGORIES.map(c => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={serverCat === c.slug} href={q(c.slug, tier)}>{c.name}</a>)}
        </ChipRow>
      ) : (
        <ChipRow as="div">
          <button type="button" className="b-btn b-panel-pill" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
          {cats.map(c => <button key={c} type="button" className="b-btn b-panel-pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{categoryInfo(c).name}</button>)}
        </ChipRow>
      )}
      <ol className="s-rows" data-stagger="">
        {rows.map((b, i) => {
          const dec = decision(b), on = sel === b.id, d = b.priceThen !== null && b.priceNow !== null ? Math.round((b.priceNow - b.priceThen) * 100) : null;
          return (
            <li key={b.id} className={`s-row${on ? " is-sel" : ""}${fresh.has(b.id) ? " is-new" : ""}`} style={{ "--i": Math.min(i, 12) } as React.CSSProperties} data-testid="bet-row" data-bet={b.id} data-n={b.n} data-ids={b.ids.join(" ")}>
              <button type="button" className="s-row__main" onClick={() => setSel(on ? null : b.id)} aria-expanded={on}>
                <span className="s-row__t">{b.title}</span>
                <span className="s-row__amt b-num">{b.n > 1 ? `${dollars(b.amount)} total` : dollars(b.amount)}</span>
                <span className="s-row__ago b-small">{ago(b.at, now)}</span>
                <span className="b-small s-row__meta">{b.n > 1 ? `${b.n} trades · ` : ""}on <b>{b.outcome}</b> at {b.n > 1 ? "avg " : ""}{cents(b.priceThen)} · now {cents(b.priceNow)}{d ? <span className={d > 0 ? "s-up" : "s-down"}> {d > 0 ? "up" : "down"} {Math.abs(d)}¢</span> : null} · {b.short}{b.pnl !== null ? ` (${b.pnl >= 0 ? "+" : "−"}${dollars(Math.abs(b.pnl))} all-time)` : ""}</span>
                {betExplain(b) ? <span className="b-small" style={{ gridColumn: "1 / -1" }} data-testid="bet-explain">{betExplain(b)}</span> : null}
              </button>
              {b.verify && !(b.verify.locked && !b.verify.tx && !b.verify.address && !b.verify.kalshi) ? <span className="s-row__verify"><Verify v={b.verify} marketId={b.marketId} polymarket={polymarket} compact /></span> : null}
              {on ? <span className="s-row__act">{dec ? <span className="b-small">{decidedText(dec, b.outcome)}</span> : copy ? <a className="b-btn b-btn-lg b-primary" href={`/copy/${encodeURIComponent(b.id)}`} data-testid="bet-copy">Copy at {cents(b.priceNow)}</a> : null}</span> : null}
            </li>
          );
        })}
      </ol>
      {rows.length ? null : <p className="b-empty">No {tier === "pro" ? "$100K–$1M" : tier === "millionaire" ? "$1M+" : "$100K+"} bet {serverCat || cat !== "all" ? "in this category " : ""}in the last day yet. The second one lands, it shows up here.</p>}
    </div>
  );
}
