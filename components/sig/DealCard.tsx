/* The deal card, Simple view (docs/BRIEF.md §4.3): the event and when it ends, the play as a sentence, the $1 bar,
 * "You keep $X at $Y", the "Same rules?" badge, "Works up to $Z", "Pays out in …", "Open for 3m 12s", and "Show me
 * how". A free viewer's card has lock bars where the paid numbers go: the values are never in the DOM. Closed cards
 * dim and say how long they lasted. Pure; the caller passes `now` so the timer counts. */
import type { ReactNode } from "react";
import { LockBar, paysOut } from "@/components/app/DealTable";
import { SameRules, type RuleText } from "@/components/sig/SameRules";
import { DollarBar, type DollarLeg } from "@/components/ui/DollarBar";
import { clock2, money2 } from "@/lib/format";
import type { Safety } from "@/lib/types";

export interface DealCardData {
  id: string;
  title: string;
  /** When the event ends, as shown ("Sun, Nov 9"). */
  when: string | null;
  play: string;
  legs: DollarLeg[];
  feesCents: number;
  safety: Safety;
  rules?: readonly [RuleText, RuleText] | null;
  /** What you keep at `keepAt` dollars put in; null when withheld (free) or unknown. */
  keep: number | null;
  keepAt: number;
  /** The most you can put in at these prices; null when withheld. */
  worksUpTo: number | null;
  closeTime: number | null;
  foundAt: number;
  /** When a scan last confirmed the prices. */
  lastSeenAt: number;
  /** "live", "stale" (not re-confirmed lately), or closed at a time. */
  state: "live" | "stale" | "closed";
  closedAt?: number | null;
}

const WHEN = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
export const eventWhen = (closeTime: number | null): string | null => (closeTime ? WHEN.format(new Date(closeTime)) : null);

export function DealCard({ d, now, action }: { d: DealCardData; now: number; action: ReactNode }) {
  const pays = paysOut(d.closeTime, now);
  const closed = d.state === "closed";
  const lasted = closed && d.closedAt ? clock2(d.closedAt - d.foundAt) : null;
  return (
    <article className={`dcard dcard--${d.state}`} data-deal={d.id} aria-labelledby={`dc-${d.id}`}>
      <header className="dcard__head">
        <h3 className="dcard__title" id={`dc-${d.id}`}>{d.title}</h3>
        {d.when ? <p className="dcard__when">{d.when}</p> : null}
      </header>
      <p className="dcard__play">{d.play}</p>
      <DollarBar legs={d.legs} feesCents={d.feesCents} size="card" />
      <p className="dcard__keep">
        You keep{" "}
        {d.keep !== null ? <span className="profit">{money2(d.keep)}</span> : <LockBar w={64} />}
        {" "}at <span className="mono">{money2(d.keepAt).replace(".00", "")}</span>
      </p>
      <dl className="dcard__facts">
        <div><dt>Same rules?</dt><dd><SameRules safety={d.safety} rules={d.rules} bare /></dd></div>
        <div><dt>Works up to</dt><dd className="mono">{d.worksUpTo !== null ? money2(d.worksUpTo) : <LockBar w={56} />}</dd></div>
        {pays ? <div><dt>Pays out in</dt><dd className="mono">{pays.replace("Pays out in ", "")}</dd></div> : null}
        <div><dt>{closed ? "Lasted" : "Open for"}</dt><dd className="mono">{closed ? (lasted ?? "—") : clock2(now - d.foundAt)}</dd></div>
      </dl>
      {closed ? <p className="dcard__closed" role="status">Closed.{lasted ? ` Lasted ${lasted}.` : ""}</p>
        : d.state === "stale" ? <p className="dcard__stale">This one&apos;s probably gone. Prices moved {Math.max(1, Math.round((now - d.lastSeenAt) / 60_000))} min ago.</p> : null}
      <div className="dcard__act">{action}</div>
    </article>
  );
}
