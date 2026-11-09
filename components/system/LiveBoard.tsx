"use client";
/* "The live board" as a terminal table (app/terminal.css .t-table): TIME (ET) · WALLET (tier + short address) · MARKET ·
 * SIDE · ENTRY · NOW · SIZE (the row's one bold number) · × USUAL · WHAT IT MEANS · VERIFY, and the selected row's Copy.
 * Repeats (same wallet, market and side within 2 hours) are one row: "4 bets · $X total · avg 63¢". Click or the arrow
 * keys select a row (its Copy shows only there); Enter opens the bet. A new row flashes Custodious Blue once; a price
 * that moved flashes green or red (nothing flashes under reduced motion); the price change is the only green or red.
 * Category chips scroll sideways. Refreshes every 30 s while visible. "Wallets up $1M+" means $1M+: Pro wallets
 * ($100K–$1M) only under the Pro filter. Visitors' rows come without the side (redacted on the server): SIDE reads
 * MEMBERS. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Verify } from "@/components/brand/Verify";
import { betExplain } from "@/lib/brief/explain";
import { CATEGORIES, category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { betPath } from "@/lib/entities/slug";
import { decidedText, decision } from "@/lib/millionaires/decided";
import { groupBets } from "@/lib/millionaires/group";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { ChipRow } from "./ChipRow";
import "@/app/home-terminal.css";

const cents = (p: number | null) => (p === null ? "" : `${Math.round(p * 100)}¢`);
const ago = (ms: number, now: number) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : `${Math.floor(s / 3600)}h ago`; };
const ET_HM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ET_MD = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
/** "14:05" within the last 20 hours (ET), else "NOV 7". */
export const etTime = (ms: number, now: number): string => (now - ms < 20 * 3_600_000 ? ET_HM.format(new Date(ms)) : ET_MD.format(new Date(ms)).toUpperCase());
/** The wallet's tier as a short tag: $1M+ (Custodious Blue) or PRO. */
export const TIER_TAG: Record<string, string> = { millionaire: "$1M+", pro: "PRO" };
/** "3.2×": this bet against the wallet's usual (median) bet; "—" without one. */
export const usualX = (amount: number, usual: number | null | undefined): string => (usual && usual > 0 ? `${(Math.round((amount / usual) * 10) / 10).toFixed(1)}×` : "—");

/** n: rows to fetch; cat: the server-side category (the board's ?cat=, kept when it refreshes); tier: millionaire
 *  ($1M+, the default) or pro; links: category chips as links to /board (the full board) rather than an in-place
 *  filter. */
