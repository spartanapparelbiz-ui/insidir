"use client";
/* "Four markets. One membership." The home page's four laptops (Sports, Prediction markets, Stocks, Crypto), drawn in
 * CSS: a thin dark bezel with a camera dot and a light aluminium base with a centre notch. Each screen is a live mini
 * preview of that market from real rows (lib/markets/preview.ts), never blank. A laptop is a button: clicking it opens
 * a full-width panel below the row with a large laptop whose screen is the scrollable preview (left, ~60%) and what a
 * member gets with live proof (right, ~40%). Click it again, press × or Esc to close; click another to switch. The URL
 * hash (#sports, #markets, #stocks) opens a panel, so it can be linked to. Visitors see 3 rows, 30 minutes late;
 * members every row, live; the open panel re-reads every 30 seconds. Motion is off under prefers-reduced-motion. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoveArt } from "@/components/MoveArt";
import { Wordmark } from "@/components/Wordmark";
import { PAST } from "@/lib/copy";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import type { MarketKind, MarketPreview, PreviewRow } from "@/lib/markets/preview";
import { dollars } from "@/lib/moves/copy";

interface Info { name: string; sources: string; title: string; bullets: string[]; soon?: boolean }
/** The three laptops; crypto isn't live, so it's one "Crypto · Soon" line under them. */
const KINDS: readonly MarketKind[] = ["sports", "markets", "stocks"];
const INFO: Record<MarketKind, Info> = {
  sports: { name: "Sports", sources: "Polymarket · Kalshi", title: "Every large bet on every game.",
    bullets: ["Every position over $10K, as it's placed.", "Who placed it, and their full record.", "How it settled.", "League trackers ranked by followable ROI."] },
  markets: { name: "Prediction markets", sources: "Polymarket · Kalshi", title: "See who's on each side, and their record.",
    bullets: ["The price they paid and the price now.", "Which side the proven traders are on.", "Five topic trackers: Elections, Fed & Rates, Geopolitics, Tech & AI and Culture."] },
  stocks: { name: "Stocks", sources: "SEC Form 4 · 13F", title: "Every CEO purchase, straight from the filing.",
    bullets: ["Form 4 purchases within minutes of filing.", "Insider clusters: 3 or more insiders buying at one company.", "What the largest funds bought last quarter (13F)."] },
  crypto: { name: "Crypto", sources: "Polymarket · Kalshi", title: "Large positions on crypto price markets, and the wallets behind them.", bullets: [], soon: true },
};

