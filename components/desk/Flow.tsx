"use client";
/* The Desk's live core: the flow table and EdgeChart, sharing the selected bet.
 *   FlowTable  48px rows with hairline dividers: time · wallet (orb, short address, all-time profit, tier ring) · market
 *              (team mark, title, full title on hover) · side · size · entry · now · Δ since entry · Copy. Clicking a row
 *              loads it into EdgeChart. New rows slide in with a violet sweep; when "now" changes, its cell flashes green
 *              or red for 600 ms. Refreshes every 15 s from /api/millionaires/live (members: sides included).
 *   EdgeChart  the price of the side they bought (24 h, or since the first millionaire entry, at most 7 days), gold dots
 *              at each real entry sized by dollars, a dashed line at their average entry, the price now at the right
 *              edge, the space between average and now shaded green (up) or red (down). From /api/desk/edge; when the
 *              venue's history can't be read, an entry → now bar instead: no point is ever made up.
 * Also the full-screen board (/board) with its filters (`board`). */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Edge } from "@/lib/desk/edge";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { TeamMark, WalletOrb } from "./Marks";

const c = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const ETD = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

/* ---------- EdgeChart ---------- */

export function EdgeChart({ edge, loading }: { edge: Edge | null; loading?: boolean }) {
  if (!edge) return <div className="d-edge d-edge--empty" aria-busy={loading}>{loading ? <span className="b-skel__line" style={{ height: 180 }} /> : null}</div>;
  const W = 460, H = 210, pad = { l: 8, r: 52, t: 14, b: 22 };
  const pts = edge.points, last = edge.now, avg = edge.avg;
  const up = last !== null && last >= avg, delta = last === null ? null : Math.round((last - avg) * 100);
  const head = <p className="d-edge__head" data-testid="edge-head">Millionaires in at avg <b className="d-num">{c(avg)}</b>{last !== null ? <> · now <b className="d-num">{c(last)}</b> <b className={`d-num ${up ? "d-up" : "d-down"}`}>{up ? "▲" : "▼"}{Math.abs(delta ?? 0)}¢</b></> : null} · <b className="d-num">{dollars(edge.total)}</b> in</p>;
  const foot = (
    <div className="d-edge__foot">
      {last !== null && last > 0.01 && last < 0.99 ? <a className="d-pill d-pill--white" href={`/copy/${encodeURIComponent(edge.betId)}`} data-testid="edge-copy">Copy at {c(last)}</a> : last !== null ? <span className="b-small">Priced as decided: nothing left to copy.</span> : null}
      <span className="b-small">Information, not advice.</span>
    </div>
  );
  if (pts.length < 2) {
    // The venue's history didn't come through: entry → now only.
    const lo = Math.min(avg, last ?? avg), hi = Math.max(avg, last ?? avg);
    return (
      <div className="d-edge" data-testid="edge-chart" data-mode="bar">
        <div className="d-edge__title"><span title={edge.title}>{edge.title}</span><span className="d-side">{edge.outcome}</span></div>
        {head}
        <div className="d-edgebar"><span className={up ? "d-edgebar__up" : "d-edgebar__down"} style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }} /><i style={{ left: `${avg * 100}%` }} title="their average entry" />{last !== null ? <i className="d-edgebar__now" style={{ left: `${last * 100}%` }} title="now" /> : null}</div>
        <p className="b-small">Price history isn&apos;t available right now; their entry and the price now.</p>
        {foot}
      </div>
    );
  }
  const t0 = Math.min(edge.from, pts[0]!.t), t1 = edge.to;
  const ps = [...pts.map(p => p.p), avg, ...edge.entries.map(e => e.p)], lo = Math.max(0, Math.min(...ps) - 0.04), hi = Math.min(1, Math.max(...ps) + 0.04);
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - (p - lo) / Math.max(0.01, hi - lo)) * (H - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
  const firstIn = edge.entries[0]?.t ?? t1, after = pts.filter(p => p.t >= firstIn);
  const area = after.length > 1 ? `M${x(after[0]!.t).toFixed(1)},${y(avg).toFixed(1)}` + after.map(p => `L${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join("") + `L${x(after.at(-1)!.t).toFixed(1)},${y(avg).toFixed(1)}Z` : "";
  const maxD = Math.max(...edge.entries.map(e => e.dollars), 1);
  return (
    <div className="d-edge" data-testid="edge-chart" data-mode="chart" data-bet={edge.betId}>
      <div className="d-edge__title"><span title={edge.title}>{edge.title}</span><span className="d-side">{edge.outcome}</span></div>
      {head}
      <svg viewBox={`0 0 ${W} ${H}`} className="d-edge__svg" role="img" aria-label={`Price of ${edge.outcome}: millionaires in at an average ${c(avg)}, now ${c(last)}`}>
        {area ? <path d={area} className={up ? "d-area-up" : "d-area-down"} /> : null}
        <line x1={pad.l} x2={W - pad.r} y1={y(avg)} y2={y(avg)} className="d-avg" />
        <path d={line} className="d-line" />
        {edge.entries.map((e, i) => <circle key={i} cx={x(e.t)} cy={y(e.p)} r={3 + 6 * Math.sqrt(e.dollars / maxD)} className="d-entry"><title>{`${dollars(e.dollars)} at ${c(e.p)}, ${ET.format(new Date(e.t))} ET`}</title></circle>)}
        {last !== null ? <><circle cx={x(pts.at(-1)!.t)} cy={y(last)} r={3.5} className="d-nowdot" /><text x={W - pad.r + 6} y={y(last) + 4} className="d-nowlabel">{c(last)}</text></> : null}
        <text x={W - pad.r + 6} y={y(avg) + (last !== null && Math.abs(y(avg) - y(last)) < 14 ? (y(avg) >= y(last) ? 16 : -8) : 4)} className="d-avglabel">avg {c(avg)}</text>
        <text x={pad.l} y={H - 6} className="d-axis">{ETD.format(new Date(t0))} ET</text>
        <text x={W - pad.r} y={H - 6} className="d-axis" textAnchor="end">now</text>
      </svg>
      {foot}
    </div>
  );
}

/* ---------- The flow table ---------- */

function FlowRow({ b, now, sel, onPick, fresh, moved, copy }: { b: BoardBet; now: number; sel: boolean; onPick: (b: BoardBet) => void; fresh: boolean; moved: 1 | -1 | 0; copy: boolean }) {
  const d = b.priceNow !== null && b.priceThen !== null ? Math.round((b.priceNow - b.priceThen) * 100) : null;
  const gold = b.tier === "millionaire" && b.amount >= 50_000;
  return (
    <tr className={`d-row${sel ? " is-sel" : ""}${fresh ? " is-new" : ""}`} data-testid="bet-row" data-bet={b.id} aria-selected={sel} onClick={() => onPick(b)}
      tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(b); } }}>
      <td className="d-num d-dim">{ago(b.at, now)}</td>
      <td><span className="d-wallet">{b.wallet ? <WalletOrb address={b.wallet} tier={b.tier} size={24} /> : null}<span className="d-wallet__t"><span className="d-num">{b.short}</span>{b.pnl !== null ? <span className={`d-num ${b.tier === "millionaire" ? "d-gold" : "d-steel"}`}>{signed(b.pnl)}</span> : null}</span></span></td>
      <td className="d-mkt"><span className="d-mkt__in"><TeamMark title={b.title} category={b.category} outcome={b.outcome} size={26} /><span className="d-mkt__t" title={b.title}>{b.title}</span></span></td>
      <td>{b.outcome ? <span className={`d-side d-side--${b.side}`}>{b.outcome}</span> : null}</td>
      <td className={`d-num d-r${gold ? " d-gold" : ""}`}>{dollars(b.amount)}</td>
      <td className="d-num d-r">{c(b.priceThen)}</td>
      <td className={`d-num d-r${moved > 0 ? " d-flash-up" : moved < 0 ? " d-flash-down" : ""}`}>{c(b.priceNow)}</td>
      <td className={`d-num d-r ${d === null ? "" : d > 0 ? "d-up" : d < 0 ? "d-down" : "d-dim"}`}>{d === null ? "" : d === 0 ? "0¢" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}¢`}</td>
      <td className="d-r">{copy ? <a className="d-pill d-pill--white d-copy" href={`/copy/${encodeURIComponent(b.id)}`} onClick={e => e.stopPropagation()} data-testid="bet-copy" aria-label={`Copy: ${b.outcome ?? ""} in ${b.title}`}>Copy</a> : null}</td>
    </tr>
  );
}

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

