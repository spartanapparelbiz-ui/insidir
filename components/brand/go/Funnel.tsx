"use client";
/* /go: the funnel. Every step is a full-viewport stage over the globe at 40% brightness, one question per screen, a thin
 * progress bar, one tap per step, the spec's motion on each step (each step is a new stage: StageMotion plays it).
 *   1 hook · 2 what do you bet on (image tiles) · 3 where · 4 size · 5 building (real counts) · 6 the aha (3 markets,
 *   the first whole) · 7 paywall · 8 checkout (Whop, embedded) · 9 the same markets, now whole · sign in with Whop
 *   (one redirect) · 10 answers saved · 11 follow your first millionaire · 12 push · home.
 * The answers live in localStorage until they are saved to the account (POST /api/go/save) after sign-in. */
import { BrandPicture } from "@/components/brand/BrandPicture";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { beacon } from "@/components/app/beacon";
import { PingSetup } from "@/components/app/PingSetup";
import { CATEGORIES, category as categoryInfo, categoryPhoto, type CategorySlug } from "@/lib/brand/categories";
import type { AhaCard, GoData } from "@/lib/go/data";
import { SIZES, WHERE, stakeFor, type Size, type Where } from "@/lib/go/data";
import { dollars } from "@/lib/money";
import { Arrow, Lines, m, signedDollars, TierBadge } from "../Bits";
import { MoneyCard } from "../MoneyCard";
import { PAY_BULLETS, Paywall } from "../Paywall";
import { BrandFoot } from "../Nav";

type WhopCheckout = { checkout: { create: (o: Record<string, unknown>) => { create: (k: "checkout", p?: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void } } } };
declare global { interface Window { WhopElements?: (o?: Record<string, unknown>) => WhopCheckout } }

export type Step = "hook" | "cats" | "where" | "size" | "building" | "aha" | "paywall" | "checkout" | "unlocked" | "save" | "follow" | "push";
const ORDER: Step[] = ["hook", "cats", "where", "size", "building", "aha", "paywall", "checkout", "unlocked", "save", "push", "follow"];
/** Where Back goes from each step before paying ("building" plays by itself, so Back skips it). After paying there's no
 * Back: the steps from "unlocked" on set the account up. The first step's Back is the home page. */
export const BACK: Partial<Record<Step, Step>> = { cats: "hook", where: "cats", size: "where", aha: "size", paywall: "aha", checkout: "paywall" };
const KEY = "insidir_go";

