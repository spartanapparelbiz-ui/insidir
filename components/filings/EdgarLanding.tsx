"use client";
/* The /edgar landing (docs/RESEARCH-DESK.md): useful in the first second. The page arrives with the last 72 hours of
 * SEC filings already in it; the visitor filters, sorts, switches tabs and hovers rows right away, all in the browser
 * over a virtualized table. Anything that needs a member (opening a filing, alerts) opens the membership drawer with
 * the real checkout. Live status: EDGAR's health from the poller's heartbeat (it is polled, and says so), a UTC clock,
 * and filing counts. Facts as filed only; the disclaimer stays pinned to the bottom of the viewport. */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Paywall } from "@/components/brand/Paywall";
import { RESEARCH_DISCLAIMER } from "@/lib/copy";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import { price, qty, usd } from "@/lib/filings/format";
import type { Preview, PreviewMatch, PreviewRow } from "@/lib/filings/preview";
import { PLANS, TRIAL } from "@/lib/plans";
import { api, useNow, usePoll } from "./hooks";
import { VTable } from "./VTable";

type Tab = "trades" | "whales" | "clusters" | "8k";
type Side = "all" | "P" | "S";
type Sort = "new" | "size";
const WHALE = 1_000_000;
const CHECKOUT = "/go?step=checkout&from=edgar";
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const stamp = (ms: number) => { const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return `${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
const short = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : usd(n));
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
const WORD = { P: "Bought", S: "Sold" } as const;

export function EdgarLanding({ initial }: { initial: Preview }) {
  const [data, setData] = useState(initial);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const now = useNow(1000);
  // The same cached JSON every visitor shares; every 30 s while the tab is visible.
  usePoll(async () => {
    const next = await api<Preview>("/api/edgar/preview");
    setData(prev => {
      const seen = new Set(prev.rows.map(r => r.id));
      setFresh(new Set(next.rows.filter(r => !seen.has(r.id)).map(r => r.id)));
      return next;
    });
  }, 30_000, 300_000);

  const [drawer, setDrawer] = useState<{ headline: string } | null>(null);
  const ask = useCallback((headline: string) => setDrawer({ headline }), []);

  return (
    <div className="el-wrap">
      <StatusStrip data={data} now={now} />
      <Crawl rows={data.rows} />
      <section className="el-hero" aria-labelledby="el-h">
        <p className="el-kicker">SEC EDGAR · Form 4 · 8-K · equities &amp; prediction markets</p>
        <h1 id="el-h" className="el-h1">Stop trading on 3{"\u2011"}day media lag.</h1>
        <p className="el-sub">Direct SEC Form 4 and 8-K intelligence for equities and prediction markets. Every filing lands here about a minute after EDGAR accepts it. Try the live table below; no account needed.</p>
        <div className="el-ctas">
          <button type="button" className="el-btn" data-checkout="edgar-hero" onClick={() => ask("The whole EDGAR desk, live")}>Start for ${TRIAL.fee}</button>
          <a className="el-btn el-btn--ghost" href="#el-read">How to read a row</a>
          <span className="el-fine">Then ${PLANS.insidir.price}/mo. Cancel anytime.</span>
        </div>
      </section>
      <LiveTable data={data} fresh={fresh} ask={ask} live={now > 0} />
      <ReadARow data={data} />
      <Members ask={ask} />
      <Faq />
      <p className="el-bar" role="note" data-testid="el-disclaimer">{RESEARCH_DISCLAIMER}</p>
      {drawer ? <Drawer headline={drawer.headline} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

/* ---------- live status ---------- */

function StatusStrip({ data, now }: { data: Preview; now: number }) {
  const h = data.edgar;
  const since = h?.lastOkAt && now ? now - h.lastOkAt : null;
  const live = h?.ok === true && since !== null && since < 3 * 60_000;
  const label = !h || h.lastRunAt === null ? "SEC FEED STARTING" : live ? "LIVE SEC FEED" : h.ok === false ? "SEC FEED RETRYING" : "SEC FEED DELAYED";
  const s = data.stats;
  return (
    <div className="el-status" role="status" aria-label="Feed status">
      <span className={`el-live${live ? " is-on" : ""}`}><i aria-hidden="true" />{label}{since !== null ? <em> · read {ago(since)} ago</em> : null}</span>
      <span className="el-stat"><b>{s.f4Hour.toLocaleString("en-US")}</b> Form 4 last hour</span>
      <span className="el-stat"><b>{s.f4Day.toLocaleString("en-US")}</b> Form 4 · 24h</span>
      <span className="el-stat el-p"><b>{s.pDay.toLocaleString("en-US")}</b> with code P</span>
      <span className="el-stat el-s"><b>{s.sDay.toLocaleString("en-US")}</b> with code S</span>
      <span className="el-stat el-k"><b>{s.eightKDay.toLocaleString("en-US")}</b> 8-K · 24h</span>
      {h?.lagP95Sec != null ? <span className="el-stat"><b>{h.lagP95Sec}s</b> EDGAR → Insidir p95</span> : null}
      <time className="el-clock" dateTime={now ? new Date(now).toISOString() : undefined}>{now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"} UTC</time>
    </div>
  );
}

/** A quiet tape of the latest open-market trades, for the eye; the table below is the readable version. */
function Crawl({ rows }: { rows: PreviewRow[] }) {
  const items = rows.filter(r => r.code).slice(0, 24);
  if (items.length < 4) return null;
  const strip = items.map(r => <span key={r.id} className="el-crawl__i"><b>{r.t}</b><span className={`el-code el-code--${r.code}`}>{r.code}</span>{short(r.v)}</span>);
  return <div className="el-crawl" aria-hidden="true"><div className="el-crawl__track">{strip}{strip}</div></div>;
}

/* ---------- the live table ---------- */

const F4_HEAD = <><span>Time ET</span><span>Ticker</span><span>Who filed</span><span className="fl-hide-sm">Role</span><span>Did</span><span className="fl-n fl-hide-sm">Shares</span><span className="fl-n fl-hide-sm">Avg price</span><span className="fl-n">Value</span></>;
const K8_HEAD = <><span>Time ET</span><span>Ticker</span><span className="fl-hide-sm">Company</span><span>Items</span><span>What the items are</span></>;
const CL_HEAD = <><span>Found</span><span>Ticker</span><span className="fl-hide-sm">Company</span><span className="fl-n">Insiders</span><span className="fl-hide-sm">Trade week</span><span className="fl-n">Bought, as filed</span></>;
const idKey = (r: { id: number }) => String(r.id);

function LiveTable({ data, fresh, ask, live }: { data: Preview; fresh: ReadonlySet<number>; ask: (h: string) => void; live: boolean }) {
  const [tab, setTab] = useState<Tab>("trades");
  const [side, setSide] = useState<Side>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<PreviewRow | PreviewMatch | null>(null);
  const dq = useDeferredValue(q), dside = useDeferredValue(side), dsort = useDeferredValue(sort);

  const view = useMemo(() => {
    const t0 = performance.now();
    const term = dq.trim().toLowerCase();
    const hit = (s: string) => !term || s.toLowerCase().includes(term);
    let rows: PreviewRow[] = [], matches: PreviewMatch[] = [];
    if (tab === "clusters") matches = data.matches.filter(m => m.kind === "cluster" && hit(`${m.t} ${m.co}`));
    else if (tab === "8k") rows = data.rows.filter(r => r.f === "8-K" && hit(`${r.t} ${r.co}`));
    else rows = data.rows.filter(r => r.f === "4" && (tab !== "whales" || (r.code === "P" && r.v >= WHALE)) && (dside === "all" || r.code === dside) && hit(`${r.t} ${r.co} ${r.own} ${r.role}`));
    if (dsort === "size") { rows = [...rows].sort((a, b) => b.v - a.v); matches = [...matches].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)); }
    return { rows, matches, ms: Math.round((performance.now() - t0) * 100) / 100 };
  }, [data, tab, dq, dside, dsort]);

  const counts = useMemo(() => ({
    trades: data.rows.filter(r => r.f === "4").length, whales: data.rows.filter(r => r.f === "4" && r.code === "P" && r.v >= WHALE).length,
    clusters: data.matches.filter(m => m.kind === "cluster").length, "8k": data.rows.filter(r => r.f === "8-K").length,
  }), [data]);

  const renderF4 = useCallback((r: PreviewRow) => (
    <>
      <span role="gridcell" className="fl-mono fl-dim">{stamp(r.at)}</span>
      <span role="gridcell" className="fl-tk">{r.t}</span>
      <span role="gridcell" title={r.own}>{r.own}</span>
      <span role="gridcell" className="fl-faint fl-hide-sm" title={r.role}>{r.role}</span>
      <span role="gridcell"><span className={`el-code el-code--${r.code}`} title={r.code ? `Code ${r.code}: ${codeLabel(r.code)}` : undefined}>{r.code}</span> <span className="el-did">{r.code ? WORD[r.code] : ""}</span></span>
      <span role="gridcell" className="fl-n fl-hide-sm">{qty(r.sh)}</span>
      <span role="gridcell" className="fl-n fl-hide-sm">{price(r.px)}</span>
      <span role="gridcell" className={`fl-n ${r.code === "P" ? "fl-p" : "fl-s"}`}>{usd(r.v)}</span>
    </>
  ), []);
  const render8k = useCallback((r: PreviewRow) => (
    <>
      <span role="gridcell" className="fl-mono fl-dim">{stamp(r.at)}</span>
      <span role="gridcell" className="fl-tk">{r.t}</span>
      <span role="gridcell" className="fl-hide-sm" title={r.co}>{r.co}</span>
      <span role="gridcell" className="fl-codes">{r.items.slice(0, 3).map(i => <span key={i} className="el-code el-code--K">{i}</span>)}</span>
      <span role="gridcell" className="fl-dim" title={r.items.map(itemLabel).join("; ")}>{r.items.length ? r.items.map(itemLabel).join("; ") : "Items not listed in the feed"}</span>
    </>
  ), []);
  const renderCl = useCallback((m: PreviewMatch) => (
    <>
      <span role="gridcell" className="fl-mono fl-dim">{stamp(m.at)}</span>
      <span role="gridcell" className="fl-tk">{m.t}</span>
      <span role="gridcell" className="fl-hide-sm" title={m.co}>{m.co}</span>
      <span role="gridcell" className="fl-n">{m.groups}</span>
      <span role="gridcell" className="fl-mono fl-dim fl-hide-sm">{m.ws.slice(5)} → {m.we.slice(5)}</span>
      <span role="gridcell" className="fl-n fl-p">{m.total !== null ? usd(m.total) : "–"}</span>
    </>
  ), []);
  const openRow = useCallback((r: { t: string }) => ask(`Open ${r.t}'s filing, its source document and alerts`), [ask]);
  const onHover = useCallback((r: PreviewRow | PreviewMatch | null) => setHover(r), []);
  const rowClass = useCallback((r: PreviewRow) => (fresh.has(r.id) ? "fl-tr--new" : ""), [fresh]);
  const tabs: Array<[Tab, string]> = [["trades", "Buys & sells"], ["whales", "Whales $1M+"], ["clusters", "Clusters"], ["8k", "8-K events"]];
  const total = tab === "clusters" ? counts.clusters : tab === "8k" ? counts["8k"] : counts.trades;
  const shown = tab === "clusters" ? view.matches.length : view.rows.length;

  return (
    <section className="el-term" aria-label="Live Cluster and Whale preview" data-testid="el-live">
      <div className="el-term__bar">
        <div className="el-tabs" role="tablist" aria-label="What to show">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className="el-tab" onClick={() => { setTab(k); setHover(null); }}>
              {label} <span className="el-tab__n">{counts[k]}</span>
            </button>
          ))}
        </div>
        {/* The timing is the browser's own measurement, so it only shows once the page is live (the server's would differ). */}
        <span className="el-term__meta" aria-live="polite">{shown} / {total}{live ? ` · ${view.ms.toFixed(2)} ms` : ""}</span>
      </div>
      <div className="el-term__tools">
        <label className="el-search"><span className="fl-sr">Find a ticker, company or person</span>
          <input type="search" placeholder="Find a ticker, company or person" value={q} onChange={e => setQ(e.target.value)} spellCheck={false} /></label>
        {tab === "trades" ? (
          <div className="el-seg" role="radiogroup" aria-label="Buys or sells">
            {(["all", "P", "S"] as Side[]).map(s => <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}>{s === "all" ? "All" : s === "P" ? "Buys · P" : "Sells · S"}</button>)}
          </div>
        ) : null}
        {tab !== "8k" ? (
          <div className="el-seg" role="radiogroup" aria-label="Order">
            <button type="button" role="radio" aria-checked={sort === "new"} onClick={() => setSort("new")}>Newest</button>
            <button type="button" role="radio" aria-checked={sort === "size"} onClick={() => setSort("size")}>Largest $</button>
          </div>
        ) : null}
        <button type="button" className="el-gated" onClick={() => ask("Get an alert the minute your tickers file")}>Set an alert</button>
      </div>
      <div className="el-term__table">
        {tab === "clusters" ? (
          <VTable rows={view.matches} cols="el-cols-cl" head={CL_HEAD} render={renderCl} rowKey={idKey} selected={null} onSelect={openRow} onHover={onHover} label="Clusters: 2+ insiders buying in one week"
            empty={data.matches.length ? "No clusters match." : "No clusters in the last 14 days yet."} />
        ) : (
          <VTable rows={view.rows} cols={tab === "8k" ? "el-cols-8k" : "el-cols-f4"} head={tab === "8k" ? K8_HEAD : F4_HEAD} render={tab === "8k" ? render8k : renderF4}
            rowKey={idKey} selected={null} onSelect={openRow} onHover={onHover} rowClass={rowClass} label="Latest SEC filings"
            empty={data.rows.length ? "Nothing matches. Clear the search or switch tabs." : "Collecting the first filings from EDGAR. This fills in within minutes."} />
        )}
      </div>
      <Inspector row={hover} />
    </section>
  );
}

