"use client";
/* The /go funnel on the client (app/go/page.tsx): one screen at a time, a thin progress bar, a back arrow, no site nav.
 * Each answer is one tap and moves on (the topics take a Continue). Every step is recorded (/api/go, go_step) with the
 * time spent on it. Mobile first: the page is the screen. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Art } from "@/components/sky/Art";
import { Logo } from "@/components/sky/Logo";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { AnimatedList } from "@/components/magicui/animated-list";
import { STAKES, TOPICS, VENUES, topicWords, type Answers, type GoVenue, type Stake, type Topic } from "@/lib/go/answers";
import type { Aha } from "@/lib/go/data";
import type { Art as ArtT } from "@/lib/sky/art";
import type { RecordRow } from "@/lib/nx/data";

type Step = "hook" | "topics" | "venue" | "stake" | "building" | "aha" | "paywall" | "checkout" | "unlocked";
const ORDER: Step[] = ["hook", "topics", "venue", "stake", "building", "aha", "paywall", "checkout"];
interface HookBet { amount: number; side: string; priceThen: number; pnl: number; title: string; at: number; art: ArtT }

const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
const c = (p: number) => `${Math.round(p * 100)}¢`;
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });

/** A step shown (no ms), or the time spent on it when they move on (ms). */
function track(step: Step, ms?: number) { void fetch("/api/go", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ms === undefined ? { step } : { step, ms }) }).catch(() => undefined); }
async function save(a: Partial<Answers>) { await fetch("/api/go", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: a }) }).catch(() => undefined); }

