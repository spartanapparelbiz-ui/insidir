"use client";
/* The member home's terminal strip, sticky under the nav: LIVE, the last $1M+ bet's age, today's $1M+ money and bets,
 * and an ET clock with the time of the last refresh. Re-read every 10 seconds from /api/millionaires/live (the same
 * numbers as the board); a number that changes flashes once. Stops reading while the tab is hidden. Real numbers only:
 * a value the server didn't send isn't shown. */
import { useEffect, useRef, useState } from "react";
import { dollars } from "@/lib/money";
import type { Pulse } from "@/lib/millionaires/pulse-shape";

interface Initial { now: number; money: number; bets: number; window: "today" | "24h"; lastBetAt: number | null; polledAt: number | null }
const REFRESH_MS = 10_000;
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" });
const age = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };

export function LiveStrip({ initial }: { initial: Initial }) {
  const [v, setV] = useState(initial);
  const [clock, setClock] = useState(initial.now);
  const [ok, setOk] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const last = useRef(initial);

  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/millionaires/live?n=1&tier=all", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json() as { now: number; pulse: Pulse; bets: Array<{ at: number }> };
        const p = j.pulse.all, today = p.sinceMidnight > 0;
        const next: Initial = { now: j.now, money: today ? p.sinceMidnight : p.today, bets: today ? p.countToday : p.window === "day" ? p.count : last.current.bets,
          window: today ? "today" : "24h", lastBetAt: j.bets[0]?.at ?? last.current.lastBetAt, polledAt: j.now };
        if (next.money !== last.current.money) setFlash("money"); else if (next.lastBetAt !== last.current.lastBetAt) setFlash("last");
        last.current = next; setV(next); setOk(true);
      } catch { setOk(false); }
    };
    const poll = setInterval(read, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(tick); clearInterval(poll); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 900); return () => clearTimeout(t); }, [flash]);

  return (
    <div className="hm-live" role="status" aria-live="off" data-testid="live-strip">
      <span className={`hm-live__k${ok ? "" : " hm-live__k--off"}`}><span className="hm-live__dot" aria-hidden="true" />{ok ? "LIVE" : "RECONNECTING"}</span>
      {v.lastBetAt ? <span className={flash === "last" ? "hm-flash" : undefined}>Last big-wallet bet <b className="b-num">{age(clock - v.lastBetAt)}</b> ago</span> : null}
      {v.money > 0 ? <span className={flash === "money" ? "hm-flash" : undefined}><b className="b-num">{dollars(v.money)}</b> from $100K+ wallets {v.window === "today" ? "today" : "in 24h"}</span> : null}
      {v.bets > 0 ? <span><b className="b-num">{v.bets.toLocaleString("en-US")}</b> {v.bets === 1 ? "bet" : "bets"}</span> : null}
      <span className="hm-live__clock b-num">{ET.format(new Date(clock))} ET</span>
    </div>
  );
}
