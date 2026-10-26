"use client";
/* The feed (docs/V2.md §6): tabs (Sports, Markets, Crypto soon, Stocks soon), size chips, league chips on Sports,
 * newest first. It asks /api/moves every 10 seconds; new moves slide in at the top. A status line instead of scary
 * errors: "Live · updated 8s ago", or "Catching up. Showing the latest moves we have." with timestamps. Never "Connection
 * lost", never fake activity. Free viewers see moves 30 minutes late with one upsell card on top. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeedItem, FeedStatus } from "@/lib/moves/feed";
import type { League, Tab } from "@/lib/moves/types";
import { ComingSoon } from "./ComingSoon";
import type { FollowState } from "./FollowButton";
import { MoveCard } from "./MoveCard";

const SIZES = [{ min: 10_000, label: "$10k+" }, { min: 50_000, label: "$50k+" }, { min: 100_000, label: "$100k+" }] as const;
const SPORT_LEAGUES: League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "UFC", "tennis", "golf"];
const POLL_MS = 10_000;

export function Feed({ pill, initial, status: initialStatus, initialTab, free, follows, followsReady, trialHref, serverNow }: {
  pill?: ReactNode; initial: FeedItem[]; status: FeedStatus | null; initialTab: Tab; free: boolean;
  /** Wallets this member follows (null: not a member). */
  follows: string[] | null; followsReady: boolean; trialHref: string; serverNow: number;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [min, setMin] = useState(10_000);
  const [league, setLeague] = useState<League | null>(null);
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState(new Set(follows ?? []));
  const [skew] = useState(() => serverNow - Date.now());
  const [, tick] = useState(0);
  const seen = useRef(new Set(initial.map(i => i.id)));
  const first = useRef(true);

  const load = useCallback(async (reset: boolean) => {
    const q = new URLSearchParams({ tab, min: String(min), limit: "30" });
    if (tab === "sports" && league) q.set("league", league);
    const res = await fetch(`/api/moves?${q}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setStatus(s => s ? { ...s, state: "behind", text: "Catching up. Showing the latest moves we have." } : s); return; }
    const body = (await res.json()) as { items: FeedItem[]; status: FeedStatus | null };
    const isNew = reset ? new Set<string>() : new Set(body.items.filter(i => !seen.current.has(i.id)).map(i => i.id));
    for (const i of body.items) seen.current.add(i.id);
    setItems(body.items);
    setFresh(isNew);
    setStatus(body.status);
  }, [tab, min, league]);

  useEffect(() => {
    if (first.current) { first.current = false; } else void load(true);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(false); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setFollowed(new Set(follows ?? [])); }, [follows]);

  const now = Date.now() + skew;
  const statusText = status?.state === "live" && status.lastAt ? `Live · updated ${Math.max(0, Math.round((now - status.lastAt) / 1000))}s ago` : status?.text ?? null;
  const followState = (wallet: string | null): FollowState => !followsReady ? "soon" : follows === null || free ? "locked" : wallet && followed.has(wallet) ? "on" : "off";

  return (
    <section className="feed2" aria-labelledby="feed-h">
      <div className="feed2__head">
        <h1 id="feed-h" className="feed2__h">Live feed</h1>
        <div className="feed2__meta">
          {statusText ? <p className={`status status--${status?.state ?? "behind"}`} role="status"><span className="status__dot" aria-hidden="true" />{statusText}</p> : null}
          {pill}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Category">
        {(["sports", "markets"] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tabs__tab" onClick={() => { setTab(t); setLeague(null); }}>
            {t === "sports" ? "Sports" : "Markets"}
          </button>
        ))}
        <ComingSoon feature="crypto" className="tabs__tab tabs__tab--soon">Crypto</ComingSoon>
        <ComingSoon feature="stocks" className="tabs__tab tabs__tab--soon">Stocks</ComingSoon>
      </div>
      <div className="chips" aria-label="Size">
        {SIZES.map(s => <button key={s.min} type="button" className="chip2" aria-pressed={min === s.min} onClick={() => setMin(s.min)}>{s.label}</button>)}
      </div>
      {tab === "sports" ? (
        <div className="chips chips--scroll" aria-label="League">
          <button type="button" className="chip2" aria-pressed={league === null} onClick={() => setLeague(null)}>All</button>
          {SPORT_LEAGUES.map(l => <button key={l} type="button" className="chip2" aria-pressed={league === l} onClick={() => setLeague(l)}>{l === "college" ? "College" : l}</button>)}
        </div>
      ) : null}
      {free ? (
        <aside className="upsell">
          <p className="upsell__text">You&apos;re seeing moves 30 minutes late. See them live for $1.</p>
          <a className="btn btn--primary" href={trialHref} data-unlock="feed-top">See them live for $1</a>
        </aside>
      ) : null}
      {items.length ? (
        <ol className="feed2__list">
          {items.map(m => <li key={m.id}><MoveCard m={m} follow={followState(m.wallet)} trialHref={trialHref} fresh={fresh.has(m.id)} /></li>)}
        </ol>
      ) : (
        <div className="empty">
          <p className="empty__h">Quiet right now.</p>
          <p className="empty__p">Follow a few top traders and we&apos;ll ping you when they move.</p>
          <a className="btn btn--secondary" href="/results">See past moves</a>
        </div>
      )}
      {status?.state === "behind" && status.lastAt ? <p className="feed2__note">Last update from the source: {new Date(status.lastAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p> : null}
    </section>
  );
}
