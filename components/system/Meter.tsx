/* The disagreement meter: where the millionaire money sits against what the price says, on one 0–100 scale, with the
 * money behind it. Both bars grow from 0 as their stage enters. */
import type { Disagreement } from "@/lib/brand/pulse";
import { dollars } from "@/lib/money";

export function Meter({ d }: { d: Disagreement }) {
  const share = Math.round(d.share * 100), price = Math.round(d.price * 100);
  return (
    <div className="s-meterbox" data-testid="disagree-meter" role="img" aria-label={`${share}% of the millionaire money on ${d.outcome}; the price says ${price}¢`}>
      <div className="s-meterrow"><span className="b-label">Millionaire money</span><span className="s-meterbar"><span className="s-grow s-gold" style={{ transform: `scaleX(${d.share})` }} /></span><b className="b-num">{share}%</b></div>
      <div className="s-meterrow"><span className="b-label">The price</span><span className="s-meterbar"><span className="s-grow" style={{ transform: `scaleX(${d.price})` }} /></span><b className="b-num">{price}¢</b></div>
      <p className="b-small">{dollars(d.dollars)} from {d.wallets} millionaire {d.wallets === 1 ? "wallet" : "wallets"} on {d.outcome}.</p>
    </div>
  );
}
