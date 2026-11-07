"use client";
/* The hero's product: the Insidir desk as a real, working dashboard, filled with the last 72 hours of SEC filings.
 * KPIs, the hourly chart and "Largest buys" are computed here from the page's own data; the table is virtualized and
 * filters in the browser. Everything that needs a member (opening a filing, alerts) calls `ask`, which opens the
 * membership drawer. Times and "read ago" are measured from the data's own timestamp, so the server and the browser
 * render the same thing; only the UTC clock waits for the browser. */
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import { price, qty, usd } from "@/lib/filings/format";
import type { Preview, PreviewMatch, PreviewRow } from "@/lib/filings/preview";
import { VTable } from "../VTable";
import { AreaChart } from "./AreaChart";
import { IconBell, IconBolt, IconBook, IconGrid, IconLayers, IconList, IconSearch } from "./icons";

type Tab = "trades" | "whales" | "clusters" | "8k";
type Side = "all" | "P" | "S";
const WHALE = 1_000_000;
const DAY = 86_400_000;
const STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const compact = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : usd(n));
export const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
export const initials = (t: string) => t.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase() || "—";
export const WORD = { P: "Bought", S: "Sold" } as const;

export function Avatar({ t }: { t: string }) { return <span className="lp-avatar" aria-hidden="true">{initials(t)}</span>; }
export function CodePill({ code, short = false }: { code: "P" | "S" | null; short?: boolean }) {
  if (!code) return null;
  return <span className={`lp-code lp-code--${code}`} title={`Code ${code}: ${codeLabel(code)}`}><i aria-hidden="true" />{short ? code : `${code} · ${WORD[code]}`}</span>;
}

/** EDGAR's state as of the data: live when the poller read EDGAR successfully within 3 minutes of this snapshot. */
export function feedState(d: Preview): { live: boolean; label: string } {
  const h = d.edgar;
  if (!h || h.lastRunAt === null) return { live: false, label: "Starting the SEC feed" };
  if (h.ok === false) return { live: false, label: "SEC feed retrying" };
  const since = h.lastOkAt === null ? null : d.generatedAt - h.lastOkAt;
  return since !== null && since < 180_000 ? { live: true, label: `Live from SEC EDGAR · read ${ago(since)} ago` } : { live: false, label: `SEC feed delayed${since !== null ? ` · read ${ago(since)} ago` : ""}` };
}

const NAV: Array<[string, () => React.ReactElement]> = [["Overview", IconGrid], ["Alerts", IconBell], ["Tape", IconList], ["Stream", IconBolt], ["Journal", IconBook], ["Positions", IconLayers]];
const idKey = (r: { id: number }) => String(r.id);

