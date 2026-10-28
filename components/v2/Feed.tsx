"use client";
/* The feed (docs/INSIDIR-V2.md §6): tabs (Sports, Markets, Crypto soon, Stocks soon), size chips, league chips on Sports,
 * newest first. It asks /api/moves every 10 seconds; new moves wait behind a sticky "N new moves · Show" button (the
 * list never shifts under the reader) and slide in at the top when shown. A status line instead of scary
 * errors: "Live · updated 8s ago", or "Catching up · last update 6m ago" (per tab, 5+ minutes behind) with timestamps. Never "Connection
 * lost", never fake activity. Free viewers see moves 30 minutes late with one upsell card on top. */
import { GET_CTA } from "@/lib/copy";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeedItem, FeedStatus } from "@/lib/moves/feed";
import type { League, Tab } from "@/lib/moves/types";
import { topicCategories, type Picks } from "@/lib/picks";
import { Photo } from "@/components/Photo";
import { BAND, SPOT } from "@/lib/photos";
import { PageBand } from "@/components/PageBand";
import { LockButton } from "@/components/lock/Lock";
import { ComingSoon } from "./ComingSoon";
import type { FollowState } from "./FollowButton";
import { MoveCard } from "./MoveCard";
import { agoText, clockET } from "@/lib/moves/copy";
import { compactDollars as dollarsShort } from "@/lib/home/curate";

const SIZES = [{ min: 10_000, label: "$10k+" }, { min: 50_000, label: "$50k+" }, { min: 100_000, label: "$100k+" }] as const;
const SPORT_LEAGUES: League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "UFC", "tennis", "golf"];
const POLL_MS = 10_000;

