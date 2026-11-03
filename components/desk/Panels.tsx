"use client";
/* Your desk (pings on this device with a toggle; the wallets you follow, or, following none, today's three most active
 * millionaire wallets with one-tap Follow that also turns pings on; your logged copies: open, and the average move in
 * cents since you copied) and the "Millionaires active today" leaderboard (orb, address, all-time profit, $ today,
 * bets today, biggest position today, Follow). Only fields we actually have; never a name. */
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "@/components/app/push";
import type { Leader, YourDesk as Desk } from "@/lib/desk/data";
import { dollars } from "@/lib/money";
import { TeamMark, WalletOrb } from "./Marks";
import { vapidKey } from "./PingsPill";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function usePush() {
  const [st, setSt] = useState<PushState | "error" | null>(null);
  useEffect(() => {
    const read = () => pushState().then(setSt).catch(() => setSt("unsupported"));
    read(); window.addEventListener("insidir:push", read);
    return () => window.removeEventListener("insidir:push", read);
  }, []);
  const set = async (on: boolean) => {
    const k = on ? await vapidKey() : null;
    const next = on ? (k ? await enablePush(k).catch(() => "error" as const) : "error" as const) : await disablePush().catch(() => "error" as const);
    setSt(next); window.dispatchEvent(new Event("insidir:push"));
    return next;
  };
  return [st, set] as const;
}

function FollowBtn({ wallet, initial, pings }: { wallet: string; initial: boolean; pings?: () => Promise<unknown> }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const tap = async () => {
    setBusy(true);
    const r = await fetch("/api/follows", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "trader", target: wallet }) }).catch(() => null);
    if (r?.ok) { setOn(!on); if (!on && pings) await pings(); }
    setBusy(false);
  };
  return <button type="button" className={`d-pill${on ? "" : " d-pill--line"}`} aria-pressed={on} onClick={tap} disabled={busy} data-testid="desk-follow">{on ? "Following" : "Follow"}</button>;
}

export function YourDesk({ desk, suggest }: { desk: Desk; suggest: Leader[] }) {
  const [st, setPush] = usePush();
  const on = st === "on";
  const c = desk.copies;
  return (
    <section className="d-panel" data-testid="your-desk">
      <div className="d-panel__h"><span>Your desk</span></div>
      <ul className="d-desk">
        <li>
          <span className="d-desk__l">Pings on this device</span>
          {st === null ? <span className="d-dim">…</span> : st === "unsupported" ? <span className="b-small">Not on this browser</span>
            : <button type="button" role="switch" aria-checked={on} className={`d-switch${on ? " is-on" : ""}`} onClick={() => setPush(!on)} aria-label="Pings on this device" data-testid="desk-pings" />}
        </li>
        <li>
          <span className="d-desk__l">Following</span>
          <a className={desk.following ? "d-num" : undefined} href="/wallets">{desk.following ? plural(desk.following, "wallet") : "Not following anyone yet"}</a>
        </li>
        {desk.following === 0 && suggest.length ? (
          <li className="d-desk__sug">
            <span className="b-small">Most active millionaire wallets today. Follow and we ping you when they bet.</span>
            <ul>{suggest.slice(0, 3).map(l => (
              <li key={l.wallet}><WalletOrb address={l.wallet} tier="millionaire" size={22} /><span className="d-num">{l.short}</span>{l.pnl !== null ? <span className="d-num d-gold">{signed(l.pnl)}</span> : null}
                <FollowBtn wallet={l.wallet} initial={l.followed} pings={on ? undefined : () => setPush(true)} /></li>
            ))}</ul>
          </li>
        ) : null}
        <li>
          <span className="d-desk__l">Your copies</span>
          <a href="/copies/yours" className="d-num">{c.open ? plural(c.open, "open") : c.settled ? `${plural(c.settled, "settled")}` : "Copy a bet to track it"}
            {c.open && c.centsSince !== null ? <b className={c.centsSince > 0 ? "d-up" : c.centsSince < 0 ? "d-down" : "d-dim"}> {c.centsSince > 0 ? "+" : c.centsSince < 0 ? "−" : ""}{Math.abs(c.centsSince)}¢ since copying</b> : null}</a>
        </li>
      </ul>
    </section>
  );
}

export function Leaders({ list, full = false }: { list: Leader[]; full?: boolean }) {
  if (!list.length) return null;
  return (
    <section className="d-panel" data-testid="desk-leaders">
      <div className="d-panel__h"><span>Millionaires active today</span>{full ? null : <a className="b-small" href="/wallets">All wallets</a>}</div>
      <div className="d-scroll">
        <table className="d-table d-table--lead">
          <thead><tr><th>Wallet</th><th className="d-r">All-time</th><th className="d-r">Today</th><th className="d-r">Bets</th><th>Biggest today</th><th aria-label="Follow" /></tr></thead>
          <tbody>{list.map(l => (
            <tr key={l.wallet} className="d-row" data-testid="leader-row">
              <td><span className="d-wallet"><WalletOrb address={l.wallet} tier="millionaire" size={24} /><span className="d-num">{l.short}</span></span></td>
              <td className="d-num d-r d-gold">{l.pnl !== null ? signed(l.pnl) : ""}</td>
              <td className="d-num d-r">{dollars(l.todayDollars)}</td>
              <td className="d-num d-r">{l.todayBets}</td>
              <td className="d-mkt">{l.biggest ? <span className="d-mkt__in"><TeamMark title={l.biggest.title} category={l.biggest.category} size={22} /><span className="d-mkt__t" title={l.biggest.title}>{l.biggest.title}</span><span className="d-num d-dim">{dollars(l.biggest.dollars)}</span></span> : null}</td>
              <td className="d-r"><FollowBtn wallet={l.wallet} initial={l.followed} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