/** The line under the table: the hovered row in words, with the officer's title as filed. */
function Inspector({ row }: { row: PreviewRow | PreviewMatch | null }) {
  if (!row) return <p className="el-inspect el-inspect--idle">Hover a row to read it in plain words. Click it to open the SEC filing (members).</p>;
  if ("kind" in row) {
    return <p className="el-inspect"><b>{row.t}</b> · {row.groups} separate insiders reported open-market purchases in the week of {row.ws}{row.total !== null ? `, ${usd(row.total)} in total as filed` : ""}.</p>;
  }
  if (row.f === "8-K") return <p className="el-inspect"><b>{row.t}</b> · {row.co} filed an 8-K: {row.items.length ? row.items.map(i => `Item ${i} ${itemLabel(i)}`).join("; ") : "items not listed in the feed"}.</p>;
  return (
    <p className="el-inspect">
      <b>{row.t}</b> · {row.own}{row.role ? <> (<span className="el-role">{row.role}</span>)</> : null} reported {row.code === "P" ? "buying" : "selling"} {qty(row.sh)} shares
      {" "}at {price(row.px)} on average{row.d ? ` on ${row.d}` : ""}: <b className={row.code === "P" ? "fl-p" : "fl-s"}>{usd(row.v)}</b> as filed (code {row.code}, {row.code ? codeLabel(row.code).toLowerCase() : ""}).
    </p>
  );
}

