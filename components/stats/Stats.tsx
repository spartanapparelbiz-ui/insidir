/* The pieces every data page uses: stat tiles (a big number, a small grey label under it, nothing else), breakdown
 * tables (no vertical lines, 56px rows, numbers right), a leaderboard and the day × hour heatmap. Anything built on
 * fewer than 20 settled moves says "Not enough data yet" (lib/stats.ts). Server components. */
import Link from "next/link";
import type { ReactNode } from "react";
import { dollars } from "@/lib/moves/copy";
import { walletLabel } from "@/lib/moves/records";
import { MIN_SETTLED, NOT_ENOUGH, WEEKDAYS, type Leader, type Perf, type Row } from "@/lib/stats";

/* ---------- formatting ---------- */

export const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const pts = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts`);
export const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${dollars(Math.abs(v))}`);
/** A price as the chance it stands for: 0.62 → "62%". */
export const cents = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
export const tone = (v: number | null): "money" | "loss" | undefined => (v === null || v === 0 ? undefined : v > 0 ? "money" : "loss");

/* ---------- tiles ---------- */

/** A tile: the value, the label under it and, when there's nothing to show yet, a grey "—" with why in a note. */
export interface Tile { label: string; value: ReactNode; tone?: "money" | "loss"; note?: string }

/** The gated form of a tile's value: the value when there's enough data, else "—" and "Not enough data yet". */
export const gatedTile = (value: ReactNode, ok: boolean): Pick<Tile, "value" | "note"> => (ok ? { value } : { value: "—", note: NOT_ENOUGH });

export function Tiles({ tiles, cols = 4, label }: { tiles: Tile[]; cols?: 3 | 4 | 5; label?: string }) {
  return (
    <dl className={`tiles tiles--${cols}`} aria-label={label}>
      {tiles.map(t => (
        <div key={t.label} className="tile">
          <dd className={t.value === "—" ? "tile__nil" : t.tone}>{t.value}</dd>
          <dt>{t.label}</dt>
          {t.note ? <dd className="tile__note">{t.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Win rate, edge, net, ROI, $100 each, W–L, from a Perf; every rate gated at 20 settled. */
export function perfTiles(p: Perf): Tile[] {
  const ok = p.winRate !== null;
  return [
    { label: "Record", value: `${p.won.toLocaleString("en-US")}–${p.lost.toLocaleString("en-US")}` },
    { label: "Win rate", ...gatedTile(pct(p.winRate), ok), tone: ok && p.winRate! >= 0.5 ? "money" : ok ? "loss" : undefined },
    { label: "Average entry", ...gatedTile(cents(p.avgPrice), ok) },
    { label: "Edge vs. entry", ...gatedTile(pts(p.edge), ok), tone: ok ? tone(p.edge) : undefined },
    { label: "Net P&L", ...gatedTile(signed(p.net), ok), tone: ok ? tone(p.net) : undefined },
    { label: "ROI", ...gatedTile(pct(p.roi, 1), ok), tone: ok ? tone(p.roi) : undefined },
  ];
}

/* ---------- tables ---------- */

export function Table({ head, rows, label, numeric = [] }: { head: string[]; rows: ReactNode[][]; label: string; numeric?: number[] }) {
  return (
    <div className="dtable__wrap">
      <table className="dtable" aria-label={label}>
        <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={numeric.includes(i) ? "r" : undefined}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className={numeric.includes(j) ? "r" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** A breakdown: per row the settled count, W–L, win rate, edge, net and ROI (rates gated per row). */
export function BreakdownTable({ rows, label, first }: { rows: Row[]; label: string; first: string }) {
  if (!rows.length) return <p className="dnote">{NOT_ENOUGH}</p>;
  return (
    <Table label={label} head={[first, "Settled", "W–L", "Win rate", "Edge", "Net P&L", "ROI"]} numeric={[1, 2, 3, 4, 5, 6]}
      rows={rows.map(r => {
        const ok = r.perf.winRate !== null;
        return [r.key, r.moves.toLocaleString("en-US"), `${r.perf.won}–${r.perf.lost}`, ok ? pct(r.perf.winRate) : "—",
          ok ? <span className={tone(r.perf.edge)}>{pts(r.perf.edge)}</span> : "—", ok ? <span className={tone(r.perf.net)}>{signed(r.perf.net)}</span> : "—",
          ok ? <span className={tone(r.perf.roi)}>{pct(r.perf.roi, 1)}</span> : "—"];
      })} />
  );
}

export function Leaderboard({ leaders, label }: { leaders: Leader[]; label: string }) {
  if (!leaders.length) return <p className="dnote">{NOT_ENOUGH}</p>;
  return (
    <Table label={label} head={["Trader", "Settled", "W–L", "Win rate", "Net P&L"]} numeric={[1, 2, 3, 4]}
      rows={leaders.map(l => [
        <Link key="n" className="dtable__link" href={`/p/${l.wallet}`}>{walletLabel(l.wallet, l.name)}</Link>,
        l.moves.toLocaleString("en-US"), `${l.perf.won}–${l.perf.lost}`,
        l.perf.winRate !== null ? pct(l.perf.winRate) : <span className="tile__na">Under {MIN_SETTLED} settled</span>,
        l.perf.net !== null ? <span className={tone(l.perf.net)}>{signed(l.perf.net)}</span> : "—",
      ])} />
  );
}

/** Moves by weekday × hour (New York): darker is more. */
export function Heatmap({ grid, label }: { grid: number[][]; label: string }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="heat" role="img" aria-label={label}>
      <div className="heat__grid">
        {grid.map((row, d) => (
          <div key={d} className="heat__row">
            <span className="heat__day">{WEEKDAYS[d]}</span>
            {row.map((n, h) => <span key={h} className="heat__cell" style={{ ["--a" as string]: n ? 0.12 + 0.88 * (n / max) : 0 }} title={`${WEEKDAYS[d]} ${h}:00 ET · ${n} ${n === 1 ? "move" : "moves"}`} />)}
          </div>
        ))}
        <div className="heat__row heat__row--hours" aria-hidden="true"><span className="heat__day" />{[0, 6, 12, 18].map(h => <span key={h} className="heat__hour" style={{ gridColumn: `${h + 2} / span 6` }}>{h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}</span>)}</div>
      </div>
    </div>
  );
}

export function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="dsec" aria-labelledby={id}>
      <h2 id={id} className="dsec__h">{title}</h2>
      {note ? <p className="dsec__note">{note}</p> : null}
      {children}
    </section>
  );
}
