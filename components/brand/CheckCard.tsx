"use client";
/* The check: first "Which side are you on?" (the market's two outcomes as pills), then the verdict leads, big, with one
 * line of evidence, then the details (`children`: Pro money, wallets, big bets, price, the analyst line), then
 * "Information, not advice." The pick is remembered per market (localStorage). `demo` picks the side with the most
 * millionaire money by itself once the card is on screen, so the landing shows the whole flow with a real market; its
 * verdict landing counts as the free check seen ("insidir:aha-done", for the pop-ups).
 * The verdict describes where the $1M+ wallets' money is; it is never advice (lib/brand/verdict.ts). */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { heavierSide, verdict, type Side, type VerdictInput } from "@/lib/brand/verdict";

const KEY = (k: string) => `insidir_side:${k}`;

export function CheckCard({ marketKey, title, label, money, demo = false, children, testid = "check-card", onVerdict, emit, showTitle = true }: {
  marketKey: string; title: string; label?: string; money: VerdictInput; demo?: boolean; children?: ReactNode; testid?: string; onVerdict?: () => void;
  /** An event to fire once the verdict shows ("insidir:read-done": a visitor's free check, for the pop-ups). */
  emit?: string;
  showTitle?: boolean;
}) {
  const [side, setSide] = useState<Side | null>(null);
  const [fresh, setFresh] = useState(false);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    if (demo) return;
    try { const s = localStorage.getItem(KEY(marketKey)); if (s === "yes" || s === "no") setSide(s); } catch { /* private mode */ }
  }, [marketKey, demo]);
  // The demo picks a side by itself once it has been on screen a moment.
  useEffect(() => {
    if (!demo || !box.current) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      t = setTimeout(() => pick(heavierSide(money)), 3000); // after the card has settled in and the question has been read
    }, { threshold: 0.5 });
    io.observe(box.current);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(s: Side) {
    setSide(s); setFresh(true);
    if (!demo) { try { localStorage.setItem(KEY(marketKey), s); } catch { /* private mode */ } }
    setTimeout(() => { onVerdict?.(); if (demo) window.dispatchEvent(new Event("insidir:aha-done")); if (emit) window.dispatchEvent(new Event(emit)); }, 900);
  }

  const v = side ? verdict(money, side) : null;
  const icon = v?.kind === "agree" ? "✓" : v?.kind === "against" ? "✕" : null;
  const tone = v?.kind === "agree" ? "var(--up)" : v?.kind === "against" ? "var(--down)" : "var(--ink)";
  const settle = (d: number): { className: string; style: CSSProperties } => ({ className: fresh ? "b-new" : "", style: { animationDelay: `${d}s` } });

  return (
    <article ref={box} className="b-read b-glass b-pad" data-testid={testid} data-side={side ?? ""} data-verdict={v?.kind ?? ""}>
      {showTitle ? (
        <div style={{ display: "grid", gap: 4 }}>
          {label ? <span className="b-label">{label}</span> : null}
          <h3 className="b-read__q">{title}</h3>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        <span className="b-label">Which side are you on?</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Your side">
          {(["yes", "no"] as const).map(s => (
            <button key={s} type="button" className="b-btn b-panel-pill b-side-pill" aria-pressed={side === s} onClick={() => pick(s)} data-testid={`pick-${s}`}>
              {s === "yes" ? money.yesLabel : money.noLabel}
            </button>
          ))}
        </div>
      </div>
      {v ? (
        <div style={{ display: "grid", gap: 8 }} data-testid="verdict">
          <p className={`b-verdict ${settle(0).className}`} style={{ color: tone }} data-testid="verdict-headline">{icon ? <span aria-hidden="true">{icon} </span> : null}{v.headline}</p>
          {v.evidence ? <p className={`b-evidence ${settle(0.15).className}`} style={settle(0.15).style} data-testid="verdict-evidence">{v.evidence}</p> : null}
        </div>
      ) : null}
      {v ? <div className={settle(0.3).className} style={{ ...settle(0.3).style, display: "grid", gap: 14 }}>{children}</div> : null}
      <p className="b-small" style={{ fontWeight: 400 }}>Information, not advice.</p>
    </article>
  );
}