export function LiveDesk({ data, fresh, ask, clock }: { data: Preview; fresh: ReadonlySet<number>; ask: (h: string) => void; clock: number }) {
  const feed = feedState(data);
  const day = useMemo(() => data.rows.filter(r => r.f === "4" && r.at >= data.generatedAt - DAY), [data]);
  const pDay = day.filter(r => r.code === "P"), sDay = day.filter(r => r.code === "S");
  const buys = useMemo(() => data.rows.filter(r => r.code === "P").sort((a, b) => b.v - a.v).slice(0, 5), [data]);
  const active = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of data.rows) n.set(r.t, (n.get(r.t) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data]);

  return (
    <div className="lp-window" data-window aria-label="The Insidir desk, live">
      <div className="lp-chrome">
        <span className="lp-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="lp-chrome__title"><b>Insidir</b> · EDGAR desk</span>
        <span className="lp-chrome__right">
          <span className="lp-pill lp-hide-sm" role="status"><span className={`lp-dot${feed.live ? " is-live" : ""}`} />{feed.label}</span>
          <span className="lp-hide-sm">{clock ? `${new Date(clock).toISOString().slice(11, 19)} UTC` : ""}</span>
        </span>
      </div>
      <div className="lp-app">
        <nav className="lp-side" aria-label="Desk sections (members)">
          {NAV.map(([label, Icon], i) => (
            <button key={label} type="button" className={`lp-side__item lp-tab${i === 0 ? " is-on" : ""}`} onClick={() => (i ? ask(`${label} is part of the member desk`) : undefined)}><Icon />{label}</button>
          ))}
          <p className="lp-side__h">Most filings · 72h</p>
          {active.map(([t, n]) => <span key={t} className="lp-side__tk"><b>{t}</b>{n}</span>)}
        </nav>
        <div className="lp-main">
          <div className="lp-main__head"><h2>Overview</h2><span className="lp-pill">Last 72 hours · SEC Form 4 and 8-K</span></div>
          <dl className="lp-kpis">
            <div className="lp-card lp-kpi"><dt><span className="lp-swatch" />Form 4 filed · 24h</dt><dd>{data.stats.f4Day.toLocaleString("en-US")}</dd><small>{data.stats.f4Hour.toLocaleString("en-US")} in the last hour</small></div>
            <div className="lp-card lp-kpi"><dt><span className="lp-swatch lp-swatch--p" />Open-market buys · 24h</dt><dd>{compact(pDay.reduce((a, r) => a + r.v, 0))}</dd><small>{data.stats.pDay.toLocaleString("en-US")} filings with code P</small></div>
            <div className="lp-card lp-kpi"><dt><span className="lp-swatch lp-swatch--s" />Open-market sales · 24h</dt><dd>{compact(sDay.reduce((a, r) => a + r.v, 0))}</dd><small>{data.stats.sDay.toLocaleString("en-US")} filings with code S</small></div>
            <div className="lp-card lp-kpi"><dt><span className="lp-swatch lp-swatch--k" />8-K events · 24h</dt><dd>{data.stats.eightKDay.toLocaleString("en-US")}</dd><small>{data.edgar?.lagP95Sec != null ? `p95 ${data.edgar.lagP95Sec}s from EDGAR` : "Read from EDGAR every minute"}</small></div>
          </dl>
          <div className="lp-row2">
            <section className="lp-card" aria-label="Form 4 filings per hour"><div className="lp-card__h"><h3>Form 4 filings per hour</h3><span>Last 24 hours, Eastern</span></div><AreaChart hours={data.hours} at={data.generatedAt} /></section>
            <section className="lp-card" aria-label="Largest open-market buys">
              <div className="lp-card__h"><h3>Largest buys</h3><span>Code P · 72h</span></div>
              {buys.length ? (
                <ul className="lp-list">{buys.map(r => (
                  <li key={r.id} onClick={() => ask(`Open ${r.t}'s filing and its SEC source`)}>
                    <Avatar t={r.t} />
                    <span className="lp-list__t"><b>{r.t}</b><span>{r.own}{r.role ? ` · ${r.role}` : ""}</span></span>
                    <span className="lp-list__v">{compact(r.v)}<small>{qty(r.sh)} sh</small></span>
                  </li>
                ))}</ul>
              ) : <p className="lp-small lp-list">No open-market buys filed in the last 72 hours yet.</p>}
            </section>
          </div>
          <LiveTable data={data} fresh={fresh} ask={ask} live={clock > 0} />
        </div>
      </div>
    </div>
  );
}

const F4_HEAD = <><span className="lp-hide-sm">Filed (ET)</span><span>Company</span><span className="lp-hide-sm">Insider</span><span className="lp-hide-sm">Role</span><span>Code</span><span className="lp-num lp-hide-sm">Shares</span><span className="lp-num">Value</span></>;
const K8_HEAD = <><span className="lp-hide-sm">Filed (ET)</span><span>Company</span><span className="lp-hide-sm">What the items are</span><span>Items</span></>;
const CL_HEAD = <><span className="lp-hide-sm">Found (ET)</span><span>Company</span><span className="lp-num">Insiders</span><span className="lp-hide-sm">Trade week</span><span className="lp-num">Bought, as filed</span></>;

