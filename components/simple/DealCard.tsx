/* One deal in the Simple view (the default): a short card that reads like a sentence.
 *
 *   Chiefs vs Bills, Sunday
 *   Buy YES on Kalshi (55¢) + NO on Polymarket (40¢).
 *   Put in $95 → get $100 back either way. You keep $4.60 after fees.
 *   Same rules? Yes. Works up to $640. Pays out Sunday night.
 *   [Show me how]
 *
 * Numbers are scaled to $100 back (lib/simple.ts), so free rows, which carry no size, read the same; their "Works up
 * to" is a members-only lock. A "?" sits next to every number. "Show me how" is a real link to the deal page (works
 * without JS); the Terminal opens the walkthrough in a sheet instead. No hooks, so any page can render it. */
import Link from "next/link";
import { Ago } from "@/components/Ago";
import { Help } from "@/components/Help";
import { LockBar } from "@/components/DealRow";
import type { FeedRow } from "@/lib/feed";
import { money, simpleDeal } from "@/lib/simple";
import { PaysOut } from "./PaysOut";
import "./simple.css";

export type CardMotion = "new" | "tick" | "closing" | null;

export function DealCard({ row, now, unlockHref, motion = null, heading = "h3" }: {
  row: FeedRow; now: number; unlockHref: string; motion?: CardMotion; heading?: "h2" | "h3";
}) {
  const d = simpleDeal(row);
  const H = heading;
  const stale = row.stale || motion === "closing";
  const cls = "sd" + (stale && !row.locked ? " sd--stale" : "") + (motion ? ` sd--${motion}` : "");
  // Free rows are all 30 minutes late, and the page says so once; a card only flags what's different about it.
  const tag = motion === "closing" ? "Just closed" : row.stale && !row.locked ? "Prices may have moved" : null;
  const href = `/deal/${encodeURIComponent(row.id)}`;
  return (
    <article className={cls} data-deal={row.id}>
      <div className="sd__top">
        <H className="sd__title">{row.title}</H>
        {tag ? <span className="tag">{tag}</span> : null}
      </div>
      <p className="sd__buy">{d.buy}</p>
      {d.lock ? (
        <p className="sd__math">
          <span className="nw">Put in <b className="mono">{money(d.putIn)}</b><Help k="putIn" /></span> → get <b className="mono">{money(d.back)}</b> back{" "}
          <span className="nw">either way<Help k="back" />.</span>{" "}
          You keep <span className="nw"><b className="mono sd__keep">{money(d.keep)}</b><Help k="keep" /></span> after fees.
        </p>
      ) : (
        <p className="sd__math">This is a tip, not a locked deal. If you buy, you could lose what you put in.</p>
      )}
      <p className="sd__facts">
        <span className="sd__fact"><span className={`light light--${row.safety}`}>Same rules? {d.sameRules}.</span><Help k="rules" /></span>
        {d.lock ? (
          <span className="sd__fact">Works up to {d.upTo !== null ? <b className="mono">{money(d.upTo)}</b>
            : <a className="sd__unlock" href={unlockHref} data-unlock="card-size"><LockBar w={44} /> members only</a>}.<Help k="upTo" /></span>
        ) : null}
        <span className="sd__fact">Pays out <PaysOut closeTime={row.closeTime} now={now} />.<Help k="pays" /></span>
      </p>
      <div className="sd__foot">
        {/* A plain link (not next/link) so the Terminal's list can open the sheet instead; without JS it opens the page. */}
        {d.lock ? <a className="btn btn--primary sd-how" href={`${href}#how`} data-deal-how={row.id}>Show me how</a>
          : <Link className="btn btn--secondary" href={href}>See the details</Link>}
        <span className="sd__age">Found <Ago at={row.foundAt} serverNow={now} /></span>
      </div>
    </article>
  );
}