interface Answers { cats: CategorySlug[]; where: Where | null; size: Size | null; remind: boolean; /** Where to land at the end (a check they paid from). */ next?: string | null }
const load = (): Answers => { try { return { cats: [], where: null, size: null, remind: true, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { cats: [], where: null, size: null, remind: true }; } };
/** Only our own pages. */
export const safeNextPath = (v: string | null | undefined): string | null => (v && /^\/(read\/[A-Za-z0-9]{4,40})?$/.test(v) ? v : null);
const store = (a: Answers) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ } };
const st = (d: number, extra: CSSProperties = {}): { "data-m": "settle"; style: CSSProperties } => ({ "data-m": "settle", style: { ...extra, "--d": `${d}s` } as CSSProperties });
const names = (cats: readonly CategorySlug[]) => { const n = cats.map(c => categoryInfo(c).name); return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`; };

function GoStage({ children, testid }: { children: ReactNode; testid: string }) {
  return <section key={testid} className="b-stage b-stage--clear" data-testid={testid}><div className="b-stage__in b-center" style={{ width: "100%" }}>{children}</div></section>;
}


function Checkout({ elementsUrl, ageConfirmed }: { elementsUrl: string; ageConfirmed: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [age, setAge] = useState(ageConfirmed);
  const [state, setState] = useState<"age" | "opening" | "ready" | "error" | "unconfigured">(ageConfirmed ? "opening" : "age");
  const open = useCallback(async () => {
    setState("opening");
    const res = await fetch("/api/checkout/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ age18: true }) }).catch(() => null);
    const o = (await res?.json().catch(() => null)) as { planId?: string; metadata?: Record<string, string>; email?: string | null; returnUrl?: string } | null;
    if (!res?.ok || !o?.planId) { setState(res?.status === 503 ? "unconfigured" : "error"); return; }
    if (!window.WhopElements) {
      await new Promise<void>((ok, fail) => { const s = document.createElement("script"); s.src = elementsUrl; s.async = true; s.onload = () => ok(); s.onerror = () => fail(new Error("script")); document.head.appendChild(s); }).catch(() => null);
    }
    if (!box.current || !window.WhopElements) { setState("error"); return; }
    const c = window.WhopElements({ appearance: { theme: { appearance: "dark" } } }).checkout.create({
      plan: o.planId, metadata: o.metadata, returnUrl: o.returnUrl,
      onComplete: (r: { result?: string }) => { if (r.result === "payment") location.assign("/go?step=unlocked"); },
    });
    c.create("checkout", o.email ? { buyerEmail: o.email, lockBuyerEmail: true } : {}).mount(box.current);
    setState("ready");
    beacon("checkout_start", "go");
  }, [elementsUrl]);
  useEffect(() => { if (age) void open().catch(() => setState("error")); }, [age, open]);
  return (
    <div className="b-col" data-testid="go-checkout">
      <label className="b-toggle b-glass b-pad"  data-testid="age-18" {...st(0.5, { justifyContent: "flex-start", gap: 12 })}>
        <input type="checkbox" checked={age} disabled={age && state !== "age"} onChange={e => setAge(e.target.checked)} /><span>I&apos;m 18 or older.</span>
      </label>
      {state === "opening" ? <div className="b-glass b-pad b-skel" aria-busy="true" style={{ minHeight: 320 }}><p className="b-small" role="status">Opening secure checkout…</p><span className="b-skel__line" style={{ height: 44 }} /><span className="b-skel__line" style={{ height: 44 }} /><span className="b-skel__line" style={{ height: 44, width: "60%" }} /></div> : null}
      {state === "error" ? <p className="b-msg" role="alert">The checkout didn&apos;t open. <button type="button" className="b-btn b-panel-pill" onClick={() => void open()}>Try again</button></p> : null}
      {state === "unconfigured" ? <p className="b-msg" role="alert">Checkout isn&apos;t open yet. Come back soon.</p> : null}
      <div ref={box} className="b-glass" style={{ overflow: "hidden", padding: 8, background: "#fff", color: "#000", minHeight: state === "ready" ? 320 : 0 }} hidden={state !== "ready"} data-testid="go-checkout-frame" />
      <p className="b-small">Apple Pay, Google Pay or card · Secure checkout by Whop · Cancel anytime in Account</p>
    </div>
  );
}

const BackArrow = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 6 9l5 5" /></svg>;

function AhaCards({ cards, more }: { cards: AhaCard[]; more: number }) {
  return (
    <>
      <div className="b-cards3" data-testid="aha-cards">
        {cards.map((c, i) => (
          <div key={c.m.marketId}  {...st(0.5 + i * 0.1, { display: "grid", gap: 8 })}>
            <div className="b-cardimg"><BrandPicture src={categoryPhoto(c.m.category).src} fill sizes="(max-width: 860px) 100vw, 33vw" /></div>
            <MoneyCard m={c.m} positions={c.positions} locked={c.locked} testid={c.locked ? "aha-locked" : "aha-open"} />
          </div>
        ))}
      </div>
      {more ? <p className="b-small" style={{ marginTop: 14 }} {...m("quiet", 0.9)} data-testid="aha-more">+{more} more today</p> : null}
    </>
  );
}

export function Funnel({ initial, start, now, elementsUrl, signedIn, ageConfirmed, vapidKey, bg }: {
  initial: GoData; start: Step; now: number; elementsUrl: string; signedIn: boolean; ageConfirmed: boolean; vapidKey: string | null;
  /** The globe at 40% brightness, fixed behind every step (rendered by the page). */
  bg: ReactNode;
}) {
  const [step, setStep] = useState<Step>(start);
  const [a, setA] = useState<Answers>({ cats: [], where: null, size: null, remind: true });
  const [d, setD] = useState<GoData>(initial);
  const [ticks, setTicks] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s = load();
    const next = safeNextPath(new URLSearchParams(location.search).get("next"));
    if (next) { s.next = next; store(s); }
    setA(s);
  }, []);
  const put = (p: Partial<Answers>) => setA(prev => { const n = { ...prev, ...p }; store(n); return n; });
  /** Each step is its own history entry (the browser's Back works too), carrying the UTM tags along. */
  const go = (s: Step, how: "push" | "replace" = "push") => {
    setStep(s); window.scrollTo(0, 0);
    try {
      const utm = location.search.slice(1).split("&").filter(x => x.startsWith("utm_")).join("&");
      history[how === "push" ? "pushState" : "replaceState"]({ step: s }, "", `/go?step=${s}${utm ? `&${utm}` : ""}`);
    } catch { /* ok */ }
    beacon("go_step", s);
  };
  useEffect(() => {
    const on = (e: PopStateEvent) => { const s = (e.state as { step?: Step } | null)?.step ?? (new URLSearchParams(location.search).get("step") as Step | null); if (s && ORDER.includes(s)) { setStep(s); window.scrollTo(0, 0); } };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const fetchData = useCallback(async (cats: readonly string[]) => {
    const r = await fetch(`/api/go?cats=${cats.join(",")}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) { const j = (await r.json()) as GoData; setD(j); return j; }
    return null;
  }, []);

  // Building: the real counts tick in, then the aha.
  useEffect(() => {
    if (step !== "building") return;
    setTicks(0);
    void fetchData(a.cats);
    const ts = [700, 1500, 2300, 3200].map((t, i) => setTimeout(() => (i < 3 ? setTicks(i + 1) : go("aha", "replace")), t));
    return () => ts.forEach(clearTimeout);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  // Unlocked: wait for Whop to tell us they paid (the webhook links the membership to this visitor).
  useEffect(() => {
    if (step !== "unlocked") return;
    let n = 0, stop = false;
    const poll = async () => { const j = await fetchData(load().cats); if (stop) return; if (!j?.paid && n++ < 20) setTimeout(poll, 1500); };
    void poll();
    return () => { stop = true; };
  }, [step, fetchData]);
  // After sign-in: save the answers, then follow.
  useEffect(() => {
    if (step !== "save") return;
    const s = load();
    void fetch("/api/go/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
      .then(r => { if (r.ok) { void fetchData(s.cats); go("push", "replace"); } else setMsg("We couldn't save your picks. Try again."); }).catch(() => setMsg("No connection. Try again."));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = (ORDER.indexOf(step) + 1) / ORDER.length;
  const hook = d.hook;
  const cats = a.cats.length ? a.cats : [];
  const firstCat = cats[0] ? categoryInfo(cats[0]).name : "your categories";
  const stake = stakeFor(a.size), rec = d.proof?.record;

  let body: ReactNode = null;
  switch (step) {
    case "hook":
      body = (
        <GoStage testid="go-hook">
          <Lines as="h1" lines={["Bet with the", "millionaires"]} />
          {hook ? (
            <div className="b-glass b-pad"  {...st(0.6, { marginTop: 26, maxWidth: 560, width: "100%", textAlign: "left", display: "grid", gap: 8 })} data-testid="go-hook-bet">
              <span className="b-label" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="b-dot" aria-hidden="true" /> Live · {d.pulse.count} millionaire {d.pulse.count === 1 ? "bet" : "bets"} {d.pulse.window === "hour" ? "in the last hour" : "today"}</span>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px", lineHeight: 1.35 }}>
                A {hook.pnl !== null ? `${signedDollars(hook.pnl)} ` : "$1M+ "}wallet just bet <span className="b-num">{dollars(hook.amount)}</span> on {hook.title}.
              </p>
            </div>
          ) : <p className="b-sub" {...m("lift", 0.58)}>Every big bet on Polymarket and Kalshi, from wallets that made $1M+.</p>}
          <div className="b-ctas"><button type="button" className="b-btn b-btn-lg b-primary" onClick={() => go("cats")} data-testid="go-next" {...st(0.9)}>Show me what they&apos;re betting<Arrow /></button></div>
        </GoStage>
      );
      break;
    case "cats":
      body = (
        <GoStage testid="go-cats">
          <div className="b-head"><Lines as="h1" lines={["What do you", "bet on?"]} size={64} /></div>
          <div className="b-tiles" role="group" aria-label="Categories">
            {CATEGORIES.map((c, i) => {
              const on = a.cats.includes(c.slug);
              return (
                <button key={c.slug} type="button" className="b-tile" aria-pressed={on} data-testid="go-tile" data-cat={c.slug} {...st(0.4 + i * 0.03)}
                  onClick={() => put({ cats: on ? a.cats.filter(x => x !== c.slug) : [...a.cats, c.slug] })}>
                  <span className="b-tile__img"><BrandPicture src={categoryPhoto(c.slug).src} fill sizes="(max-width: 552px) 66vw, (max-width: 1160px) 50vw, 440px" /></span>
                  <span className="b-tile__check" aria-hidden="true"><svg viewBox="0 0 11 9" fill="none"><path d="M1 4.5 4 7.5 10 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span className="b-tile__name">{c.name}</span>
                </button>
              );
            })}
          </div>
          <div className="b-ctas"><button type="button" className="b-btn b-btn-lg b-primary" disabled={!a.cats.length}  onClick={() => go("where")} data-testid="go-next" {...st(1, { opacity: a.cats.length ? 1 : 0.5 })}>Continue<Arrow /></button></div>
        </GoStage>
      );
      break;
    case "where":
    case "size": {
      const list = step === "where" ? WHERE.map(([k, l]) => [k, l] as const) : SIZES.map(([k, l]) => [k, l] as const);
      body = (
        <GoStage testid={`go-${step}`}>
          <div className="b-head"><Lines as="h1" lines={step === "where" ? ["Where do", "you bet?"] : ["Normal", "bet size?"]} size={64} /></div>
          <div className="b-answers">
            {list.map(([k, l], i) => (
              <button key={k} type="button" className="b-btn b-btn-lg b-ghost" data-testid="go-answer" data-value={k} {...st(0.5 + i * 0.07)}
                onClick={() => { if (step === "where") { put({ where: k as Where }); go("size"); } else { put({ size: k as Size }); go("building"); } }}>{l}<Arrow /></button>
            ))}
          </div>
        </GoStage>
      );
      break;
    }
    case "building": {
      const lines = [
        `Reading ${d.build.wallets.toLocaleString("en-US")} millionaire wallets`,
        `${cats.reduce((s, c) => s + (d.build.perCat[c] ?? 0), 0)} bets in ${names(cats.length ? cats : [])} today`,
        a.where === "kalshi" || a.where === "sportsbook" ? "Pricing on Kalshi" : "Pricing on Kalshi and Polymarket",
      ];
      body = (
        <GoStage testid="go-building">
          <div className="b-head"><Lines as="h1" lines={["Building", "your board."]} size={64} /></div>
          <ul className="b-ticks" data-testid="go-ticks">{lines.map((l, i) => <li key={i} data-done={ticks > i ? "true" : "false"} className={ticks > i ? "b-new" : ""} style={{ opacity: ticks >= i ? 1 : 0.35 }}>{l}…</li>)}</ul>
        </GoStage>
      );
      break;
    }
    case "aha":
    case "unlocked": {
      const unlocked = step === "unlocked";
      const waiting = unlocked && !d.paid;
      body = (
        <GoStage testid={unlocked ? "go-unlocked" : "go-aha"}>
          <div className="b-head"><Lines as="h1" lines={unlocked ? ["You're in."] : ["Where they're", "betting now."]} size={64} /></div>
          {waiting ? <p className="b-sub" role="status" data-testid="go-confirming">Confirming your payment with Whop…</p> : d.aha.cards.length ? <AhaCards cards={d.aha.cards} more={d.aha.more} /> : <p className="b-empty">No millionaire money in {firstCat} in the last week yet.</p>}
          {rec && !unlocked ? <p className="b-small" style={{ marginTop: 16 }} {...m("quiet", 1)} data-testid="go-stake">${stake} on every {d.proof!.label}: {signedDollars(rec.net * stake / 100)} over {rec.n.toLocaleString("en-US")} settled. Past results, not a promise.</p> : null}
          <div className="b-ctas">
            {unlocked
              ? <a className="b-btn b-btn-lg b-primary" href={signedIn ? "/go?step=save" : `/login/start?next=${encodeURIComponent("/go?step=save")}`} data-testid="go-signin" aria-disabled={waiting}  {...st(1.1, { opacity: waiting ? 0.5 : 1 })}>{signedIn ? "Continue" : "Sign in with Whop"}<Arrow /></a>
              : <button type="button" className="b-btn b-btn-lg b-primary" onClick={() => go("paywall")} data-testid="go-next" {...st(1.1)}>See every side<Arrow /></button>}
          </div>
        </GoStage>
      );
      break;
    }
    case "paywall":
      body = (
        <GoStage testid="go-paywall">
          <div className="b-glass b-pad"  {...st(0.3, { width: "100%", maxWidth: 480, textAlign: "left" })}>
            <Paywall now={now} href="/go?step=checkout" testid="paywall" bullets={PAY_BULLETS}
              headline={cats.length ? `See which side they took in ${names(cats)}.` : "See which side the millionaires took."}
              onStart={remind => put({ remind })} />
          </div>
        </GoStage>
      );
      break;
    case "checkout":
      body = (
        <GoStage testid="go-checkout-step">
          <div className="b-head"><Lines as="h1" lines={["Start for $1."]} size={56} /></div>
          <Checkout elementsUrl={elementsUrl} ageConfirmed={ageConfirmed} />
        </GoStage>
      );
      break;
    case "save":
      body = <GoStage testid="go-save"><Lines as="h1" lines={["Saving", "your picks."]} size={64} />{msg ? <p className="b-msg" role="alert">{msg}</p> : null}</GoStage>;
      break;
    case "follow":
      body = (
        <GoStage testid="go-follow">
          <div className="b-head"><Lines as="h1" lines={["Follow your first", "millionaire."]} size={56} /></div>
          <div className="b-col">
            {d.wallets.length ? d.wallets.map((w, i) => (
              <div key={w.wallet} className="b-glass b-pad"  {...st(0.5 + i * 0.08, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left" })} data-testid="go-wallet">
                <span style={{ display: "grid", gap: 4 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}><TierBadge tier={w.tier} /><span className="b-small">{w.short}</span></span>
                  <span style={{ fontWeight: 500 }}><span className="b-up">{signedDollars(w.pnl)}</span> all time · {w.bets} bets of $5K+ in 30 days</span>
                </span>
                <button type="button" className="b-btn b-panel-pill" aria-pressed={followed.has(w.wallet)} data-testid="go-follow-btn"
                  onClick={async () => { const r = await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "trader", target: w.wallet }) }).catch(() => null); if (r?.ok) setFollowed(new Set([...followed, w.wallet])); }}>
                  {followed.has(w.wallet) ? "Following" : "Follow"}
                </button>
              </div>
            )) : <p className="b-empty">No millionaire wallet has bet in your categories this month yet. You&apos;ll see them on your board.</p>}
          </div>
          <div className="b-ctas"><button type="button" className="b-btn b-btn-lg b-primary" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* ok */ } location.assign(a.next ?? "/"); }} data-testid="go-next" {...st(1)}>Continue<Arrow /></button></div>
        </GoStage>
      );
      break;
    case "push":
      body = (
        <GoStage testid="go-push">
          <PingSetup variant="stage" vapidKey={vapidKey} categories={cats.length ? names(cats) : undefined} onContinue={() => go("follow")} />
        </GoStage>
      );
      break;
  }
  return (
    <main className="b-root" data-testid="go" data-step={step}>
      {bg}
      <div className="b-go-bar" role="progressbar" aria-label="Your progress" aria-valuemin={1} aria-valuemax={ORDER.length} aria-valuenow={ORDER.indexOf(step) + 1}
        aria-valuetext={`Step ${ORDER.indexOf(step) + 1} of ${ORDER.length}`} data-testid="go-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
      {step === "hook" ? <a className="b-go-back" href="/" aria-label="Back to the home page" data-testid="go-back"><BackArrow /></a>
        : BACK[step] ? <button type="button" className="b-go-back" aria-label="Back" data-testid="go-back" onClick={() => go(BACK[step]!)}><BackArrow /></button> : null}
      <div key={step} style={{ position: "relative", zIndex: 2 }}>{body}</div>
      <div style={{ position: "relative", zIndex: 2 }}><BrandFoot inline /></div>
    </main>
  );
}
