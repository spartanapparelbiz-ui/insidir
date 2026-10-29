/* A move as one card: what the money says first ("$17K says no runs in the 1st inning") with the market as a grey
 * line, then where it stands (open: "In at 45% · now 61% ↑", the price of their side now, refreshed every minute by
 * the feed; settled: "Won · +$188K" / "Lost · −$370K" from real payouts), the market's split when there is one,
 * who moved (picture, name to their profile, record for members), and the buttons. Payout, the why line and the
 * source are in Details. A group card ("4 big bets on Brewers · $68,765") opens to every bet in it. Stock cards
 * say what was bought and by whom. Everything was sent by the server for this viewer's plan and region
 * (lib/moves/feed.ts). */
import Link from "next/link";
import { SubjectArt } from "@/components/SubjectArt";
import { TimeAgo } from "@/components/TimeAgo";
import { subjectPhoto } from "@/lib/photos";
import type { FeedItem } from "@/lib/moves/feed";
import type { SourceLink } from "@/lib/moves/source";
import type { FollowKind } from "@/lib/db/schema";
import { FollowButton, type FollowState } from "./FollowButton";
import { LockedRecord } from "./LockedRecord";
import { Avatar } from "./Avatar";
import { short } from "@/lib/moves/headline";
import { Result } from "@/components/ui/Result";