function LiveTable({ data, fresh, ask, live }: { data: Preview; fresh: ReadonlySet<number>; ask: (h: string) => void; live: boolean }) {
  const [tab, setTab] = useState<Tab>("trades");
  const [side, setSide] = useState<Side>("all");
  const [sortBySize, setSortBySize] = useState(false);
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<PreviewRow | PreviewMatch | null>(null);
  const dq = useDeferredValue(q);
  const view = useMemo(() => {
    const t0 = performance.now(), term = dq.trim().toLowerCase();
    const hit = (s: string) => !term || s.toLowerCase().includes(term);
    let rows: PreviewRow[] = [], matches: PreviewMatch[] = [];
    if (tab === "clusters") matches = data.matches.filter(m => m.kind === "cluster" && hit(`${m.t} ${m.co}`));
    else if (tab === "8k") rows = data.rows.filter(r => r.f === "8-K" && hit(`${r.t} ${r.co}`));
    else rows = data.rows.filter(r => r.f === "4" && (tab !== "whales" || (r.code === "P" && r.v >= WHALE)) && (tab !== "trades" || side === "all" || r.code === side) && hit(`${r.t} ${r.co} ${r.own} ${r.role}`));
    if (sortBySize) { rows = [...rows].sort((a, b) => b.v - a.v); matches = [...matches].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)); }
    return { rows, matches, ms: performance.now() - t0 };
  }, [data, tab, dq, side, sortBySize]);
  const counts: Record<Tab, number> = useMemo(() => ({
    trades: data.rows.filter(r => r.f === "4").length, whales: data.rows.filter(r => r.f === "4" && r.code === "P" && r.v >= WHALE).length,
    clusters: data.matches.filter(m => m.kind === "cluster").length, "8k": data.rows.filter(r => r.f === "8-K").length,
  }), [data]);

  const renderF4 = useCallback((r: PreviewRow) => (
    <>
      <span role="gridcell" className="lp-faint lp-hide-sm">{STAMP.format(new Date(r.at))}</span>
      <span role="gridcell" className="lp-tk" title={r.co}><Avatar t={r.t} />{r.t}</span>
      <span role="gridcell" className="lp-hide-sm" title={r.own}>{r.own}</span>
      <span role="gridcell" className="lp-dim lp-hide-sm" title={r.role}>{r.role}</span>
      <span role="gridcell"><span className="lp-hide-sm"><CodePill code={r.code} /></span><span className="lp-only-sm"><CodePill code={r.code} short /></span></span>
      <span role="gridcell" className="lp-num lp-dim lp-hide-sm">{qty(r.sh)}</span>
      <span role="gridcell" className="lp-num">{usd(r.v)}</span>
    </>
  ), []);
  const render8k = useCallback((r: PreviewRow) => (
    <>
      <span role="gridcell" className="lp-faint lp-hide-sm">{STAMP.format(new Date(r.at))}</span>
      <span role="gridcell" className="lp-tk" title={r.co}><Avatar t={r.t} />{r.t}</span>
      <span role="gridcell" className="lp-dim lp-hide-sm" title={r.items.map(itemLabel).join("; ")}>{r.items.length ? r.items.map(itemLabel).join("; ") : "Items not listed in the feed"}</span>
      <span role="gridcell">{r.items.slice(0, 2).map(i => <span key={i} className="lp-code lp-code--K"><i aria-hidden="true" />{i}</span>)}</span>
    </>
  ), []);
  const renderCl = useCallback((m: PreviewMatch) => (
    <>
      <span role="gridcell" className="lp-faint lp-hide-sm">{STAMP.format(new Date(m.at))}</span>
      <span role="gridcell" className="lp-tk" title={m.co}><Avatar t={m.t} />{m.t}<span className="lp-faint lp-hide-sm lp-co">{m.co}</span></span>
      <span role="gridcell" className="lp-num">{m.groups}</span>
      <span role="gridcell" className="lp-dim lp-hide-sm">Week of {m.ws}</span>
      <span role="gridcell" className="lp-num">{m.total !== null ? usd(m.total) : "–"}</span>
    </>
  ), []);
  const open = useCallback((r: { t: string }) => ask(`Open ${r.t}'s filing and its SEC source`), [ask]);
  const onHover = useCallback((r: PreviewRow | PreviewMatch | null) => setHover(r), []);
  const rowClass = useCallback((r: PreviewRow) => (fresh.has(r.id) ? "fl-tr--new" : ""), [fresh]);
  const tabs: Array<[Tab, string]> = [["trades", "Buys & sells"], ["whales", "$1M+ buys"], ["clusters", "Clusters"], ["8k", "8-K events"]];
  const shown = tab === "clusters" ? view.matches.length : view.rows.length;

  return (
    <section className="lp-card" aria-label="Latest SEC filings, live" data-testid="el-live">
      <div className="lp-tools">
        <div className="lp-tabs" role="tablist" aria-label="What to show">
          {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="lp-tab" onClick={() => { setTab(k); setHover(null); }}>{label}<small>{counts[k]}</small></button>)}
        </div>
        {tab === "trades" ? (
          <div className="lp-tabs" role="radiogroup" aria-label="Buys or sells">
            {(["all", "P", "S"] as Side[]).map(s => <button key={s} type="button" role="radio" aria-checked={side === s} className="lp-tab" onClick={() => setSide(s)}>{s === "all" ? "All" : s === "P" ? "Buys" : "Sells"}</button>)}
          </div>
        ) : null}
        {tab !== "8k" ? <div className="lp-tabs" role="radiogroup" aria-label="Order">
          <button type="button" role="radio" aria-checked={!sortBySize} className="lp-tab" onClick={() => setSortBySize(false)}>Newest</button>
          <button type="button" role="radio" aria-checked={sortBySize} className="lp-tab" onClick={() => setSortBySize(true)}>Largest</button>
        </div> : null}
        <label className="lp-search"><IconSearch /><span className="lp-sr">Search a ticker, company or person</span>
          <input type="search" placeholder="Search a ticker, company or person" value={q} onChange={e => setQ(e.target.value)} spellCheck={false} /></label>
        <button type="button" className="lp-alert" onClick={() => ask("Get an alert the minute your tickers file")}><IconBellSmall />Set an alert</button>
        {/* The browser's own timing, shown once the page is live (a server-side figure would differ). */}
        <span className="lp-meta" aria-live="polite">{shown} of {tab === "clusters" ? counts.clusters : tab === "8k" ? counts["8k"] : counts.trades}{live ? ` · filtered in ${view.ms.toFixed(1)} ms` : ""}</span>
      </div>
      <div className="lp-table">
        {tab === "clusters" ? (
          <VTable rows={view.matches} cols="cols-cl" head={CL_HEAD} render={renderCl} rowKey={idKey} selected={null} onSelect={open} onHover={onHover} label="Clusters: 2+ insiders buying in one week"
            empty={data.matches.length ? "No clusters match your search." : "No clusters in the last 14 days yet."} />
        ) : (
          <VTable rows={view.rows} cols={tab === "8k" ? "cols-8k" : "cols-f4"} head={tab === "8k" ? K8_HEAD : F4_HEAD} render={tab === "8k" ? render8k : renderF4}
            rowKey={idKey} selected={null} onSelect={open} onHover={onHover} rowClass={rowClass} label="Latest SEC filings"
            empty={data.rows.length ? "Nothing matches. Clear the search or switch tabs." : "Collecting the first filings from EDGAR. This fills in within minutes."} />
        )}
      </div>
      <Inspector row={hover} />
    </section>
  );
}

function IconBellSmall() { return <span aria-hidden="true" className="lp-bell"><IconBell /></span>; }

/** The hovered row in plain words, with the insider's role as filed. */
function Inspector({ row }: { row: PreviewRow | PreviewMatch | null }) {
  if (!row) return <p className="lp-inspect">Hover any row to read it in plain words. Click it to open the SEC filing.</p>;
  if ("kind" in row) return <p className="lp-inspect"><b>{row.t}</b> · {row.groups} separate insiders reported open-market purchases in the week of {row.ws}{row.total !== null ? `, ${usd(row.total)} in total as filed` : ""}.</p>;
  if (row.f === "8-K") return <p className="lp-inspect"><b>{row.t}</b> · {row.co} filed an 8-K: {row.items.length ? row.items.map(i => `Item ${i}, ${itemLabel(i)}`).join("; ") : "items not listed in the feed"}.</p>;
  return (
    <p className="lp-inspect"><b>{row.own}</b>{row.role ? `, ${row.role}` : ""} at <b>{row.co}</b> reported {row.code === "P" ? "buying" : "selling"} {qty(row.sh)} shares at {price(row.px)} on average{row.d ? ` on ${row.d}` : ""}: <b>{usd(row.v)}</b> as filed.</p>
  );
}
