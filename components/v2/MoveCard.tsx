/* A move as one card (docs/INSIDIR-V2.md §6): a category tag, the sentence, the payout line, the record line, the time,
 * and two buttons: Follow (traders) and See market. Stock cards (SEC filings) carry the filing line and one button,
 * the SEC filing itself. Everything on it was sent by the server for this viewer's plan
 * and region (lib/moves/feed.ts). */
import Link from "next/link";
import type { FeedItem } from "@/lib/moves/feed";
import { FollowButton, type FollowState } from "./FollowButton";

const TAG: Record<string, { text: string; tint: string }> = {
  sports: { text: "Sports", tint: "green" },
  markets: { text: "Markets", tint: "violet" },
  crypto: { text: "Crypto", tint: "peach" },
  stocks: { text: "Stocks", tint: "blue" },
};

export function MoveCard({ m, follow, trialHref, fresh = false }: { m: FeedItem; follow: FollowState; trialHref: string; fresh?: boolean }) {
  const tag = TAG[m.tab]!;
  const sub = m.source === "sec" ? (m.ticker ?? (m.note?.includes("13F") ? "Big fund" : null)) : m.league && m.league !== "other" ? m.league : null;
  return (
    <article className={`move${fresh ? " move--fresh" : ""}`} data-move={m.id}>
      <div className="move__top">
        <span className={`tag tag--${tag.tint}`}>{tag.text}{sub ? ` · ${sub}` : ""}</span>
        <time className="move__time" dateTime={new Date(m.at).toISOString()}>{m.ago}</time>
      </div>
      <p className="move__sentence">{m.sentence}</p>
      {m.payout ? <p className="move__payout">{m.payout}</p> : null}
      {m.note ? <p className="move__record">{m.note}</p> : null}
      {m.record ? <p className="move__record">{m.record}</p> : null}
      {m.result ? <p className={`move__result move__result--${m.result}`}>{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Refunded"}</p> : null}
      {m.source === "sec" ? (
        <div className="move__actions">
          {m.link ? <a className="btn btn--secondary" href={m.link.href} target="_blank" rel="noopener noreferrer">{m.link.label}</a> : null}
        </div>
      ) : (
      <div className="move__actions">
        {m.wallet ? <FollowButton kind="trader" target={m.wallet} state={follow} trialHref={trialHref} /> : null}
        <Link className="btn btn--secondary" href={`/market/${encodeURIComponent(m.marketId)}`}>See market</Link>
        {m.wallet ? <Link className="move__who" href={`/trader/${m.wallet}`}>{m.walletLabel}</Link> : null}
      </div>
      )}
    </article>
  );
}
