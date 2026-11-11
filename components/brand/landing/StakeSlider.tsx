"use client";
/* Your stake: a slider from $10 to $500 a bet over the best real followable record (30+ settled, each bought at the
 * price Insidir showed plus a point of slippage, held to the end). It scales that record and nothing else. */
import { useId, useState } from "react";
import type { StakeRecord } from "@/lib/brand/pulse";
import { dollars } from "@/lib/money";
import { PAST } from "@/lib/brand/copy";

const money = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

export function StakeSlider({ r }: { r: StakeRecord }) {
  const [stake, setStake] = useState(100);
  const id = useId();
  const k = stake / r.stake, inn = r.n * stake, net = r.net * k;
  return (
    <div className="b-glass b-pad" style={{ maxWidth: "min(100%, calc(720 * var(--u)))", margin: "0 auto", display: "grid", gap: 16 }} data-testid="stake">
      <label htmlFor={id} className="b-kv" style={{ alignItems: "center" }}>
        <span style={{ fontWeight: 500, fontSize: 17 }}>Per trade</span>
        <span className="b-dmid b-num" data-testid="stake-value">${stake}</span>
      </label>
      <input id={id} className="b-range" type="range" min={10} max={500} step={10} value={stake} onChange={e => setStake(Number(e.target.value))}
        aria-valuetext={`$${stake} a bet`} data-testid="stake-range" style={{ "--v": `${((stake - 10) / 490) * 100}%` } as React.CSSProperties} />
      <div className="b-split">
        <div><span className="b-label">Put in</span><span className="b-big b-num" data-testid="stake-in">${inn.toLocaleString("en-US")}</span><span className="b-small">{r.n} settled bets</span></div>
        <div><span className="b-label">Would have made</span><span className={`b-big b-num ${net >= 0 ? "b-up" : "b-down"}`} data-testid="stake-net">{money(net)}</span><span className="b-small">{Math.round(r.roi * 100)}% return · {r.won} won, {r.lost} lost</span></div>
      </div>
      <p className="b-small" style={{ margin: 0 }}>Following the best real record on Insidir: every trade it made at {dollars(stake)} each, bought at the price Insidir showed plus a point of slippage, held until it settled. {PAST}</p>
    </div>
  );
}
