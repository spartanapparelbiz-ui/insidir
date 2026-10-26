"use client";
/* "Show me how": the deal as three steps, for an amount the user types at the top. Every step's number updates as
 * they type (lib/simple.ts howTo: whole shares, the same count on every side, so one side always pays back).
 *
 *   1. Open Kalshi and buy YES on Chiefs vs Bills. Spend $55.        [Open Kalshi]
 *   2. Open Polymarket and buy NO on the same game. Spend $40.       [Open Polymarket]
 *   3. Done. When it ends, one side pays you $100. You keep about $4.60.
 *
 * Free viewers don't get the deal's size, so their steps can't be capped; a line says so. */
import { useId, useState } from "react";
import { Help } from "@/components/Help";
import type { FeedRow } from "@/lib/feed";
import { howTo, money, startAmount, type HowStep } from "@/lib/simple";
import "./simple.css";

const cents = (c: number): string => (Number.isInteger(c) ? String(c) : c.toFixed(1)) + "¢";

function stepText(s: HowStep, i: number, steps: readonly HowStep[], row: FeedRow): string {
  const prev = steps[i - 1];
  const thing = row.kind === "cross_arb" ? (i === 0 ? `“${row.title}”` : "the same question") : `“${s.label}”`;
  if (prev && prev.venueName === s.venueName) return `Then, on ${s.venueName}, buy ${s.side} on ${thing}.`;
  return `Open ${s.venueName} and buy ${s.side} on ${thing}.`;
}

export function HowTo({ row, unlockHref, heading = "h2" }: { row: FeedRow; unlockHref: string; heading?: "h2" | "h3" }) {
  const id = useId();
  const [raw, setRaw] = useState(() => String(startAmount(row)));
  const amount = Number(raw.replace(/[$,\s]/g, ""));
  const r = howTo(row, raw.trim() ? amount : NaN);
  const H = heading;
  const ok = r.reason === "ok";
  return (
    <section className="how" id="how" aria-labelledby={`${id}-h`}>
      <H id={`${id}-h`} className="how__h">Show me how</H>
      <div className="field how__amount">
        <label htmlFor={`${id}-a`}>How much do you want to put in?</label>
        <div className="how__box">
          <span className="how__dollar" aria-hidden="true">$</span>
          <input id={`${id}-a`} className="input input--big how__input" inputMode="decimal" autoComplete="off" value={raw}
            onChange={e => setRaw(e.target.value)} aria-describedby={`${id}-s`} />
        </div>
      </div>
      <p id={`${id}-s`} className="how__status" role="status">
        {r.reason === "empty" ? "Type an amount in dollars." : r.reason === "too_small" ? "That's not enough for one share on each side. Try more."
          : r.capped ? `This deal only works up to ${money(r.spend)} right now, so we used that.` : null}
      </p>
      <ol className="how__steps">
        {r.steps.map((s, i) => (
          <li key={i} className="how__step">
            <span className="how__n" aria-hidden="true">{i + 1}</span>
            <div className="how__body">
              <p>{stepText(s, i, r.steps, row)} {ok ? <>Spend <b className="mono">{money(s.spend)}</b>.</> : null}</p>
              {ok ? <p className="how__sub">That&apos;s {s.shares.toLocaleString("en-US")} {s.shares === 1 ? "share" : "shares"} at <span className="nw">{cents(s.priceCents)}.<Help k="price" label="share price" /></span></p> : null}
              {s.url && (i === 0 || r.steps[i - 1]?.venueName !== s.venueName)
                ? <a className="btn btn--secondary how__open" href={s.url} target="_blank" rel="noopener noreferrer">Open {s.venueName}</a> : null}
            </div>
          </li>
        ))}
        <li className="how__step how__step--done">
          <span className="how__n" aria-hidden="true">{r.steps.length + 1}</span>
          <div className="how__body">
            <p>Done. When it ends, one side pays you {ok ? <b className="mono">{money(r.back)}</b> : "back"}.
              {ok ? <> You keep about <span className="nw"><b className="mono how__keep">{money(r.keep)}</b>.<Help k="keep" /></span></> : null}</p>
          </div>
        </li>
      </ol>
      <p className="how__note">
        {ok ? <>The apps add about {money(r.fees)} in fees on <span className="nw">top.<Help k="fees" /></span> </> : null}
        This only works if both buys go through at these prices and both apps pick the same winner. Buy both sides right away: prices move.
      </p>
      {row.sets === null ? (
        <p className="how__note">Big amounts can get worse prices. <a href={unlockHref} data-unlock="how-size">Members see how big each deal goes.</a></p>
      ) : null}
    </section>
  );
}
