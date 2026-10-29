"use client";
/* First-visit tips on the Terminal: three short notes pinned to the column headings (the safety badge, profit after
 * fees, per day), one at a time. "Got it" dismisses them for good on this device. Never shown when there's no table. */
import { useEffect, useState } from "react";

const KEY = "insidir_tips_done";
const TIPS: Array<{ col: string; text: string }> = [
  { col: "rules", text: "Same rules means both apps settle this the same way. Check rules: read both. Skip: both sides could lose." },
  { col: "profit", text: "Net P&L after fees is what's left of $1 per set after you buy both sides and pay both apps' fees." },
  { col: "perday", text: "Per day spreads that net P&L over the days until it pays out, so quick deals rank higher." },
];

export function TerminalTips() {
  const [step, setStep] = useState<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) !== "1") setStep(0); } catch { /* storage off: skip the tips */ }
  }, []);
  useEffect(() => {
    if (step === null) return;
    const place = () => {
      const th = document.querySelector<HTMLElement>(`.dt th[data-tip="${TIPS[step]!.col}"]`);
      const box = th?.closest("[data-term-box]")?.getBoundingClientRect();
      const r = th?.getBoundingClientRect();
      if (!th || !r || !box || r.width === 0) { setPos(null); return; }
      setPos({ top: r.bottom - box.top + 8, left: Math.max(0, Math.min(r.left - box.left, box.width - 288)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step]);
  if (step === null || !pos) return null;
  const done = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setStep(null); };
  const last = step === TIPS.length - 1;
  return (
    <div className="ttip" role="dialog" aria-label="Tip" style={{ top: pos.top, left: pos.left }}>
      <p>{TIPS[step]!.text}</p>
      <div className="ttip__row">
        <span className="ttip__step">{step + 1} of {TIPS.length}</span>
        <span className="row-gap">
          {!last ? <button type="button" className="btn btn--ghost" style={{ background: "transparent", color: "inherit" }} onClick={done}>Skip</button> : null}
          <button type="button" className="btn" onClick={() => (last ? done() : setStep(step + 1))}>{last ? "Got it" : "Next"}</button>
        </span>
      </div>
    </div>
  );
}