export function LiveFlow({ initial, now: now0, cats = [], board = false, copy = true, initialEdge, chart = true, n = 30, aside }: {
  initial: BoardBet[]; now: number; cats?: readonly string[]; board?: boolean; copy?: boolean; initialEdge: Edge | null; chart?: boolean; n?: number; aside?: ReactNode;
}) {
  const [bets, setBets] = useState(initial);
  const [now, setNow] = useState(now0);
  const [sel, setSel] = useState<string | null>(initialEdge?.betId ?? null);
  const [edge, setEdge] = useState<Edge | null>(initialEdge);
  const [loading, setLoading] = useState(false);
  const seen = useRef(new Set(initial.map(b => b.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Map<string, 1 | -1>>(new Map());
  const pick = useCallback(async (b: BoardBet) => {
    if (!chart) return;
    setSel(b.id); setLoading(true);
    const r = await fetch(`/api/desk/edge?bet=${encodeURIComponent(b.id)}`, { cache: "no-store" }).catch(() => null);
    setEdge(r?.ok ? await r.json() as Edge : null); setLoading(false);
  }, [chart]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/millionaires/live?n=${n}${cats.length ? `&cats=${cats.join(",")}` : ""}${board ? "&board=1" : ""}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; bets: BoardBet[] };
      setBets(prev => {
        const before = new Map(prev.map(b => [b.id, b.priceNow])), mv = new Map<string, 1 | -1>(), fr = new Set<string>();
        for (const b of j.bets) {
          if (!seen.current.has(b.id)) { fr.add(b.id); seen.current.add(b.id); }
          const p = before.get(b.id);
          if (p != null && b.priceNow != null && p !== b.priceNow) mv.set(b.id, b.priceNow > p ? 1 : -1);
        }
        setFresh(fr); setMoved(mv); setTimeout(() => setMoved(new Map()), 600);
        return j.bets;
      });
      setNow(j.now);
    };
    const id = setInterval(tick, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, board, cats.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => bets, [bets]);
  const table = (
    <div className="d-panel d-flow" data-testid="live-flow">
      <div className="d-panel__h"><span>Live flow</span><span className="d-live"><i aria-hidden="true" />Live{chart ? <> · <a href="/board">Full board</a></> : null}</span></div>
      {rows.length ? (
        <div className="d-scroll">
          <table className="d-table">
            <thead><tr><th>Time</th><th>Wallet</th><th>Market</th><th>Side</th><th className="d-r">Size</th><th className="d-r">Entry</th><th className="d-r">Now</th><th className="d-r">Δ</th><th aria-label="Copy" /></tr></thead>
            <tbody>{rows.map(b => <FlowRow key={b.id} b={b} now={now} sel={sel === b.id} onPick={pick} fresh={fresh.has(b.id)} moved={moved.get(b.id) ?? 0} copy={copy} />)}</tbody>
          </table>
        </div>
      ) : <p className="b-empty">No millionaire bet in these categories yet today. They land here the second one is placed.</p>}
    </div>
  );
  if (!chart) return table;
  return (
    <div className="d-grid d-grid--top">
      <div className="d-col8">{table}</div>
      <div className="d-col4 d-stack">
        <div className="d-panel" data-testid="edge-panel"><div className="d-panel__h"><span>Edge</span><span className="b-small">{sel ? "Selected bet" : "Today's biggest"}</span></div><EdgeChart edge={edge} loading={loading} /></div>
        {aside}
      </div>
    </div>
  );
}

