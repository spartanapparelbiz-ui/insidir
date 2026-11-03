"use client";
/* The free check, inline on the landing: paste a bet (or tap a chip), pick your side, the verdict with its evidence,
 * then Pro money and the price now (the better price is free in every check). One free check per visitor (the API's
 * rule: the next one opens the paywall). Fires "insidir:free-used" once the verdict shows. */
import { useState } from "react";
import { dollars } from "@/lib/money";
import type { SidePrices } from "@/lib/read/types";
import { AskBox, type Chip } from "./AskBox";
import { cents } from "./Bits";
import { CheckCard } from "./CheckCard";

interface Check {
  id: string; question: string; key: string; yesLabel: string; noLabel: string;
  millionaire: { yes: { dollars: number; wallets: number }; no: { dollars: number; wallets: number } };
  pro: { yes: { dollars: number; wallets: number }; no: { dollars: number; wallets: number } };
  topPnl: { yes: number | null; no: number | null };
  prices: { yes: SidePrices; no: SidePrices }; us: boolean;
}

const row = { display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid var(--glass-line)" } as const;

export function InlineCheck({ chips }: { chips: Chip[] }) {
  const [c, setC] = useState<Check | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (id: string) => {
    setErr(null); setBusy(true); setC(null);
    const r = await fetch(`/api/check/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setC(await r.json()); else setErr("That check didn't load. Try again in a minute.");
    setBusy(false);
  };
  /** One outcome's price on each venue that lists it ("Kalshi 41¢ · Polymarket 43¢ best"); never a dash. */
  const prices = (s: SidePrices): string => {
    const vs = (c?.us ? ["kalshi"] : ["kalshi", "polymarket"]) as Array<"kalshi" | "polymarket">;
    const parts = vs.filter(v => s[v] !== null).map(v => `${v === "kalshi" ? "Kalshi" : "Polymarket"} ${cents(s[v]!)}${s.best === v && !c?.us && vs.filter(x => s[x] !== null).length > 1 ? " best" : ""}`);
    return parts.length ? parts.join(" · ") : "No price now";
  };
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="inline-check">
      <AskBox chips={chips} onResolved={id => void load(id)} settle={false} id="free-ask" placeholder="Paste a bet or a link" />
      {err ? <p className="b-msg" role="alert">{err}</p> : null}
      {busy ? <CheckSkeleton /> : null}
      {c ? (
        <CheckCard key={c.id} marketKey={c.key} title={c.question} money={{ yes: c.millionaire.yes, no: c.millionaire.no, yesLabel: c.yesLabel, noLabel: c.noLabel, topPnl: c.topPnl }}
          emit="insidir:free-used" testid="free-check">
          <div style={row}>
            <span className="b-label">Pro money</span>
            <span className="b-small" style={{ color: "var(--ink-muted)" }}>{c.pro.yes.dollars + c.pro.no.dollars ? ([[c.pro.yes.dollars, c.yesLabel], [c.pro.no.dollars, c.noLabel]] as const).filter(([v]) => v > 0).map(([v, l]) => `${dollars(v)} on ${l}`).join(" · ") : "None yet"}</span>
          </div>
          <div style={row} data-testid="free-check-price">
            <span className="b-label">Price now · {c.us ? "Kalshi (US)" : "Kalshi / Polymarket"}</span>
            {c.us && c.prices.yes.kalshi === null && c.prices.no.kalshi === null ? <span className="b-small">Not on Kalshi. In the US we show Kalshi only.</span> : ([["yes", c.yesLabel], ["no", c.noLabel]] as const).map(([k, l]) => (
              <div key={k} className="b-kv"><span style={{ fontWeight: 500 }}>{l}</span><span className="b-num">{prices(c.prices[k])}</span></div>
            ))}
          </div>
          <a className="b-btn b-panel-pill" style={{ justifySelf: "start" }} href={`/read/${c.id}`}>Open the full check</a>
        </CheckCard>
      ) : null}
    </div>
  );
}

/** The check's shape while it loads: the question, the verdict line and two side cells, static (no shimmer). */
export function CheckSkeleton() {
  return (
    <div className="b-glass b-pad b-skel" aria-busy="true" aria-label="Loading the check" data-testid="check-skeleton">
      <span className="b-skel__line" style={{ width: "72%" }} /><span className="b-skel__line" style={{ width: "48%", height: 22 }} />
      <div className="b-split"><div><span className="b-skel__line" /><span className="b-skel__line" style={{ height: 26 }} /></div><div><span className="b-skel__line" /><span className="b-skel__line" style={{ height: 26 }} /></div></div>
    </div>
  );
}
