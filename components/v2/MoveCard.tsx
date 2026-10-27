/* A move as one card (docs/INSIDIR-V2.md §6): a category tag, the sentence (its name opens the profile, /p/[id]), a
 * "New wallet" label, the payout line, the record line, at most one "why this matters" fact, the time,
 * and two buttons: Follow (traders) and See market. Stock cards (SEC filings) carry the filing line and one button,
 * the SEC filing itself. Everything on it was sent by the server for this viewer's plan
 * and region (lib/moves/feed.ts). */
import Link from "next/link";
import { TimeAgo } from "@/components/TimeAgo";
import { LockButton } from "@/components/lock/Lock";
import type { FeedItem } from "@/lib/moves/feed";
import type { SourceLink } from "@/lib/moves/source";
import { FollowButton, type FollowState } from "./FollowButton";

const TAG: Record<string, { text: string; tint: string }> = {
  sports: { text: "Sports", tint: "green" },
  markets: { text: "Markets", tint: "violet" },
  crypto: { text: "Crypto", tint: "peach" },
  stocks: { text: "Stocks", tint: "blue" },
};

/** "Where this comes from: Polymarket trade on Polygon ↗": the original public record behind every number on a card. */
export function SourceA({ link, className = "source" }: { link: SourceLink; className?: string }) {
  return <a className={className} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<span aria-hidden="true">{"\u00a0↗"}</span><span className="sr-only"> (opens in a new tab)</span></a>;
}

/** The sentence with the name as a link to the profile (at the start, or after "Filed today: " on a Form 4). */
function Sentence({ m }: { m: FeedItem }) {
  const { name, href } = m.who;
  const at = href && name ? m.sentence.indexOf(name) : -1;
  if (!href || at < 0) return <>{m.sentence}</>;
  return <>{m.sentence.slice(0, at)}<Link className="move__name" href={href}>{name}</Link>{m.sentence.slice(at + name.length)}</>;
}

export function MoveCard({ m, follow, trialHref, fresh = false, compact = false }: { m: FeedItem; follow: FollowState; trialHref: string; fresh?: boolean;
  /** No buttons (the home preview, where the one action is "See the live feed"). */
  compact?: boolean }) {
  const tag = TAG[m.tab]!;
  const sub = m.source === "sec" ? (m.ticker ?? (m.note?.includes("13F") ? "Big fund" : null)) : m.league && m.league !== "other" ? m.league : null;
  return (
    <article className={`move${fresh ? " move--fresh" : ""}`} data-move={m.id}>
      <div className="move__top">
        <span className={`tag tag--${tag.tint}`}>{tag.text}{sub ? ` · ${sub}` : ""}</span>
        <TimeAgo className="move__time" at={m.at} initial={m.ago} />
      </div>
      <p className="move__sentence"><Sentence m={m} /></p>
      {m.context ? <p className="move__ctx">{m.context}</p> : null}
      {m.who.badge ? <p><span className="badge">{m.who.badge}</span></p> : null}
      {m.payout ? <p className="move__payout">{m.payout}</p> : null}
      {m.note ? <p className="move__record">{m.note}</p> : null}
      {m.record ? <p className="move__record">{m.record}</p> : m.wallet && follow === "locked" && !compact ? <LockButton where="record-card" className="lockline">See this trader&apos;s win record</LockButton> : null}
      {m.why ? <p className="move__why">{m.why}</p> : null}
      {m.result ? <p className={`move__result move__result--${m.result}`}>{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Refunded"}</p> : null}
      {compact ? null : m.source === "sec" ? (
        <div className="move__actions">
          {m.link ? <a className="btn btn--secondary" href={m.link.href} target="_blank" rel="noopener noreferrer">{m.link.label}</a> : null}
        </div>
      ) : (
      <div className="move__actions">
        {m.wallet ? <FollowButton kind="trader" target={m.wallet} state={follow} trialHref={trialHref} /> : null}
        <Link className="btn btn--secondary" href={`/market/${encodeURIComponent(m.marketId)}`}>See market</Link>
        {m.who.href && !m.sentence.includes(m.who.name) ? <Link className="move__who" href={m.who.href}>{m.who.name}</Link> : null}
      </div>
      )}
      {m.sourceLink ? <SourceA link={m.sourceLink} /> : null}
    </article>
  );
}