export function LiveBoard({ initial, now: now0, copy = true, n = 24, cat: serverCat = null, tier = "millionaire", links = false, polymarket = false, chips = true }: { initial: BoardBet[]; now: number; copy?: boolean; n?: number; cat?: CategorySlug | null; tier?: "millionaire" | "pro"; links?: boolean;
  /** The viewer is outside the US: Verify may show the Polymarket market page. */
  polymarket?: boolean;
  /** The category chips above the table (off in a compact home panel). */
  chips?: boolean }) {
  const [bets, setBets] = useState(initial);
  const [now, setNow] = useState(now0);
  const [cat, setCat] = useState<CategorySlug | "all">("all");
  const [sel, setSel] = useState<string | null>(null);
  const seen = useRef(new Set(initial.map(b => b.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // Prices that moved since the last refresh: flash green or red once.
  const [moved, setMoved] = useState<Map<string, "up" | "down">>(new Map());
  const lastPx = useRef(new Map(initial.map(b => [b.id, b.priceNow])));
  useEffect(() => {
    let stop = false;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/millionaires/live?n=${n}${serverCat ? `&cats=${serverCat}` : ""}&tier=${tier}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      const fr = new Set(j.bets.filter(b => !seen.current.has(b.id)).map(b => b.id));
      for (const b of j.bets) seen.current.add(b.id);
      const mv = new Map<string, "up" | "down">();
      for (const b of j.bets) {
        const was = lastPx.current.get(b.id);
        if (was !== undefined && was !== null && b.priceNow !== null && Math.round(b.priceNow * 100) !== Math.round(was * 100)) mv.set(b.id, b.priceNow > was ? "up" : "down");
        lastPx.current.set(b.id, b.priceNow);
      }
      setBets(j.bets.filter(b => b.tier === tier)); setNow(j.now); setFresh(fr); setMoved(mv);
    }, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, serverCat, tier]);
  const cats = useMemo(() => [...new Set(bets.map(b => b.category))], [bets]);
  const rows = useMemo(() => groupBets(cat === "all" ? bets : bets.filter(b => b.category === cat)), [bets, cat]);
  const q = (c: CategorySlug | null, t: "millionaire" | "pro") => { const p = new URLSearchParams(); if (c) p.set("cat", c); if (t === "pro") p.set("tier", "pro"); const s = p.toString(); return `/board${s ? `?${s}` : ""}`; };
  // Arrow keys move the selection; Enter opens the selected bet.
  const key = (e: KeyboardEvent<HTMLTableElement>) => {
    if (!rows.length) return;
    const i = rows.findIndex(r => r.id === sel);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)))]!;
      setSel(next.id);
      (e.currentTarget.querySelector(`tr[data-bet="${CSS.escape(next.id)}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && i >= 0 && !(e.target as HTMLElement).closest("a, button")) {
      e.preventDefault(); window.location.assign(betPath(rows[i]!.id));
    }
  };
  return (
    <div className="s-board t-liveboard" data-testid="live-board">
      {!chips ? null : links ? (
        <ChipRow>
          <a className="b-btn b-panel-pill" aria-pressed={!serverCat && tier === "millionaire"} href="/board">All</a>
          {CATEGORIES.map(c => <a key={c.slug} className="b-btn b-panel-pill" aria-pressed={serverCat === c.slug} href={q(c.slug, tier)}>{c.name}</a>)}
          <a className="b-btn b-panel-pill" aria-pressed={tier === "pro"} href={q(serverCat, tier === "pro" ? "millionaire" : "pro")} data-testid="filter-pro" title="Wallets up $100K–$1M">Pro</a>
        </ChipRow>
      ) : (
        <ChipRow as="div">
          <button type="button" className="b-btn b-panel-pill" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
          {cats.map(c => <button key={c} type="button" className="b-btn b-panel-pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{categoryInfo(c).name}</button>)}
        </ChipRow>
      )}
      <div className="t-scroll">
        <table className="t-table t-board" tabIndex={0} aria-label="Bets of $5K+ from wallets up $1M+. Arrow keys select a row, Enter opens it." onKeyDown={key} data-testid="board-table">
          <thead><tr><th>Time</th><th>Wallet</th><th>Market</th><th>Side</th><th className="r">Entry</th><th className="r">Now</th><th className="r">Size</th><th className="r">× Usual</th><th>What it means</th><th>Verify</th><th><span className="b-sr">Action</span></th></tr></thead>
          <tbody>
            {rows.map(b => {
              const dec = decision(b), on = sel === b.id, d = b.priceThen !== null && b.priceNow !== null ? Math.round((b.priceNow - b.priceThen) * 100) : null;
              const ex = betExplain(b), mv = moved.get(b.id);
              return (
                <tr key={b.id} className={fresh.has(b.id) ? "t-new" : undefined} aria-selected={on} data-testid="bet-row" data-bet={b.id} data-n={b.n} data-ids={b.ids.join(" ")} data-tier={b.tier} onClick={() => setSel(b.id)}>
                  <td className="t-muted" title={ago(b.at, now)}>{etTime(b.at, now)}</td>
                  <td><span className={`t-tagtier t-tagtier--${b.tier}`}>{TIER_TAG[b.tier] ?? b.tier}</span> {b.short}{b.pnl !== null ? <span className="t-muted"> {b.pnl >= 0 ? "+" : "−"}{dollars(Math.abs(b.pnl))}</span> : null}</td>
                  <td className="t-ell t-mkt"><button type="button" className="t-rowbtn" onClick={e => { e.stopPropagation(); setSel(on ? null : b.id); }} aria-expanded={on} title={b.title}>{b.title}{b.n > 1 ? <span className="t-muted"> · {b.n} bets</span> : null}</button></td>
                  <td>{b.outcome === null || b.side === null ? <span className="t-lock" data-locked="side">MEMBERS</span> : <span className={/^(yes|no)$/i.test(b.outcome) ? `b-side b-side--${b.side}` : "b-side"}>{b.outcome}</span>}</td>
                  <td className="r">{b.priceThen === null ? "—" : `${b.n > 1 ? "avg " : ""}${cents(b.priceThen)}`}</td>
                  <td className={`r${mv ? ` t-flash-${mv}` : ""}`}>{b.priceNow === null ? "—" : cents(b.priceNow)}{d ? <span className={d > 0 ? "t-up" : "t-down"}> {d > 0 ? "+" : "−"}{Math.abs(d)}</span> : null}</td>
                  <td className="r"><b className="t-strong">{dollars(b.amount)}</b></td>
                  <td className="r t-muted">{usualX(b.amount, b.usual)}</td>
                  <td className="t-ell t-explain t-muted" title={ex ?? undefined}>{ex ? <span data-testid="bet-explain">{ex}</span> : "—"}</td>
                  <td>{b.verify ? <span className="s-row__verify"><Verify v={b.verify} marketId={b.marketId} polymarket={polymarket} compact /></span> : null}</td>
                  <td className="t-act">{on ? (dec ? <span className="t-muted">{decidedText(dec, b.outcome)}</span> : copy ? <a className="t-btn2" href={`/copy/${encodeURIComponent(b.id)}`} data-testid="bet-copy">Copy at {cents(b.priceNow)}</a> : <a className="t-btn2" href={betPath(b.id)}>Open</a>) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length ? null : <p className="t-empty">No {tier === "pro" ? "Pro" : "millionaire"} bet {serverCat || cat !== "all" ? "in this category " : ""}in the last day yet. The second one lands, it shows up here.</p>}
    </div>
  );
}