export function Go({ now, hook, answers, unlocked, proof, elementsUrl, price, trial, signedInAs, ageConfirmed }: {
  now: number; hook: { bet: HookBet | null; hour: number }; answers: Answers | null; unlocked: boolean; proof: RecordRow[];
  elementsUrl: string; price: number; trial: { days: number; fee: number }; signedInAs: string | null; ageConfirmed: boolean;
}) {
  // A visitor back from the paywall (same browser, 7 days) lands on their own picks with fresh data.
  const back = Boolean(answers && answers.topics.length && answers.stake && !unlocked);
  const [step, setStep] = useState<Step>(unlocked ? "unlocked" : back ? "aha" : "hook");
  const [topics, setTopics] = useState<Topic[]>(answers?.topics ?? []);
  const [venue, setVenue] = useState<GoVenue | null>(answers?.venue ?? null);
  const [stake, setStake] = useState<Stake | null>(answers?.stake ?? null);
  const [remind, setRemind] = useState(answers?.remind !== false);
  const [lines, setLines] = useState<Array<number | null>>([null, null, null]);
  const [aha, setAha] = useState<Aha | null>(null);
  const since = useRef(Date.now());
  const go = useCallback((next: Step) => { track(step, Date.now() - since.current); since.current = Date.now(); setStep(next); window.scrollTo(0, 0); }, [step]);
  const backTo = () => { const i = ORDER.indexOf(step); if (i > 0) { const prev = ORDER[i - 1] === "building" ? "stake" : ORDER[i - 1]!; setStep(prev); } };

  // Building: three real queries, each line ticking in as it returns; at least 3 seconds, then their cards.
  useEffect(() => {
    if (step !== "building") return;
    let gone = false;
    const t0 = Date.now();
    void save({ topics, venue, stake, remind }).then(async () => {
      const ahaP = fetch("/api/go?aha=1").then(r => r.json() as Promise<Aha>).catch(() => null);
      for (const [i, line] of (["wallets", "bets", "pricing"] as const).entries()) {
        const n = await fetch(`/api/go?build=${line}`).then(r => r.json() as Promise<{ n: number }>).then(x => x.n).catch(() => 0);
        if (gone) return;
        setLines(l => l.map((v, j) => (j === i ? n : v)));
      }
      const a = await ahaP;
      await new Promise(ok => setTimeout(ok, Math.max(0, 3200 - (Date.now() - t0))));
      if (!gone) { setAha(a); go("aha"); }
    });
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // The aha (and the unlocked cards after paying), fresh each time it's shown without the building screen.
  useEffect(() => { if ((step === "aha" || step === "unlocked") && !aha) void fetch("/api/go?aha=1").then(r => r.json() as Promise<Aha>).then(setAha).catch(() => undefined); }, [step, aha]);
  // Each step once it's on screen: the funnel counts who saw it (the hook included, and the checkout opening).
  useEffect(() => { track(step); }, [step]);

  const words = topicWords(topics);
  const idx = Math.max(0, ORDER.indexOf(step));
  const pct = step === "unlocked" ? 100 : Math.round(((idx + 1) / ORDER.length) * 100);
  return (
    <div className="sk go" data-testid="go" data-step={step}>
      <header className="go-top">
        {step !== "hook" && step !== "unlocked" && step !== "building" ? <button type="button" className="go-back" aria-label="Back" onClick={backTo} data-testid="go-back">←</button> : <span className="go-back" />}
        <Logo href={null} size={18} />
        <span className="go-back" />
        <span className="go-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><i style={{ width: `${pct}%` }} /></span>
      </header>
      <main className="go-main">
        {step === "hook" ? (
          <section className="go-step" data-testid="go-hook">
            <p className="go-kicker"><span className="sk-live" aria-hidden="true" /> <b data-testid="go-hour">{hook.hour.toLocaleString("en-US")}</b> millionaire bet{hook.hour === 1 ? "" : "s"} in the last hour</p>
            {hook.bet ? (
              <AnimatedList delay={600}>
                <div key="b" className="go-hookcard op-edge">
                  <Art art={hook.bet.art} size={40} />
                  <p className="go-hookcard__t">A {hook.bet.pnl >= 0 ? "+" : "−"}{k(Math.abs(hook.bet.pnl))} wallet bet <b>{k(hook.bet.amount)}</b> on <b>{hook.bet.side}</b> at {c(hook.bet.priceThen)}</p>
                  <p className="go-hookcard__m">{hook.bet.title} · 1 hour ago</p>
                </div>
              </AnimatedList>
            ) : <p className="go-muted">Wallets that have made $1M+ on Polymarket bet every hour. See where.</p>}
            <h1 className="go-h">See what Polymarket&apos;s millionaires are betting, the moment they bet.</h1>
            <button type="button" className="go-cta" onClick={() => go("topics")} data-testid="go-start">Show me what they&apos;re betting</button>
          </section>
        ) : null}

        {step === "topics" ? (
          <section className="go-step" data-testid="go-topics">
            <h1 className="go-h">What do you bet on?</h1>
            <p className="go-muted">Pick all that apply.</p>
            <div className="go-chips">{TOPICS.map(([key, label]) => (
              <button key={key} type="button" className="go-chip" aria-pressed={topics.includes(key)} onClick={() => setTopics(t => (t.includes(key) ? t.filter(x => x !== key) : [...t, key]))}>{label}</button>
            ))}</div>
            <button type="button" className="go-cta" disabled={!topics.length} onClick={() => go("venue")} data-testid="go-continue">Continue</button>
          </section>
        ) : null}

        {step === "venue" ? (
          <section className="go-step" data-testid="go-venue">
            <h1 className="go-h">Where do you bet?</h1>
            <div className="go-opts">{VENUES.map(([key, label]) => <button key={key} type="button" className="go-opt" aria-pressed={venue === key} onClick={() => { setVenue(key); go("stake"); }}>{label}</button>)}</div>
          </section>
        ) : null}

        {step === "stake" ? (
          <section className="go-step" data-testid="go-stake">
            <h1 className="go-h">What&apos;s a normal bet for you?</h1>
            <div className="go-opts">{STAKES.map(([key, label]) => <button key={key} type="button" className="go-opt" aria-pressed={stake === key} onClick={() => { setStake(key); go("building"); }}>{label}</button>)}</div>
          </section>
        ) : null}

        {step === "building" ? (
          <section className="go-step" data-testid="go-building" aria-live="polite">
            <h1 className="go-h">Finding your millionaire bets…</h1>
            <ul className="go-lines">
              <li data-done={lines[0] !== null}>{lines[0] == null ? "Checking the millionaire wallets…" : <>Checking <b>{lines[0]!.toLocaleString("en-US")}</b> millionaire wallets…</>}</li>
              <li data-done={lines[1] !== null}>{lines[1] == null ? `Finding today's bets on ${words}…` : <><b>{lines[1]!.toLocaleString("en-US")}</b> bet{lines[1] === 1 ? "" : "s"} in {words} today…</>}</li>
              <li data-done={lines[2] !== null}>{lines[2] == null ? "Pricing on Kalshi and Polymarket…" : <>Pricing on Kalshi: <b>{lines[2]!.toLocaleString("en-US")}</b> market{lines[2] === 1 ? "" : "s"} on both</>}</li>
            </ul>
          </section>
        ) : null}

        {step === "aha" || step === "unlocked" ? (
          <section className="go-step" data-testid={step === "unlocked" ? "go-unlocked" : "go-aha"}>
            {step === "unlocked" ? <p className="go-in" role="status" data-testid="go-in">You&apos;re in. Everything is unlocked.</p> : back ? <p className="go-kicker">Your {words} picks are ready, with fresh data.</p> : null}
            <h1 className="go-h">What millionaires are betting on {words} today</h1>
            {aha === null ? <p className="go-muted" role="status">Loading…</p> : aha.cards.length ? (
              <ol className="go-cards">
                {aha.cards.map((card, i) => (
                  <li key={card.market} className="go-card op-edge" data-locked={!card.side} data-testid={`go-card-${i}`}>
                    <Art art={card.art} size={32} />
                    <p className="go-card__t">{card.title}</p>
                    <p className="go-card__m"><b>{k(card.dollars)}</b> of millionaire money today</p>
                    {card.side ? <p className="go-card__s"><b>{k(card.side.dollars)}</b> on <b>{card.side.label}</b> from {card.side.wallets} wallet{card.side.wallets === 1 ? "" : "s"}{card.side.priceNow !== null ? ` · now ${c(card.side.priceNow)}` : ""}</p>
                      : <p className="go-card__s go-blur" aria-label="Side hidden until you join">On ████████ from █ wallets · now ██¢</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="go-muted" data-testid="go-none">No $1M+ wallet has bet on {words} in the last 24 hours yet. They bet every hour across markets: the board shows them as they happen.</p>}
            {aha && aha.more ? <p className="go-more" data-testid="go-more">+{aha.more} more today</p> : null}
            {aha?.stake && step === "aha" ? <p className="go-stake" data-testid="go-stake-line">Following {aha.stake.name} at ${aha.stake.amount} a bet: <b className={aha.stake.net >= 0 ? "sk-up" : "sk-down"}>{aha.stake.net >= 0 ? "+" : "−"}${Math.abs(aha.stake.net).toLocaleString("en-US")}</b> over {aha.stake.settled.toLocaleString("en-US")} settled. Past results, not a promise.</p> : null}
            {step === "aha" ? <button type="button" className="go-cta" onClick={() => go("paywall")} data-testid="go-unlock">Unlock every millionaire bet for ${trial.fee}</button>
              : <a className="go-cta" href="/" data-testid="go-home">Go to my home</a>}
          </section>
        ) : null}

        {step === "paywall" ? (
          <section className="go-step" data-testid="go-paywall">
            <h1 className="go-h">Every millionaire bet on {words}, live.</h1>
            <ul className="go-bullets">
              <li>Millionaire money on any market</li>
              <li>Pings the moment they bet</li>
              <li>The live Millionaires&apos; board</li>
            </ul>
            <ol className="go-timeline" data-testid="go-timeline">
              <li><b>Today</b>: ${trial.fee}, everything unlocked</li>
              <li><b>{day(now + 86_400_000)}</b>: we remind you</li>
              <li><b>{day(now + trial.days * 86_400_000)}</b>: ${price}/month. Cancel in 2 taps.</li>
            </ol>
            <label className="go-toggle"><input type="checkbox" checked={remind} onChange={e => { setRemind(e.target.checked); void save({ topics, venue, stake, remind: e.target.checked }); }} data-testid="go-remind" /> Remind me before I&apos;m charged</label>
            {proof.length ? (
              <ul className="go-proof" data-testid="go-proof" aria-label="Real tracker records">
                {proof.map(r => <li key={r.slug}><span>{r.name}</span><b className={r.returnPct >= 0 ? "sk-up" : "sk-down"}>{r.returnPct >= 0 ? "+" : "−"}{Math.abs(r.returnPct * 100).toFixed(1)}%</b><small>{r.settled.toLocaleString("en-US")} settled</small></li>)}
              </ul>
            ) : null}
            <p className="go-price" data-testid="go-price">${trial.fee} today for {trial.days} days, then ${price}/month. Cancel anytime.</p>
            <button type="button" className="go-cta" onClick={() => go("checkout")} data-testid="go-pay">Start for ${trial.fee}</button>
            <p className="go-fine">Secure payment by Whop · Cancel anytime · Information, not advice.</p>
          </section>
        ) : null}

        {step === "checkout" ? (
          <section className="go-step go-step--pay" data-testid="go-checkout">
            <p className="go-price">${trial.fee} today for {trial.days} days, then ${price}/month. Cancel anytime.</p>
            <StartCheckout enclosed elementsUrl={elementsUrl} signedInAs={signedInAs} next="/go?unlocked=1" ageConfirmed={ageConfirmed} />
            <p className="go-fine">Secure payment by Whop · Cancel anytime · Information, not advice.</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
