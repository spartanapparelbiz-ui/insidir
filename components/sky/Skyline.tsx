"use client";
/* The money skyline in the hero (and, shorter, on the dashboard): the static SVG first (components/sky/SkylineSvg.tsx),
 * then, after first paint and only with WebGL and without prefers-reduced-motion, the 3D scene
 * (components/sky/SkylineScene.ts, three loaded on demand). New bets are polled every 20s and rise in place. Hover or
 * tap a bar: the real bet in a tooltip, and "Read this market →". */
import { useEffect, useRef, useState } from "react";
import { ReadPick } from "@/components/read/ReadPick";
import { betLine, type SkyBet } from "@/lib/sky/sky-pure";
import { SkylineSvg } from "./SkylineSvg";

const POLL_MS = 20_000;

function webgl(): boolean {
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") ?? c.getContext("webgl")); } catch { return false; }
}

export function Skyline({ bets: initial, height = 560, phoneHeight = 360, cats, compact = false, testid = "skyline" }: {
  bets: SkyBet[]; height?: number; phoneHeight?: number; cats?: readonly string[]; compact?: boolean; testid?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [bets, setBets] = useState(initial);
  const [three, setThree] = useState(false);
  const [tip, setTip] = useState<{ bet: SkyBet; x: number; y: number } | null>(null);
  const handle = useRef<{ update(b: SkyBet[]): void; destroy(): void } | null>(null);

  // The 3D scene, after first paint.
  useEffect(() => {
    if (!initial.length || matchMedia("(prefers-reduced-motion: reduce)").matches || !webgl()) return;
    let gone = false;
    const start = () => import("./SkylineScene").then(({ mountSkyline }) => {
      if (gone || !box.current) return;
      handle.current = mountSkyline(box.current, initial, { compact, onPick: (bet, x, y) => setTip(bet ? { bet, x, y } : null) });
      setThree(true);
    }).catch(() => undefined);
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => void start(), { timeout: 1500 }) : window.setTimeout(() => void start(), 300);
    return () => { gone = true; if (!idle) clearTimeout(id); handle.current?.destroy(); handle.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // New bets every 20s.
  useEffect(() => {
    const q = cats?.length ? `?cats=${cats.join(",")}` : "";
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/skyline${q}`).then(x => (x.ok ? x.json() : null)).catch(() => null) as { bets: SkyBet[] } | null;
      if (r?.bets?.length) { setBets(r.bets); handle.current?.update(r.bets); }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [cats]);

  if (!initial.length) return null;
  return (
    <div className={`sk-sky${compact ? " sk-sky--compact" : ""}`} style={{ ["--sky-h" as string]: `${height}px`, ["--sky-hp" as string]: `${phoneHeight}px` }} data-testid={testid} data-three={three ? "on" : "off"}>
      <div ref={box} className="sk-sky__gl" aria-hidden={!three} />
      {three ? null : <SkylineSvg bets={bets} height={height} />}
      {tip ? (
        <div className="sk-tip" role="status" style={{ left: Math.min(tip.x, (box.current?.clientWidth ?? 400) - 260), top: Math.max(8, tip.y - 96) }} data-testid="sky-tip">
          <p className="sk-tip__t sk-num">{betLine(tip.bet, Date.now())}</p>
          <ReadPick venue={tip.bet.venue} id={tip.bet.marketId} className="sk-tip__go">Read this market →</ReadPick>
        </div>
      ) : null}
    </div>
  );
}