/* ---------- read a row ---------- */

function ReadARow({ data }: { data: Preview }) {
  const r = data.rows.find(x => x.code === "P") ?? data.rows.find(x => x.code);
  const parts: Array<[string, string, string]> = [
    ["Ticker", r?.t ?? "Ticker", "The company whose stock was traded."],
    ["Who filed", r ? `${r.own}${r.role ? ` · ${r.role}` : ""}` : "Name · role", "The insider, and their role exactly as they filed it."],
    ["Code", r?.code ? `${r.code} · ${WORD[r.code]}` : "P or S", "P: bought on the open market. S: sold on the open market. Straight from the form."],
    ["Value", r ? usd(r.v) : "Dollars", "Shares × price, to the cent, as reported. Nothing estimated."],
    ["Time", r ? `${stamp(r.at)} ET` : "When", "When the SEC accepted the filing. It shows up here about a minute later."],
  ];
  return (
    <section id="el-read" className="el-read" aria-labelledby="el-read-h">
      <h2 id="el-read-h" className="el-h2">Read a row in five seconds.</h2>
      <ol className="el-read__list">{parts.map(([k, v, why], i) => <li key={k}><span className="el-read__n">{String(i + 1).padStart(2, "0")}</span><span className="el-read__k">{k}</span><span className="el-read__v">{v}</span><span className="el-read__why">{why}</span></li>)}</ol>
      <p className="el-fine">A filing is a record of what someone did, not a reason to do anything. Insidir shows it; you decide what it means.</p>
    </section>
  );
}

