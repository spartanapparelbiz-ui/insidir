"use client";
/* The three onboarding screens (app/onboarding), each skippable:
 *   1. "What do you want to follow?" Big tap tiles: Sports (then its leagues), Markets (politics, economy, world),
 *      Stocks.
 *   2. "Follow 3 top traders": five real top traders from those picks (/api/onboarding/traders) with their real
 *      record, the first three already ticked.
 *   3. "Get it on your phone": the iPhone Add to Home Screen steps (alerts need it), or skip.
 * The end (or a skip at any step) saves the picks (POST /api/onboarding, which marks them onboarded) and opens the
 * feed filtered to them, with a one-time hint on the first card. */
import { useEffect, useRef, useState } from "react";
import { signedShort } from "@/lib/moves/copy";
import { PICK_LEAGUES, TOPICS, type Picks, type Topic } from "@/lib/picks";
import type { League } from "@/lib/moves/types";

interface Trader { wallet: string; name: string; won: number; resolved: number; profit: number }
type TabPick = Picks["tabs"][number];

export function FirstRun({ stocks, follows }: { stocks: boolean; follows: boolean }) {
  const [step, setStep] = useState(0);
  const [tabs, setTabs] = useState<TabPick[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [traders, setTraders] = useState<Trader[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, [step]);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const picks = (): Picks => ({ tabs, leagues: tabs.includes("sports") ? leagues : [], topics: tabs.includes("markets") ? topics : [] });

  useEffect(() => {
    if (step !== 1 || !follows) return;
    const p = picks();
    const q = new URLSearchParams({ tabs: p.tabs.join(","), leagues: p.leagues.join(","), topics: p.topics.join(",") });
    let gone = false;
    void fetch(`/api/onboarding/traders?${q}`).then(r => r.json() as Promise<{ traders?: Trader[] }>).then(b => {
      if (gone) return;
      const list = b.traders ?? [];
      setTraders(list);
      setChosen(new Set(list.slice(0, 3).map(t => t.wallet)));
    }).catch(() => { if (!gone) setTraders([]); });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, follows]);

  const finish = async (skipped: boolean) => {
    setBusy(true);
    const p = picks();
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skipped, picks: p.tabs.length ? p : undefined }) }).catch(() => null);
    const q = new URLSearchParams({ first: "1" });
    if (p.tabs[0] && p.tabs[0] !== "sports") q.set("tab", p.tabs[0]);
    location.assign(`/feed?${q}`);
  };
  const followChosen = async () => {
    setBusy(true);
    await Promise.all([...chosen].map(w => fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "trader", target: w }) }).catch(() => null)));
    setBusy(false);
    setStep(2);
  };

  const dots = <p className="first__dots" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map(i => <span key={i} className={i === step ? "on" : ""} />)}</p>;
  const skip = (next: () => void) => <button type="button" className="first__skip" onClick={next} disabled={busy}>Skip</button>;

  if (step === 0) return (
    <section className="first" aria-labelledby="first-h" data-step="1">
      {dots}
      <h1 id="first-h" ref={head} tabIndex={-1} className="first__h">What do you want to follow?</h1>
      <p className="first__p">Pick as many as you like. You can change it any time.</p>
      <div className="first__tiles" role="group" aria-label="Follow">
        <button type="button" className="tile" aria-pressed={tabs.includes("sports")} onClick={() => toggle(tabs, "sports", setTabs)}><b>Sports</b><span>NFL, NBA, soccer and more</span></button>
        {tabs.includes("sports") ? (
          <div className="first__chips" role="group" aria-label="Leagues">
            {PICK_LEAGUES.map(l => <button key={l} type="button" className="chip2" aria-pressed={leagues.includes(l)} onClick={() => toggle(leagues, l, setLeagues)}>{l === "college" ? "College" : l}</button>)}
          </div>
        ) : null}
        <button type="button" className="tile" aria-pressed={tabs.includes("markets")} onClick={() => toggle(tabs, "markets", setTabs)}><b>Markets</b><span>Politics, economy, world</span></button>
        {tabs.includes("markets") ? (
          <div className="first__chips" role="group" aria-label="Topics">
            {TOPICS.map(t => <button key={t.key} type="button" className="chip2" aria-pressed={topics.includes(t.key)} onClick={() => toggle(topics, t.key, setTopics)}>{t.label}</button>)}
          </div>
        ) : null}
        {stocks ? <button type="button" className="tile" aria-pressed={tabs.includes("stocks")} onClick={() => toggle(tabs, "stocks", setTabs)}><b>Stocks</b><span>Insider buys and big funds</span></button> : null}
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={() => setStep(follows ? 1 : 2)} disabled={busy}>Next</button>
      {skip(() => void finish(true))}
    </section>
  );

  if (step === 1) return (
    <section className="first" aria-labelledby="first-h" data-step="2">
      {dots}
      <h1 id="first-h" ref={head} tabIndex={-1} className="first__h">Follow 3 top traders</h1>
      <p className="first__p">We&apos;ll show you the moment they make a big move.</p>
      {traders === null ? <p className="first__p" role="status">Finding top traders…</p> : traders.length ? (
        <ul className="first__traders">
          {traders.map(t => (
            <li key={t.wallet}>
              <label className="first__trader">
                <input type="checkbox" checked={chosen.has(t.wallet)} onChange={() => setChosen(c => { const n = new Set(c); if (n.has(t.wallet)) n.delete(t.wallet); else n.add(t.wallet); return n; })} />
                <span className="first__tname">{t.name}</span>
                <span className="first__trec num">Won {t.won} of {t.resolved} · <span className={t.profit >= 0 ? "money" : "loss"}>{signedShort(t.profit)}</span> all-time</span>
              </label>
            </li>
          ))}
        </ul>
      ) : <p className="first__p">Top traders show up once they have 20 settled markets. Tap Follow on any card in the feed for now.</p>}
      <button type="button" className="btn btn--primary btn--block" onClick={() => void followChosen()} disabled={busy || traders === null}>{chosen.size ? `Follow ${chosen.size}` : "Next"}</button>
      {skip(() => setStep(2))}
    </section>
  );

  return (
    <section className="first" aria-labelledby="first-h" data-step="3">
      {dots}
      <h1 id="first-h" ref={head} tabIndex={-1} className="first__h">Get it on your phone</h1>
      <p className="first__p">On iPhone, alerts need Insidir on your Home Screen:</p>
      <ol className="first__steps">
        <li>Open insidir.com in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open Insidir from your Home Screen.</li>
      </ol>
      <button type="button" className="btn btn--primary btn--block" onClick={() => void finish(false)} disabled={busy}>Done</button>
      {skip(() => void finish(true))}
    </section>
  );
}