export function Feed({ pill, initial, status: initialStatus, initialTab, stocks = false, free, follows, followsReady, trialHref, serverNow, picks = null, firstHint = false }: {
  /** What they picked in onboarding: the feed opens on "Your picks" (their leagues / market topics). */
  picks?: Picks | null;
  /** Just finished onboarding: a one-time hint on the first card. */
  firstHint?: boolean;
  pill?: ReactNode; initial: FeedItem[]; status: FeedStatus | null; initialTab: Tab; free: boolean;
  /** Stocks is live (FEATURES_READY); otherwise it is a Coming soon item. */
  stocks?: boolean;
  /** Wallets this member follows (null: not a member). */
  follows: string[] | null; followsReady: boolean; trialHref: string; serverNow: number;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [min, setMin] = useState(10_000);
  const [league, setLeague] = useState<League | null>(null);
  /** "Your picks" on: only their leagues (Sports) or market topics (Markets). */
  const [mine, setMine] = useState(Boolean(picks));
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!firstHint) return;
    try { if (localStorage.getItem("insidir_first_hint") === "1") return; localStorage.setItem("insidir_first_hint", "1"); } catch { /* show it this once */ }
    setHint(true);
  }, [firstHint]);
  const myLeagues = picks?.leagues ?? [], myCats = topicCategories(picks?.topics ?? []);
  const hasMine = (t: Tab) => (t === "sports" && myLeagues.length > 0) || (t === "markets" && myCats.length > 0);
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  /** New moves wait here behind "N new moves" until asked for, so the list never moves under the reader. */
  const [waiting, setWaiting] = useState<FeedItem[] | null>(null);
  const [followed, setFollowed] = useState(new Set(follows ?? []));
  /** A tab or filter was just changed and its moves are on the way: the old list dims at once instead of sitting there. */
  const [busy, setBusy] = useState(false);
  const [skew] = useState(() => serverNow - Date.now());
  const [, tick] = useState(0);
  const seen = useRef(new Set(initial.map(i => i.id)));
  const first = useRef(true);

  const load = useCallback(async (reset: boolean) => {
    const q = new URLSearchParams({ tab, min: String(min), limit: "30" });
    if (tab === "sports" && league) q.set("league", league);
    else if (mine && tab === "sports" && myLeagues.length) q.set("leagues", myLeagues.join(","));
    if (mine && tab === "markets" && myCats.length) q.set("cats", myCats.join(","));
    const res = await fetch(`/api/moves?${q}`, { cache: "no-store" }).catch(() => null);
    if (reset) setBusy(false);
    if (!res?.ok) { setStatus(s => s ? { ...s, state: "behind", text: s.lastAt ? `Catching up · last update ${agoText(s.lastAt, Date.now())}` : "Catching up · waiting for the first update" } : s); return; }
    const body = (await res.json()) as { items: FeedItem[]; status: FeedStatus | null };
    setStatus(body.status);
    if (reset) {
      for (const i of body.items) seen.current.add(i.id);
      setItems(body.items); setFresh(new Set()); setWaiting(null);
      return;
    }
    const isNew = body.items.filter(i => !seen.current.has(i.id));
    if (!isNew.length) {
      // Same moves: refresh them in place (amounts merged, times, results); nothing is added or moved.
      setItems(cur => cur.map(c => body.items.find(b => b.id === c.id) ?? c));
      return;
    }
    setWaiting(body.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, min, league, mine]);

  useEffect(() => {
    if (first.current) { first.current = false; } else void load(true);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(false); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setFollowed(new Set(follows ?? [])); }, [follows]);

  const newCount = waiting ? waiting.filter(i => !seen.current.has(i.id)).length : 0;
  const showNew = () => {
    if (!waiting) return;
    setFresh(new Set(waiting.filter(i => !seen.current.has(i.id)).map(i => i.id)));
    for (const i of waiting) seen.current.add(i.id);
    setItems(waiting); setWaiting(null);
    document.getElementById("feed-h")?.scrollIntoView({ block: "start" });
  };
  const now = Date.now() + skew;
  const statusText = status?.state === "live" && status.lastAt ? `Live · updated ${Math.max(0, Math.round((now - status.lastAt) / 1000))}s ago` : status?.text ?? null;
  const followState = (wallet: string | null): FollowState => !followsReady ? "soon" : follows === null || free ? "locked" : wallet && followed.has(wallet) ? "on" : "off";

  const tabs = stocks ? (["sports", "markets", "stocks"] as const) : (["sports", "markets"] as const);
  const pick = (f: () => void) => { setBusy(true); f(); };
  const biggest = items.reduce<FeedItem | null>((b, m) => (!b || m.amount > b.amount ? m : b), null);
  const total = items.reduce((s, m) => s + m.amount, 0);

  return (
    <section className="feed2" aria-labelledby="feed-h">
      <PageBand n={BAND.feed[tab === "markets" || tab === "stocks" ? tab : "sports"]} title="Live feed" id="feed-h" />
      <div className="dash">
        <div className="dash__main">
          <div className="dash__bar">
            <div className="seg" role="group" aria-label="Category">
              {tabs.map(t => (
                <button key={t} type="button" aria-pressed={tab === t} className="seg__btn" onClick={() => { if (t !== tab) pick(() => { setTab(t); setLeague(null); }); }}>
                  {t === "sports" ? "Sports" : t === "markets" ? "Markets" : "Stocks"}
                </button>
              ))}
              {stocks ? null : <ComingSoon feature="stocks" className="seg__btn seg__btn--soon">Stocks</ComingSoon>}
              <ComingSoon feature="crypto" className="seg__btn seg__btn--soon">Crypto</ComingSoon>
            </div>
            <div className="dash__meta">
              {statusText ? <p className={`status status--${status?.state ?? "behind"}`} role="status"><span className="status__dot" aria-hidden="true" />{statusText}</p> : null}
              {pill}
            </div>
          </div>
          <div className="dash__filters">
            <div className="seg seg--sm" role="group" aria-label="Size">
              {SIZES.map(s => <button key={s.min} type="button" className="seg__btn" aria-pressed={min === s.min} onClick={() => { if (s.min !== min) pick(() => setMin(s.min)); }}>{s.label}</button>)}
            </div>
            {hasMine(tab) && tab === "markets" ? (
              <div className="chips dash__leagues" role="group" aria-label="Topics">
                <button type="button" className="chip2" aria-pressed={mine} onClick={() => { if (!mine) pick(() => setMine(true)); }}>Your picks</button>
                <button type="button" className="chip2" aria-pressed={!mine} onClick={() => { if (mine) pick(() => setMine(false)); }}>All</button>
              </div>
            ) : null}
            {tab === "sports" ? (
              <div className="chips chips--scroll dash__leagues" role="group" aria-label="League">
                {hasMine("sports") ? <button type="button" className="chip2" aria-pressed={mine && league === null} onClick={() => { if (!mine || league) pick(() => { setMine(true); setLeague(null); }); }}>Your picks</button> : null}
                <button type="button" className="chip2" aria-pressed={!(mine && hasMine("sports")) && league === null} onClick={() => { if (league || mine) pick(() => { setMine(false); setLeague(null); }); }}>All</button>
                {SPORT_LEAGUES.map(l => <button key={l} type="button" className="chip2" aria-pressed={league === l} onClick={() => { if (league !== l) pick(() => setLeague(l)); }}>{l === "college" ? "College" : l}</button>)}
              </div>
            ) : null}
          </div>
          {newCount ? (
            <div className="newmoves"><button type="button" className="btn btn--primary newmoves__btn" onClick={showNew}>{newCount} new {newCount === 1 ? "move" : "moves"} · Show</button></div>
          ) : null}
          {free ? (
            <aside className="upsell dash__upsell">
              <p className="upsell__text">You&apos;re seeing moves 30 minutes late. Try 7 days for $1, then $39/mo.</p>
              <LockButton where="live-feed" className="btn btn--primary">See them live</LockButton>
            </aside>
          ) : null}
          {items.length ? (
            <ol className="feed2__list" aria-busy={busy || undefined}>
              {items.map((m, i) => (
                <li key={m.id}>
                  {hint && i === 0 ? <p className="hint" role="note" data-testid="first-hint">This is a big move. Tap anyone to see their record.<button type="button" onClick={() => setHint(false)}>Got it</button></p> : null}
                  <MoveCard m={m} follow={followState(m.wallet)} trialHref={trialHref} fresh={fresh.has(m.id)} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty">
              <Photo n={SPOT.feedEmpty} className="empty__photo" wideOnly sizes="720px" />
              <p className="empty__h">Quiet right now. The next big move is coming.</p>
              <p className="empty__p">Follow a few top traders and we&apos;ll ping you when they move.</p>
              <a className="btn btn--secondary" href="/results">See past moves</a>
            </div>
          )}
          {status?.state === "behind" && status.lastAt ? <p className="feed2__note">Last update from the source: {clockET(status.lastAt)}. Nothing below is live until it catches up.</p> : null}
        </div>
        <aside className="dash__side" aria-label="On this list">
          <div className="side">
            <p className="side__k">On this list</p>
            <dl className="side__stats">
              <div><dt>Moves</dt><dd>{items.length}</dd></div>
              <div><dt>Total</dt><dd>{dollarsShort(total)}</dd></div>
              <div><dt>Biggest</dt><dd className="money">{biggest ? dollarsShort(biggest.amount) : "–"}</dd></div>
            </dl>
          </div>
          {free ? (
            <div className="side side--offer">
              <p className="side__h">See every move live</p>
              <p className="side__p">Plus trader records and follows. Try 7 days for $1, then $39/mo, cancel anytime.</p>
              <LockButton where="feed-side" className="btn btn--primary btn--block">{GET_CTA}</LockButton>
            </div>
          ) : null}
          <nav className="side side--links" aria-label="More">
            <a href="/top">Top traders<span aria-hidden="true">→</span></a>
            <a href="/results">Results: every move, won or lost<span aria-hidden="true">→</span></a>
            <a href="/data">Where the data comes from<span aria-hidden="true">→</span></a>
          </nav>
        </aside>
      </div>
    </section>
  );
}
