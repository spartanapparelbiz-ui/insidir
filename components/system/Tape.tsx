"use client";
/* The tape (lib/tape.ts): every big move, newest first, re-read every 10 seconds. Filters: everything, new bets from the
 * $100K+ wallets, exits and trims, big trades from any wallet, Kalshi. Each row: when, what kind, who (tier, short
 * address, all-time profit, record), the market, the size, and for members the side at its price; under it, the big
 * money in that market. A new row flashes once. Visitors: 60 minutes late, sides locked. Information, not advice. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { TapeKind, TapeRow } from "@/lib/tape";
import { dollars } from "@/lib/money";

const FILTERS: Array<[string, readonly TapeKind[] | null]> = [["Everything", null], ["New bets", ["bet"]], ["Exits", ["trim", "exit"]], ["Any-wallet whales", ["whale"]], ["Kalshi", ["kalshi"]]];
const KIND: Record<TapeKind, string> = { bet: "BET", trim: "TRIM", exit: "EXIT", whale: "WHALE", kalshi: "KALSHI" };
const cents = (p: number) => `${Math.round(p * 100)}¢`;
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const tierName = (t: TapeRow["tier"]) => (t === "millionaire" ? "$1M+" : t === "pro" ? "$100K+" : t === "whale" ? "Whale" : "Kalshi");

function who(r: TapeRow): string {
  if (r.kind === "kalshi") return "Anonymous (Kalshi)";
  const bits = [r.short ?? ""];
  if (r.pnl !== null) bits.push(`${r.pnl >= 0 ? "+" : "−"}${dollars(Math.abs(r.pnl))} all-time`);
  if (r.record && r.record.won + r.record.lost > 0) bits.push(`${r.record.won}–${r.record.lost}`);
  if (r.newWallet) bits.push("new wallet");
  return bits.filter(Boolean).join(" · ");
}

function info(r: TapeRow, member: boolean): string | null {
  const m = r.market;
  if (!m || m.total <= 0) return null;
  const base = `Big money here (7 days): ${dollars(m.total)} from ${m.wallets} ${m.wallets === 1 ? "wallet" : "wallets"} up $100K+`;
  if (!member || m.yes === null || m.no === null) return `${base}.`;
  return `${base}: ${dollars(m.yes)} on Yes, ${dollars(m.no)} on No.`;
}

export function Tape({ initial, now: now0, member, n = 40, testid = "tape" }: { initial: TapeRow[]; now: number; member: boolean; n?: number; testid?: string }) {
  const [rows, setRows] = useState(initial);
  const [now, setNow] = useState(now0);
  const [filter, setFilter] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef(new Set(initial.map(r => r.id)));
  const kinds = FILTERS[filter]![1];

  useEffect(() => {
    let stop = false;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/tape?n=${n}${kinds ? `&kinds=${kinds.join(",")}` : ""}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const j = await r.json() as { now: number; rows: TapeRow[] };
      setFresh(new Set(j.rows.filter(x => !seen.current.has(x.id)).map(x => x.id)));
      for (const x of j.rows) seen.current.add(x.id);
      setRows(j.rows); setNow(j.now);
    };
    if (filter !== 0) void read();
    const id = setInterval(read, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (kinds ? rows.filter(r => kinds.includes(r.kind)) : rows), [rows, kinds]);
  return (
    <div className="tp" data-testid={testid}>
      <div className="tp__bar" role="group" aria-label="What the tape shows">
        {FILTERS.map(([t], i) => <button key={t} type="button" className="b-btn b-panel-pill" aria-pressed={filter === i} onClick={() => setFilter(i)}>{t}</button>)}
        <span className="tp__live"><span className="tp__dot" aria-hidden="true" />{member ? "Live" : "60 min late"} · every 10s</span>
      </div>
      {shown.length ? (
        <ol className="tp__rows">
          {shown.map(r => {
            const line = info(r, member);
            const body = (
              <>
                <span className="tp__t b-num">{ago(now - r.at)}</span>
                <span className={`tp__k tp__k--${r.kind}`}>{KIND[r.kind]}</span>
                <span className="tp__main">
                  <span className="tp__m">{r.title}</span>
                  <span className="tp__who"><span className={`tp__tier tp__tier--${r.tier ?? "kalshi"}`}>{tierName(r.tier)}</span>{who(r)}</span>
                  {line ? <span className="tp__info">{line}</span> : null}
                </span>
                <span className="tp__right">
                  <b className="tp__amt b-num">{dollars(r.amount)}</b>
                  {member && r.outcome ? <span className="tp__side">{r.kind === "exit" || r.kind === "trim" ? "sold " : ""}{r.outcome}{r.price !== null ? ` @ ${cents(r.price)}` : ""}</span>
                    : <span className="tp__side tp__side--locked" data-locked="side">Side: members</span>}
                </span>
              </>
            );
            return (
              <li key={r.id} className={fresh.has(r.id) ? "tp__row tp__row--new" : "tp__row"} data-kind={r.kind} data-testid="tape-row">
                {r.href ? <a href={r.href}>{body}</a> : <div>{body}</div>}
              </li>
            );
          })}
        </ol>
      ) : <p className="b-empty">Nothing on the tape {kinds ? "of this kind " : ""}in the last 24 hours yet. The next one shows here as it lands.</p>}
      <p className="b-small tp__src">Source: Polymarket and Kalshi public trades, Polygon. Whales are any Polymarket wallet trading $10K+; Kalshi trades are anonymous. Information, not advice.</p>
    </div>
  );
}
