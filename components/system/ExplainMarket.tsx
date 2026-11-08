"use client";
/* "Explain this market" (members, a market's page): one tap, a few plain sentences on what Insidir's data shows here,
 * written from that data only (app/api/explain, lib/analyst/market.ts). It explains; it never recommends. */
import { useState } from "react";

export function ExplainMarket({ marketId }: { marketId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const go = async () => {
    setState("busy");
    const r = await fetch(`/api/explain?m=${encodeURIComponent(marketId)}`).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (r?.ok && j?.text) { setText(j.text); setState("done"); } else { setText(j?.error ?? "Couldn't explain it right now. Try again."); setState("error"); }
  };
  return (
    <div className="s-explain" data-testid="explain">
      {state === "done" ? (
        <>
          <p className="s-explain__label"><span className="s-explain__spark" aria-hidden="true">✦</span> What the data shows</p>
          <p className="s-explain__text" data-testid="explain-text">{text}</p>
          <p className="b-small">Written from Insidir&apos;s data on this market only. Information, not advice: it never says what to bet.</p>
        </>
      ) : (
        <>
          <button type="button" className="s-explain__btn" onClick={go} disabled={state === "busy"} data-testid="explain-btn">
            <span className="s-explain__spark" aria-hidden="true">✦</span>{state === "busy" ? "Reading the data…" : "Explain this market"}
          </button>
          {state === "error" ? <p className="b-small" role="status">{text}</p> : null}
        </>
      )}
    </div>
  );
}
