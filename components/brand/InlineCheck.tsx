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
  const load = async (id: string) => {
    setErr(null);
    const r = await fetch(`/api/check/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setC(await r.json()); else setErr("Something went wrong. Try again in a minute.");
  };
  const price = (s: SidePrices, v: "kalshi" | "polymarket") => s[v] === null ? "–" : `${cents(s[v])}${s.best === v && !c?.us ? " · best" : ""}`;
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="inline-check">
      <AskBox chips={chips} onResolved={id => void load(id)} settle={false} id="free-ask" placeholder="Paste a bet or a link" />
      {err ? <p className="b-msg" role="alert">{err}</p> : null}
      {c ? (
        <CheckCard key={c.id} marketKey={c.key} title={c.question} money={{ yes: c.millionaire.yes, no: c.millionaire.no, yesLabel: c.yesLabel, noLabel: c.noLabel, topPnl: c.topPnl }}
          emit="insidir:free-used" testid="free-check">
          <div style={row}>
            <span className="b-label">Pro money</span>
            <span className="b-small" style={{ color: "var(--ink-muted)" }}>{c.pro.yes.dollars + c.pro.no.dollars ? `${dollars(c.pro.yes.dollars)} on ${c.yesLabel} · ${dollars(c.pro.no.dollars)} on ${c.noLabel}` : "None yet"}</span>
          </div>
          <div style={row} data-testid="free-check-price">
            <span className="b-label">Price now · {c.us ? "Kalshi (US)" : "Kalshi / Polymarket"}</span>
            {c.us && c.prices.yes.kalshi === null && c.prices.no.kalshi === null ? <span className="b-small">Not on Kalshi. In the US we show Kalshi only.</span> : ([["yes", c.yesLabel], ["no", c.noLabel]] as const).map(([k, l]) => (
              <div key={k} className="b-kv"><span style={{ fontWeight: 500 }}>{l}</span><span className="b-num">{price(c.prices[k], "kalshi")}{c.us ? "" : ` / ${price(c.prices[k], "polymarket")}`}</span></div>
            ))}
          </div>
          <a className="b-btn b-panel-pill" style={{ justifySelf: "start" }} href={`/read/${c.id}`}>Open the full check</a>
        </CheckCard>
      ) : null}
    </div>
  );
}