const TAG: Record<string, { text: string }> = {
  sports: { text: "Sports" },
  markets: { text: "Markets" },
  crypto: { text: "Crypto" },
  stocks: { text: "Stocks" },
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

const pctOf = (p: number) => `${Math.round(p * 100)}%`;

/** The result on the right: settled, the real P&L in green or red over "Won" / "Lost" ("Voided" alone); open, "Open";
 *  a filing, "Purchase". The size is said once, in the line under the headline. */
function CardResult({ m }: { m: FeedItem }) {
  if (m.result) {
    const status = m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Voided";
    const v = m.pnl;
    const amount = v !== null && m.result !== "void" ? `${v >= 0 ? "+" : "−"}${short(Math.abs(v)).replace("−", "")}` : null;
    return <span data-testid="move-result"><Result amount={amount} tone={m.result === "won" ? "won" : m.result === "lost" ? "lost" : "none"} status={status} /></span>;
  }
  return <Result status={m.source === "sec" ? "Purchase" : "Open"} />;
}

/** The card's thumbnail: its subject (the league's field, the topic, the filing), on its column's deep colour. */
const TAB_TONE: Record<string, string> = { sports: "var(--cover-leagues-1)", markets: "var(--cover-topics-1)", stocks: "var(--cover-stocks-1)", crypto: "var(--cover-topics-0)" };
const subjectOf = (m: FeedItem) => subjectPhoto({ tab: m.tab, source: m.source, leagueLabel: m.leagueLabel, league: m.league,
  text: `${m.eventTitle} ${m.marketTitle}`, detailKind: m.source === "sec" ? (m.note?.includes("13F") ? "fund" : "insider") : null });

/** Open: "Entry 45% · now 61% ↑". */
function Standing({ m, now }: { m: FeedItem; now: number | null }) {
  if (m.result || !m.inAt) return null;
  const dir = now === null ? null : now > m.avgPrice + 0.005 ? "up" : now < m.avgPrice - 0.005 ? "down" : "flat";
  return (
    <p className="move__live" data-testid="move-live">
      Entry {m.inAt}{now !== null ? <> · now {pctOf(now)} {dir === "up" ? <span className="move__up" aria-label="up">↑</span> : dir === "down" ? <span className="move__down" aria-label="down">↓</span> : null}</> : null}
    </p>
  );
}

/** "Pays $161 per $100 if it hits." */
function pays(m: FeedItem): string | null {
  if (m.source === "sec" || !(m.avgPrice > 0 && m.avgPrice < 1)) return null;
  return `Payout ${(1 / m.avgPrice).toFixed(2)}× if it settles their way.`;
}

export function MoveCard({ m, follow, followFor, trialHref, fresh = false, compact = false, nowYes }: { m: FeedItem; follow: FollowState; trialHref: string; fresh?: boolean;
  /** Per-target follow state for SEC cards (the insider, the company, the fund); without it they start from `follow`
   *  (a member's "on" becomes "off": following again is harmless). */
  followFor?: (kind: FollowKind, target: string) => FollowState;
  /** No buttons (the home preview, where the one action is "See the live feed"). */
  compact?: boolean;
  /** The market's YES price now, when the feed has a fresher one than the server sent. */
  nowYes?: number | null }) {
  const tag = TAG[m.tab]!;
  const sub = m.source === "sec" ? (m.ticker ?? (m.note?.includes("13F") ? "Big fund" : null)) : m.leagueLabel ?? (m.league && m.league !== "other" ? m.league : null);
  const now = nowYes !== undefined && nowYes !== null ? (m.outcomeSide === "yes" ? nowYes : 1 - nowYes) : m.nowPrice;
  const payout = pays(m);
  return (
    <article className={`move move2${fresh ? " move--fresh" : ""}${m.bets ? " move--group" : ""}`} data-move={m.id}>
      <div className="move__top">
        <span className="move__thumb" style={{ ["--tc" as string]: TAB_TONE[m.tab] ?? TAB_TONE.markets }}><SubjectArt subject={subjectOf(m)} crop="contain" /></span>
        <span className="move__kind">{tag.text}{sub ? ` · ${sub}` : ""}</span>
      </div>
      <div className="move__hrow">
        <h3 className="move__head">{m.headline}</h3>
        <CardResult m={m} />
      </div>
      <p className="move__meta"><span>{short(m.amount)}</span> · <span>{m.who.name}</span> · <TimeAgo className="move__ago" at={m.at} initial={m.ago} /></p>
      <p className="move__subl">{m.subline}</p>
      <Standing m={m} now={now} />
      {m.split ? <p className="move__split"><Link href={`/market/${encodeURIComponent(m.marketId)}#smart-h`}>{m.split}</Link></p> : null}
      {m.bets ? (
        <details className="move__bets">
          <summary>See all {m.bets.length} positions</summary>
          <ol>
            {m.bets.map(b => (
              <li key={b.id}>
                <b>{short(b.amount)}</b>
                <span className="move__betwho">{b.who.href ? <Link href={b.who.href}>{b.who.name}</Link> : b.who.name}</span>
                {b.inAt ? <span>entry {b.inAt}</span> : null}
                <TimeAgo className="move__bettime" at={b.at} initial={b.ago} />
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <div className="move__lead">
          <Avatar face={m.face} />
          <p className="move__by">
            {m.who.href ? <Link className="move__name" href={m.who.href}>{m.who.name}</Link> : <span className="move__name">{m.who.name}</span>}
            {m.topTrader ? <span className="move__top-trader"> · Top-ranked trader</span> : null}
            {m.who.badge ? <span className="move__badge"> · {m.who.badge}</span> : null}
            {m.record ? <span className="move__rec">{m.record}</span> : null}
          </p>
        </div>
      )}
      {m.context ? <p className="move__ctx">{m.context}</p> : null}
      {m.record || m.bets ? null : m.wallet && follow !== "on" && follow !== "off" ? (
        // The public preview: a locked row where the record goes; the numbers never reach this page.
        <LockedRecord compact />
      ) : null}
      {!compact || m.source === "sec" ? (
        <details className="move__more">
          <summary>Details</summary>
          {m.source === "sec" ? <p className="move__sentence"><Sentence m={m} /></p> : null}
          {payout ? <p className="move__payout">{payout}</p> : null}
          {m.note ? <p className="move__record">{m.note}</p> : null}
          {m.why ? <p className="move__why">{m.why}</p> : null}
          {m.sourceLink ? <p><SourceA link={m.sourceLink} className="source move__src" /></p> : null}
        </details>
      ) : null}
      {compact ? null : (
        <div className="move__foot">
          {m.source === "sec" ? (
            <>
              {(m.secFollows ?? []).map(f => (
                <FollowButton key={`${f.kind}:${f.target}`} kind={f.kind} target={f.target} label={f.label} trialHref={trialHref}
                  state={followFor ? followFor(f.kind, f.target) : follow === "on" ? "off" : follow} />
              ))}
              {m.companyHref && m.ticker ? <Link className="btn btn--secondary" href={m.companyHref}>{`${m.ticker} insiders`}</Link> : null}
              {m.link ? <a className="btn btn--secondary" href={m.link.href} target="_blank" rel="noopener noreferrer">{m.link.label}</a> : null}
            </>
          ) : (
            <>
              {m.wallet && !m.bets ? <FollowButton kind="trader" target={m.wallet} state={follow} trialHref={trialHref} /> : null}
              <Link className="btn btn--secondary" href={`/market/${encodeURIComponent(m.marketId)}`}>See market</Link>
            </>
          )}
        </div>
      )}
    </article>
  );
}