const pct = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);
const signedPct = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p * 100).toFixed(1)}%`;
const isKind = (v: string): v is MarketKind => (KINDS as readonly string[]).includes(v);

/** The drawn laptop: lid (bezel, camera, screen) and base (aluminium, notch). */
function Laptop({ children, big = false }: { children: ReactNode; big?: boolean }) {
  return (
    <span className={`lap${big ? " lap--big" : ""}`}>
      <span className="lap__lid"><span className="lap__cam" aria-hidden="true" /><span className="lap__screen">{children}</span></span>
      <span className="lap__base" aria-hidden="true"><span className="lap__notch" /></span>
    </span>
  );
}

/** A laptop's small screen: the three newest rows (art, amount, outcome), or crypto's blurred names. */
function Mini({ kind, d }: { kind: MarketKind; d: MarketPreview }) {
  if (kind === "crypto") return <CryptoScreen small />;
  if (!d.rows.length) return <span className="lmini lmini--empty">{INFO[kind].name}<br />No large positions yet today.</span>;
  return (
    <span className="lmini" aria-hidden="true">
      <span className="lmini__bar"><Wordmark /></span>
      {d.rows.slice(0, 3).map(r => (
        <span key={r.id} className="lmini__row"><MoveArt art={r.art} className="art-mini" /><span className="lmini__amt">{dollars(r.amount)}</span><span className="lmini__line">{r.headline}</span></span>
      ))}
    </span>
  );
}

/** Crypto isn't live: soft, blurred market names and "Soon" over them; no rows, nothing invented. */
function CryptoScreen({ small = false }: { small?: boolean }) {
  return (
    <span className={`lcrypto${small ? " lcrypto--small" : ""}`} aria-hidden={small || undefined}>
      <span className="lcrypto__blur" aria-hidden="true">
        {["Bitcoin", "Ethereum", "Solana"].map(n => <span key={n} className="lcrypto__row"><span className="lcrypto__dot" /><span>{n} price markets</span><span className="lcrypto__bar" /></span>)}
      </span>
      <span className="lcrypto__soon">Soon</span>
    </span>
  );
}

function Row({ kind, r }: { kind: MarketKind; r: PreviewRow }) {
  return (
    <li className="lrow">
      <a className="lrow__a" href={r.href}>
        <MoveArt art={r.art} className="art40" />
        <span className="lrow__main">
          <span className="lrow__h">{r.headline}</span>
          <span className="lrow__sub">{kind === "stocks" ? [r.insider, r.filed ? `filed ${r.filed}` : null].filter(Boolean).join(" · ") : r.subline}</span>
          {r.record ? <span className="lrow__rec">{r.record}</span> : null}
          {r.note ? <span className="lrow__an"><span className="lrow__anl">Analyst note</span> {r.note}</span> : null}
        </span>
        <span className="lrow__fig">
          <b>{(r.n ?? 1) > 1 ? `${r.n} positions · ${dollars(r.amount)}` : dollars(r.amount)}</b>
          {kind === "stocks"
            ? <span className={r.change == null ? "lrow__note" : r.change >= 0 ? "lrow__note pos" : "lrow__note neg"}>{r.change == null ? "Price since: —" : `${signedPct(r.change)} since filing`}</span>
            : r.result
              ? <span className={`lrow__note ${r.result === "won" ? "pos" : r.result === "lost" ? "neg" : ""}`}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Voided"}</span>
              : <span className="lrow__note">Entry {pct(r.entry)} · now {pct(r.now)}</span>}
        </span>
      </a>
    </li>
  );
}

/** The big laptop's screen: the market's rows, scrollable. */
function Screen({ kind, d }: { kind: MarketKind; d: MarketPreview }) {
  if (kind === "crypto") return <CryptoScreen key="crypto" />;
  const more = d.total - d.rows.length;
  return (
    <span className="lscreen" key={kind}>
      <span className="lscreen__bar"><Wordmark /><span>{INFO[kind].name} · {d.window}{d.live ? " · Live" : " · 30 min delay"}</span></span>
      {d.rows.length ? <ul className="lscreen__list">{d.rows.map(r => <Row key={r.id} kind={kind} r={r} />)}</ul>
        : <span className="lscreen__empty">No large positions yet. New ones show here as they&apos;re placed.</span>}
      {!d.live && more > 0 ? <span className="lscreen__more"><b>{more.toLocaleString("en-US")} more.</b> Members see every one, live.</span> : null}
    </span>
  );
}

function Notify({ signedIn }: { signedIn: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; text?: string }>({ kind: "idle" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "busy" });
    const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: "crypto", ...(signedIn ? {} : { email }) }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string; error?: string } | null;
    setState(res?.ok ? { kind: "done", text: body?.message ?? "Thanks. You're on the list." } : { kind: "error", text: body?.error ?? "Couldn't save that now. Try again in a minute." });
  }
  if (state.kind === "done") return <p className="lval__ok" role="status">{state.text}</p>;
  return (
    <form className="lval__notify" onSubmit={submit}>
      {signedIn ? null : <><label className="sr-only" htmlFor={id}>Email</label><input id={id} className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></>}
      <button className="btn btn--secondary" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Saving…" : "Notify me"}</button>
      {state.kind === "error" ? <p className="lval__err" role="alert">{state.text}</p> : null}
    </form>
  );
}

function Value({ kind, d, trialHref, signedIn }: { kind: MarketKind; d: MarketPreview; trialHref: string; signedIn: boolean }) {
  const info = INFO[kind];
  return (
    <div className="lval">
      <p className="lval__src">{info.name} · {info.sources}</p>
      <h3 className="lval__h" id="lt-panel-h">{info.title}</h3>
      {info.soon ? <>
        <p className="lval__p">Included in your membership when it launches.</p>
        <Notify signedIn={signedIn} />
      </> : <>
        <ul className="lval__list">{info.bullets.map(b => <li key={b}>{b}</li>)}</ul>
        {d.proof.length ? (
          <dl className="lval__proof">
            {d.proof.map(p => <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd>{p.note ? <dd className="lval__note">{p.note} <span className="past">{PAST}</span></dd> : null}</div>)}
          </dl>
        ) : null}
      </>}
      {info.soon ? null : <AsOf at={d.at} live={d.live} sources={kind === "stocks" ? [SOURCES.sec, SOURCES.methodology] : [SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />}
      <div className="lval__cta">
        <a className="btn btn--primary" href={trialHref}>Start your 7-day trial</a>
        <p className="lval__fine">$1 for the first week, then $39 a month. Cancel anytime. Secure sign-in and payments by Whop.</p>
      </div>
    </div>
  );
}

export function Laptops({ data, trialHref, signedIn }: { data: Record<MarketKind, MarketPreview>; trialHref: string; signedIn: boolean }) {
  const [open, setOpen] = useState<MarketKind | null>(null);
  const [live, setLive] = useState(data);
  const buttons = useRef<Partial<Record<MarketKind, HTMLButtonElement | null>>>({});
  const panel = useRef<HTMLDivElement>(null);

  const openRef = useRef<MarketKind | null>(null);
  openRef.current = open;
  /** Bring the panel into view once it has rendered (after a hash link, or when it opens below the fold). */
  const reveal = useRef(false);

  useEffect(() => {
    if (!open || !panel.current) return;
    const top = panel.current.getBoundingClientRect().top;
    if (reveal.current || top > window.innerHeight * 0.6) {
      panel.current.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    reveal.current = false;
  }, [open]);

  const show = useCallback((k: MarketKind | null, focusBack = false) => {
    const prev = openRef.current;
    setOpen(k);
    if (focusBack && prev) buttons.current[prev]?.focus();
    const url = `${window.location.pathname}${window.location.search}${k ? `#${k}` : ""}`;
    window.history.replaceState(null, "", url);
  }, []);

  // The hash opens a panel (on load and when it changes), so a panel can be linked to.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (h === "crypto") (document.getElementById("crypto") as HTMLDetailsElement | null)?.setAttribute("open", "");
      else if (isKind(h)) { reveal.current = true; setOpen(h); }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") show(null, true); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, show]);

  // The open panel stays current: members' rows are live, visitors' move along 30 minutes behind.
  useEffect(() => {
    if (!open || open === "crypto") return;
    let stop = false;
    const read = async () => {
      const res = await fetch(`/api/markets/preview?kind=${open}`, { cache: "no-store" }).catch(() => null);
      const d = res?.ok ? ((await res.json().catch(() => null)) as MarketPreview | null) : null;
      if (d && !stop) setLive(prev => ({ ...prev, [open]: d }));
    };
    const t = setInterval(read, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, [open]);

  // Desktop: each laptop leans slowly toward the cursor (a few degrees; transform only; off for touch and under
  // prefers-reduced-motion, app/laptops.css).
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    for (const b of Object.values(buttons.current)) {
      const lap = b?.querySelector<HTMLElement>(".lap"); if (!lap) continue;
      const r = lap.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.5)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 2)));
      lap.style.setProperty("--ry", `${(dx * 7).toFixed(2)}deg`);
      lap.style.setProperty("--rx", `${(-dy * 5).toFixed(2)}deg`);
    }
  };
  const untilt = () => { for (const b of Object.values(buttons.current)) { const lap = b?.querySelector<HTMLElement>(".lap"); lap?.style.removeProperty("--ry"); lap?.style.removeProperty("--rx"); } };

  return (
    <section className="lt" aria-labelledby="lt-h">
      <div className="pg">
        <h2 id="lt-h" className="lt__h">Three markets. One membership.</h2>
        <p className="lt__sub">Click a laptop to look inside.</p>
        <div className={`lt__row${open ? " has-open" : ""}`} onPointerMove={tilt} onPointerLeave={untilt}>
          {KINDS.map((k, i) => (
            <button key={k} id={`lt-${k}`} type="button" ref={el => { buttons.current[k] = el; }} className={`lt__item rv${open === k ? " is-on" : ""}`} style={{ ["--i" as string]: i }}
              aria-expanded={open === k} aria-controls="lt-panel" onClick={() => show(open === k ? null : k)}>
              <Laptop><Mini kind={k} d={live[k]} /></Laptop>
              <span className="lt__name">{INFO[k].name}{INFO[k].soon ? <span className="soon soon--short">Soon</span> : null}</span>
              <span className="lt__src">{INFO[k].sources}</span>
            </button>
          ))}
        </div>
        <details className="lt__soon" id="crypto">
          <summary>Crypto · Soon</summary>
          <p>Large positions on crypto price markets, and the wallets behind them. Included in your membership when it launches.</p>
          <Notify signedIn={signedIn} />
        </details>
        <div id="lt-panel" ref={panel} role="region" aria-labelledby={open ? "lt-panel-h" : undefined} aria-label={open ? undefined : "Market preview"} className="lt__panel" hidden={!open} data-kind={open ?? undefined}>
          {open ? <div className="lt__panelin">
            <button type="button" className="lt__x" aria-label="Close preview" onClick={() => show(null, true)}>×</button>
            <div className="lt__big"><Laptop big><Screen kind={open} d={live[open]} /></Laptop></div>
            <Value key={open} kind={open} d={live[open]} trialHref={trialHref} signedIn={signedIn} />
          </div> : null}
        </div>
      </div>
    </section>
  );
}
