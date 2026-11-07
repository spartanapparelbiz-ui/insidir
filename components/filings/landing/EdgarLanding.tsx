"use client";
/* The /edgar landing (docs/RESEARCH-DESK.md): a calm, product-first page whose hero is the working desk itself, filled
 * with the last 72 hours of SEC filings that arrived in the HTML. Below it: the numbers, four features each shown with
 * a live card built from the same real filings (nothing invented), how to read a row, the price, straight answers.
 * Anything that needs a member opens the membership drawer (the shared Paywall into the real checkout). The disclaimer
 * is pinned to the bottom of the viewport. Facts as filed only. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Paywall } from "@/components/brand/Paywall";
import { RESEARCH_DISCLAIMER } from "@/lib/copy";
import { itemLabel } from "@/lib/filings/codes";
import { price, qty, usd } from "@/lib/filings/format";
import type { Preview, PreviewRow } from "@/lib/filings/preview";
import { PLANS, TRIAL } from "@/lib/plans";
import { api, useNow, usePoll } from "../hooks";
import { IconArrow, IconTick } from "./icons";
import { Avatar, CodePill, compact, feedState, LiveDesk, WORD } from "./LiveDesk";
import { FilingGlobe, type GlobeMark } from "./FilingGlobe";
import { LandingMotion } from "./Motion";

export const CHECKOUT = "/go?step=checkout&from=edgar";
const STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const at = (ms: number) => `${STAMP.format(new Date(ms))} ET`;

export function EdgarLanding({ initial }: { initial: Preview }) {
  const [data, setData] = useState(initial);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const clock = useNow(1000);
  // Every visitor shares the same cached JSON; refreshed every 30 s while the tab is visible.
  usePoll(async () => {
    const next = await api<Preview>("/api/edgar/preview");
    setData(prev => {
      const seen = new Set(prev.rows.map(r => r.id));
      setFresh(new Set(next.rows.filter(r => !seen.has(r.id)).map(r => r.id)));
      return next;
    });
  }, 30_000, 300_000);
  const [drawer, setDrawer] = useState<string | null>(null);
  const ask = useCallback((headline: string) => setDrawer(headline), []);
  const feed = feedState(data);

  return (
    <div className="lp">
      <LandingMotion />
      <div className="lp-glow" aria-hidden="true" />
      <header className="lp-hero lp-wrap">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow" data-reveal><span className={`lp-dot${feed.live ? " is-live" : ""}`} />{feed.label}</span>
          <h1 className="lp-h1" data-reveal="1">Stop trading on 3{"\u2011"}day media lag.</h1>
          <p className="lp-lede" data-reveal="2">Direct SEC Form 4 and 8-K intelligence for equities and prediction markets. Every filing lands here about a minute after EDGAR accepts it. The desk below is live; try it, no account needed.</p>
          <div className="lp-ctas" data-reveal="3">
            <button type="button" className="lp-btn" data-checkout="edgar-hero" onClick={() => ask("The whole EDGAR desk, live")}>Start for ${TRIAL.fee}<IconArrow /></button>
            <a className="lp-btn lp-btn--ghost" href="#lp-desk">Explore the live desk</a>
          </div>
          <p className="lp-small lp-after" data-reveal="3">Then ${PLANS.insidir.price}/month. Cancel anytime.</p>
        </div>
        <HeroGlobe data={data} />
      </header>

      <div id="lp-desk" className="lp-stage" data-stage>
        <LiveDesk data={data} fresh={fresh} ask={ask} clock={clock} />
      </div>

      <Numbers data={data} />
      <Features data={data} ask={ask} />
      <ReadARow data={data} />
      <Pricing ask={ask} />
      <Faq />
      <section className="lp-final" aria-labelledby="lp-final-h">
        <h2 id="lp-final-h" className="lp-h2" data-reveal>Read the filing, not the headline.</h2>
        <p className="lp-lede lp-center-x" data-reveal="1">Every Form 4 and 8-K, about a minute after the SEC accepts it.</p>
        <div className="lp-ctas" data-reveal="2"><button type="button" className="lp-btn" onClick={() => ask("The whole EDGAR desk, live")}>Start for ${TRIAL.fee}<IconArrow /></button></div>
      </section>
      <p className="lp-bar" role="note" data-testid="el-disclaimer">{RESEARCH_DISCLAIMER}</p>
      {drawer ? <Drawer headline={drawer} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

/** The globe, lit by the page's own filings, with the three newest open-market trades floating beside it. */
function HeroGlobe({ data }: { data: Preview }) {
  const marks = useMemo<GlobeMark[]>(() => data.rows.slice(0, 90).map(r => ({ id: r.id, kind: r.code ?? "K", v: r.v })), [data]);
  const chips = data.rows.filter(r => r.code).slice(0, 3);
  return (
    <div className="lp-globe-wrap" data-reveal="2">
      <FilingGlobe marks={marks} />
      {chips.map((r, i) => (
        <div key={r.id} className={`lp-chipf lp-chipf--${i + 1}`}>
          <Avatar t={r.t} />
          <div><b>{r.t} · {r.code ? WORD[r.code] : ""}</b><span>{compact(r.v)} · Form 4</span></div>
          <CodePill code={r.code} short />
        </div>
      ))}
    </div>
  );
}

