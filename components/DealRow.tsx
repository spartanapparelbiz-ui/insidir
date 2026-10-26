/* One row of the feed. Rows arrive already redacted (lib/feed.ts): when `locked`, size and dollar fields are null
 * and are drawn as blurred blocks with an Unlock button. */
import Link from "next/link";
import type { FeedRow } from "@/lib/feed";
import { days, pct, usd } from "@/lib/format";
import { Ago } from "./Ago";
import { SafetyLight } from "./SafetyLight";

function Num({ k, v }: { k: string; v: string | null }) {
  return <span><span className="num__k">{k}</span><span className="num__v">{v ?? <span className="blur" aria-label="Locked" />}</span></span>;
}

export function DealRow({ row, now, unlockHref }: { row: FeedRow; now: number; unlockHref: string }) {
  const lock = row.kind !== "second_opinion";
  const body = (
    <>
      <div className="deal__top">
        <p className="deal__title">{row.title}</p>
        <SafetyLight safety={row.safety} />
      </div>
      <p className="deal__play">{row.play}</p>
      <div className="deal__nums">
        <Num k="Profit" v={lock ? (row.profit === null ? null : usd(row.profit)) : "—"} />
        <Num k="ROI" v={lock ? pct(row.roi) : `${row.gapCents ?? 0}¢ gap`} />
        <Num k="Max size" v={row.cost === null ? null : row.kind === "second_opinion" ? "—" : usd(row.cost + (row.fees ?? 0))} />
        <Num k="Per day" v={lock ? (row.profitPerDay === null ? null : usd(row.profitPerDay)) : "—"} />
      </div>
      <div className="deal__foot">
        <span className="dim tiny">Found <Ago at={row.foundAt} serverNow={now} /> · resolves in {days(row.days)}{row.locked ? " · 30 min delay" : row.stale ? " · not live" : ""}</span>
        {row.locked ? <span className="btn btn--secondary" style={{ minHeight: 36 }}>Unlock</span> : null}
      </div>
    </>
  );
  const cls = "deal" + (row.stale ? " deal--stale" : "");
  return row.locked
    ? <Link className={cls} href={unlockHref} data-unlock="feed-row">{body}</Link>
    : <Link className={cls} href={`/deal/${encodeURIComponent(row.id)}`}>{body}</Link>;
}