/* ---------- membership ---------- */

const GETS: Array<[string, string]> = [
  ["Alerts on your tickers", "Pin companies. Every Form 4 and 8-K they file reaches you about a minute after EDGAR accepts it."],
  ["Every filing, opened", "The whole tape back through history, each filing as a document with its raw SEC XML."],
  ["Cluster & Whale Stream", "Every cluster, $1M+ purchase and filing burst, with the lines behind it."],
  ["Journal and position desk", "Private notes pinned to filings, and your positions mapped against EDGAR. Export any time."],
];

function Members({ ask }: { ask: (h: string) => void }) {
  return (
    <section className="el-members" aria-labelledby="el-m-h">
      <h2 id="el-m-h" className="el-h2">Members get the whole desk.</h2>
      <ul className="el-gets">{GETS.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>
      <div className="el-price">
        <p><span className="el-price__n">${PLANS.insidir.price}</span><span className="el-fine">/month · first {TRIAL.days} days ${TRIAL.fee} · cancel anytime</span></p>
        <button type="button" className="el-btn" onClick={() => ask("The whole EDGAR desk, live")}>Start for ${TRIAL.fee}</button>
      </div>
    </section>
  );
}

const FAQ: Array<[string, string]> = [
  ["Where does the data come from?", "SEC EDGAR: the public Form 4 and 8-K filings, parsed as filed. Every row links to the SEC's own document for members."],
  ["Is this advice?", "No. Insidir is research software. It shows public records and never tells anyone what to buy, sell or bet."],
  ["How fresh is it?", "Insidir reads EDGAR's new-filings feed every minute. The status line at the top shows when it last read it and how long filings take to arrive."],
  ["What about Kalshi and Polymarket?", "Filings move the companies those markets are about. Members can log event contracts and see the filings for the companies behind them."],
];
function Faq() {
  return (
    <section className="el-faq" aria-labelledby="el-faq-h">
      <h2 id="el-faq-h" className="el-h2">Straight answers.</h2>
      {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  );
}

/** The membership drawer: the real paywall (trial terms from lib/plans) into the real checkout. */
function Drawer({ headline, onClose }: { headline: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="el-drawer" role="dialog" aria-modal="true" aria-label="Become a member" onClick={onClose} data-testid="el-drawer">
      <div ref={panel} className="el-drawer__panel" onClick={e => e.stopPropagation()}>
        <button type="button" className="el-drawer__x" onClick={onClose} aria-label="Close">✕</button>
        <Paywall headline={headline} now={now} href={CHECKOUT} testid="el-paywall"
          bullets={["Every Form 4 and 8-K, opened as filed, with the SEC source", "Alerts on your tickers about a minute after EDGAR accepts a filing", "Cluster & Whale Stream, private journal and position desk"]} />
        <p className="el-fine">{RESEARCH_DISCLAIMER}</p>
      </div>
    </div>
  );
}