function Numbers({ data }: { data: Preview }) {
  const s = data.stats;
  const items: Array<[string, string]> = [
    ["Form 4 filings, last 24h", s.f4Day.toLocaleString("en-US")],
    ["With an open-market buy", s.pDay.toLocaleString("en-US")],
    ["With an open-market sale", s.sDay.toLocaleString("en-US")],
    ["8-K events, last 24h", s.eightKDay.toLocaleString("en-US")],
    ["EDGAR to Insidir, p95", data.edgar?.lagP95Sec != null ? `${data.edgar.lagP95Sec}s` : "about 1 min"],
  ];
  return (
    <section className="lp-section lp-wrap lp-center" aria-labelledby="lp-num-h">
      <p className="lp-kicker" data-reveal>The whole of EDGAR, not a sample</p>
      <h2 id="lp-num-h" className="lp-h2" data-reveal="1">Every filing. Parsed as filed. In about a minute.</h2>
      <dl className="lp-stats">{items.map(([k, v], i) => <div key={k} data-reveal={String(i)}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}

function Feature({ flip, kicker, title, body, points, children, glow }: { flip?: boolean; kicker: string; title: string; body: string; points: string[]; children: React.ReactNode; glow?: "p" | "k" | "v" }) {
  return (
    <section className={`lp-feature${flip ? " lp-feature--flip" : ""}`} aria-label={kicker}>
      <div className="lp-feature__copy">
        <p className="lp-kicker" data-reveal>{kicker}</p>
        <h2 className="lp-h2" data-reveal="1">{title}</h2>
        <p data-reveal="2">{body}</p>
        <ul data-reveal="3">{points.map(p => <li key={p}><IconTick />{p}</li>)}</ul>
      </div>
      <div className={`lp-visual lp-visual--${glow ?? "v"}`} data-reveal="1"><div className="lp-float">{children}</div></div>
    </section>
  );
}

function Features({ data, ask }: { data: Preview; ask: (h: string) => void }) {
  const latest = data.rows.slice(0, 3);
  const whale = useMemo(() => [...data.rows].filter(r => r.code === "P").sort((a, b) => b.v - a.v)[0] ?? null, [data]);
  const cluster = data.matches.find(m => m.kind === "cluster") ?? null;
  const doc = data.rows.find(r => r.code === "P") ?? data.rows.find(r => r.f === "4") ?? null;
  const busiest = useMemo(() => {
    const n = new Map<string, PreviewRow[]>();
    for (const r of data.rows) n.set(r.t, [...(n.get(r.t) ?? []), r]);
    return [...n.values()].sort((a, b) => b.length - a.length)[0]?.slice(0, 4) ?? [];
  }, [data]);
  const none = <p className="lp-small">Filings appear here as EDGAR publishes them.</p>;

  return (
    <div className="lp-wrap">
      <Feature kicker="Alerts" title="Know the minute your tickers file." glow="p"
        body="Pin the companies you trade. Every Form 4 and 8-K they file reaches you about a minute after EDGAR accepts it, with the codes, the people and the dollars already read."
        points={["Form 4 and 8-K, nothing else to wade through", "Dollar, form, code and velocity filters", "Every alert opens the filing as a document"]}>
        <div className="lp-stack">
          {latest.length ? latest.map(r => (
            <article key={r.id} className="lp-glass lp-note">
              <Avatar t={r.t} />
              <span><b>{r.t} · {r.f === "8-K" ? "8-K" : `Form 4 · ${r.code ?? ""}`}</b><span>{r.f === "8-K" ? (r.items.map(itemLabel).join("; ") || r.co) : `${r.own} · ${r.code ? WORD[r.code].toLowerCase() : ""} ${usd(r.v)}`}</span></span>
              <time>{STAMP.format(new Date(r.at))}</time>
            </article>
          )) : <div className="lp-glass lp-note">{none}</div>}
        </div>
      </Feature>

      <Feature flip kicker="Cluster & Whale Stream" title="Clusters and $1M+ buys, found as they file." glow="k"
        body="Three published rules run on every Form 4 the moment it lands: several insiders buying in the same week, one filing of $1M or more, and unusual bursts of filings. Each match shows the lines behind it."
        points={["Fixed, published rules, never a score", "Each line as filed: who, shares, price, value", "Raw SEC XML one click away"]}>
        <article className="lp-glass lp-match">
          {whale ? (
            <>
              <div className="lp-match__top"><Avatar t={whale.t} /><span><b>{whale.t}</b><span className="lp-small"> {whale.co}</span></span></div>
              <p className="lp-match__total">{compact(whale.v)}</p>
              <p className="lp-small">Largest open-market buy in the last 72 hours, as filed</p>
              <table className="lp-lines">
                <thead><tr><th>Insider</th><th className="lp-num">Shares</th><th className="lp-num">Avg price</th><th className="lp-num">Value</th></tr></thead>
                <tbody><tr><td>{whale.own}<span className="lp-small"> · {whale.role}</span></td><td className="lp-num">{qty(whale.sh)}</td><td className="lp-num">{price(whale.px)}</td><td className="lp-num">{usd(whale.v)}</td></tr></tbody>
              </table>
              {cluster ? <p className="lp-anchor">Cluster · {cluster.t} · {cluster.groups} insiders bought in the week of {cluster.ws}</p> : null}
            </>
          ) : none}
        </article>
      </Feature>

      <Feature kicker="Research journal" title="Your thinking, next to the record." glow="v"
        body="Open any filing as a document and write beside it. Set a status for each company, keep every version of a note, and export all of it whenever you like. Only you can see it."
        points={["Notes anchored to the exact filing", "Researching, Watching, Passed, with history", "Private, and yours to export"]}>
        <article className="lp-glass lp-split">
          <div>
            {doc ? (
              <>
                <div className="lp-match__top"><Avatar t={doc.t} /><span><b>{doc.t} · Form 4</b></span></div>
                <dl className="lp-kv">
                  <dt>Insider</dt><dd>{doc.own}</dd>
                  <dt>Code</dt><dd><CodePill code={doc.code} /></dd>
                  <dt>Shares</dt><dd>{qty(doc.sh)}</dd>
                  <dt>Avg price</dt><dd>{price(doc.px)}</dd>
                  <dt>Value</dt><dd>{usd(doc.v)}</dd>
                  <dt>Accepted</dt><dd>{at(doc.at)}</dd>
                </dl>
              </>
            ) : none}
          </div>
          <div>
            <b>Your journal</b>
            <div className="lp-segs" aria-hidden="true"><span>Researching</span><span>Watching</span><span>Passed</span></div>
            {doc ? <p className="lp-anchor">Beside: Form 4 · {doc.t}</p> : null}
            <p className="lp-compose">Write a note. Only you can see it.</p>
          </div>
        </article>
      </Feature>

      <Feature flip kicker="Position desk" title="Your positions, mapped to EDGAR." glow="p"
        body="Log shares or Kalshi and Polymarket contracts by hand. Each one gets a timeline of every filing from the companies behind it. No broker connection, ever."
        points={["Stocks and event contracts", "Every filing since you entered", "An expected-value calculator that uses only your numbers"]}>
        <article className="lp-glass lp-match">
          {busiest.length ? (
            <>
              <div className="lp-match__top"><Avatar t={busiest[0]!.t} /><span><b>{busiest[0]!.t}</b><span className="lp-small"> · paper trail</span></span></div>
              <ol className="lp-trail">{busiest.map(r => <li key={r.id}><time>{at(r.at)}</time>{r.f === "8-K" ? `8-K · ${r.items.map(itemLabel).join("; ") || "items in the filing"}` : `Form 4 · ${r.own} ${r.code ? WORD[r.code].toLowerCase() : ""} ${usd(r.v)}`}</li>)}</ol>
            </>
          ) : none}
          <p className="lp-ev">Expected value = p × (1 − price) − (1 − p) × price − fee. Every input is yours; Insidir never supplies a probability.</p>
        </article>
      </Feature>
      <div className="lp-center lp-section-sm"><button type="button" className="lp-btn lp-btn--ghost" onClick={() => ask("The whole EDGAR desk, live")}>See everything members get</button></div>
    </div>
  );
}

function ReadARow({ data }: { data: Preview }) {
  const r = data.rows.find(x => x.code === "P") ?? data.rows.find(x => x.code) ?? null;
  const key: Array<[string, string]> = [
    ["Company", "Whose stock was traded."],
    ["Insider", "Who filed, and their role exactly as they wrote it."],
    ["Code", "P: bought on the open market. S: sold on the open market."],
    ["Value", "Shares × price, to the cent, as reported. Nothing estimated."],
    ["Accepted", "When the SEC accepted it. It reaches Insidir about a minute later."],
  ];
  return (
    <section className="lp-section lp-wrap" aria-labelledby="lp-read-h">
      <div className="lp-center">
        <p className="lp-kicker" data-reveal>Plain English</p>
        <h2 id="lp-read-h" className="lp-h2" data-reveal="1">Read any row in five seconds.</h2>
      </div>
      <div className="lp-glass lp-anatomy" data-reveal="2">
        {r ? (
          <div className="lp-anatomy__row">
            <span className="lp-mark lp-tk"><sup>1</sup><Avatar t={r.t} />{r.t}</span>
            <span className="lp-mark"><sup>2</sup>{r.own}<span className="lp-small"> · {r.role}</span></span>
            <span className="lp-mark"><sup>3</sup><CodePill code={r.code} /></span>
            <span className="lp-mark"><sup>4</sup>{usd(r.v)}</span>
            <span className="lp-mark lp-small"><sup>5</sup>{at(r.at)}</span>
          </div>
        ) : <p className="lp-small">A live row appears here as soon as EDGAR publishes one.</p>}
        <ol className="lp-anatomy__key">{key.map(([k, v]) => <li key={k}><b>{k}</b>{v}</li>)}</ol>
      </div>
      <p className="lp-small lp-center" data-reveal>A filing records what someone did. It is not a reason to do anything; you decide what it means.</p>
    </section>
  );
}

const INCLUDED = [
  "Alerts on your tickers, about a minute after EDGAR",
  "Every Form 4 and 8-K, opened as filed, with raw SEC XML",
  "Cluster & Whale Stream with the lines behind each match",
  "Private research journal with versions and export",
  "Position desk for stocks, Kalshi and Polymarket",
];
function Pricing({ ask }: { ask: (h: string) => void }) {
  return (
    <section className="lp-section lp-wrap lp-center" aria-labelledby="lp-price-h">
      <p className="lp-kicker" data-reveal>One plan</p>
      <h2 id="lp-price-h" className="lp-h2" data-reveal="1">Everything, for one price.</h2>
      <div className="lp-glass lp-price" data-reveal="2">
        <p className="lp-price__n">${PLANS.insidir.price}<small>/month</small></p>
        <p className="lp-small">Your first {TRIAL.days} days are ${TRIAL.fee}. Cancel anytime.</p>
        <ul>{INCLUDED.map(i => <li key={i}><IconTick />{i}</li>)}</ul>
        <button type="button" className="lp-btn" onClick={() => ask("The whole EDGAR desk, live")}>Start for ${TRIAL.fee}<IconArrow /></button>
      </div>
    </section>
  );
}

const FAQ: Array<[string, string]> = [
  ["Where does the data come from?", "SEC EDGAR: the public Form 4 and 8-K filings, parsed as filed. Members can open every filing and its source document on sec.gov."],
  ["Is this investment advice?", "No. Insidir is research software. It shows public records and never tells anyone what to buy, sell or bet."],
  ["How fresh is it?", "Insidir reads EDGAR's new-filings feed every minute. The status at the top of the page shows when it last did."],
  ["What does it have to do with Kalshi and Polymarket?", "Filings move the companies many of those markets are about. Members can log event contracts and see the filings from the companies behind them."],
  ["Can I cancel?", `Anytime, from your account. Your first ${TRIAL.days} days are $${TRIAL.fee}, then $${PLANS.insidir.price}/month.`],
];
function Faq() {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="lp-faq-h">
      <div className="lp-center"><h2 id="lp-faq-h" className="lp-h2" data-reveal>Questions, answered.</h2></div>
      <div className="lp-faq" data-reveal="1">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>
  );
}

/** The membership drawer: the shared Paywall (trial terms from lib/plans) into the real checkout. */
function Drawer({ headline, onClose }: { headline: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("a, button:not(.lp-drawer__x)")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = overflow; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="lp-drawer" role="dialog" aria-modal="true" aria-label="Become a member" onClick={onClose} data-testid="el-drawer">
      <div ref={panel} className="lp-drawer__panel" onClick={e => e.stopPropagation()}>
        <button type="button" className="lp-drawer__x" onClick={onClose} aria-label="Close">✕</button>
        <Paywall headline={headline} now={now} href={CHECKOUT} testid="el-paywall"
          bullets={["Every Form 4 and 8-K, opened as filed, with the SEC source", "Alerts on your tickers about a minute after EDGAR accepts a filing", "Cluster & Whale Stream, private journal and position desk"]} />
        <p className="lp-small">{RESEARCH_DISCLAIMER}</p>
      </div>
    </div>
  );
}
