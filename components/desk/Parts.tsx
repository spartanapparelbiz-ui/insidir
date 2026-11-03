/* The Desk's parts (direction A, picked in PR #109) (qa/design/desk-notes.md): black stage, white type, Plus Jakarta Sans on
 * the 12/14/16/20/28/44/72 scale, 1px #1a1a1a dividers instead of cards, colour only with meaning (green up, red down,
 * violet live, one flat gold marker for $1M+), one white pill per view. Identity is text: a short address and
 * all-time profit; teams as their names with a chip in the team's colour (no logos until licensed). Server-safe. */
import type { CSSProperties, ReactNode } from "react";
import type { CategorySlug } from "@/lib/brand/categories";
import { teamsNamed } from "@/lib/brand/teams";
import type { Edge } from "@/lib/desk/edge";
import { decidedText, decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { FollowLink, PingsLink } from "./Act";

export const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const ago = (ms: number, now: number) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const ETD = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** "Live · checked 40s ago" (the worker polled within 5 minutes) or "Paused · last check 2h ago"; "Last bet 2h ago". */
export function Status({ polledAt, updatedAt, now }: { polledAt: number | null; updatedAt: number | null; now: number }) {
  const live = polledAt !== null && now - polledAt < 5 * 60_000;
  return (
    <p className="dk-status" data-live={live}>
      <span className={live ? "dk-live" : "dk-paused"}>{live ? `Live · checked ${ago(polledAt!, now)} ago` : polledAt ? `Paused · last check ${ago(polledAt, now)} ago` : "Paused"}</span>
      {updatedAt ? <span>Last bet {ago(updatedAt, now)} ago</span> : null}
    </p>
  );
}

/** The market's name in full (never truncated), each team name led by a small chip in its primary colour. */
export function MarketName({ title, category }: { title: string; category: CategorySlug }) {
  const teams = teamsNamed(title, category);
  if (!teams.length) return <>{title}</>;
  const out: ReactNode[] = [];
  let rest = title, k = 0;
  for (const { name, team } of teams) {
    const i = rest.indexOf(name);
    if (i < 0) continue;
    out.push(rest.slice(0, i), <span key={k++} className="dk-team"><i style={{ background: team.c1 } as CSSProperties} aria-hidden="true" />{name}</span>);
    rest = rest.slice(i + name.length);
  }
  out.push(rest);
  return <>{out}</>;
}

/** "0xf031…c80c · +$11.2M all-time", a flat gold marker for $1M+ wallets. Never a name. */
export function Wallet({ short, pnl, tier }: { short: string; pnl: number | null; tier: string }) {
  return (
    <span className="dk-wallet">
      {tier === "millionaire" ? <i className="dk-gold" title="Wallet up $1M+ all-time" aria-label="Up $1M+ all-time" /> : null}
      <span>{short}</span>{pnl !== null ? <span> · {signed(pnl)} all-time</span> : null}
    </span>
  );
}

export function Delta({ from, to, unit = "¢" }: { from: number | null; to: number | null; unit?: string }) {
  if (from === null || to === null) return null;
  const d = Math.round((to - from) * 100);
  if (d === 0) return <span className="dk-dim">flat</span>;
  return <span className={d > 0 ? "dk-up" : "dk-down"}>{d > 0 ? "+" : "−"}{Math.abs(d)}{unit}</span>;
}

/** One chart style: a thin white line of the side they bought, no gridlines, a dotted line at their average entry, a
 *  flat gold dot where each millionaire bought (sized by dollars), the price now labelled at the right end. Real points
 *  only; without history, their entry and the price now as two labelled ticks. */
export function PriceChart({ edge, height = 240, compact = false }: { edge: Edge; height?: number; compact?: boolean }) {
  const pts = edge.points, now = edge.now, avg = edge.avg;
  if (pts.length < 2) {
    return (
      <div className="dk-chart dk-chart--none" style={{ minHeight: compact ? 64 : 120 }} data-testid="edge-chart" data-mode="bar">
        <p className="dk-dim">Price history isn&apos;t available from the venue right now.</p>
        <p>Their average entry <b>{cents(avg)}</b>{now !== null ? <> · now <b>{cents(now)}</b> <Delta from={avg} to={now} /></> : null}</p>
      </div>
    );
  }
  // Lines in a stretched SVG (non-scaling strokes); dots and labels as HTML at % positions, so they stay round and
  // crisp at every width.
  const t0 = pts[0]!.t, t1 = pts.at(-1)!.t;
  const vals = [...pts.map(p => p.p), avg, ...(now !== null ? [now] : [])];
  const lo = Math.max(0, Math.min(...vals) - 0.03), hi = Math.min(1, Math.max(...vals) + 0.03);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100;
  const y = (p: number) => (1 - (p - lo) / Math.max(0.01, hi - lo)) * 100;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`).join("");
  const maxD = Math.max(...edge.entries.map(e => e.dollars), 1);
  const endY = y(now ?? pts.at(-1)!.p), avgY = y(avg), endX = x(pts.at(-1)!.t);
  const close = Math.abs(avgY - endY) < 12;
  return (
    <figure className={`dk-chart${compact ? " dk-chart--compact" : ""}`} style={{ height }} role="img" data-testid="edge-chart" data-mode="chart"
      aria-label={`${edge.outcome}: millionaires bought at an average ${cents(avg)}; now ${cents(now)}`}>
      <div className="dk-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="100" y1={avgY} y2={avgY} className="dk-avg" vectorEffect="non-scaling-stroke" />
          <path d={d} className="dk-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {edge.entries.filter(e => e.t >= t0).map((e, i) => {
          const r = 6 + 8 * Math.sqrt(e.dollars / maxD);
          return <i key={i} className="dk-entry" style={{ left: `${x(e.t)}%`, top: `${y(e.p)}%`, width: r, height: r }} title={`${dollars(e.dollars)} at ${cents(e.p)}, ${ET.format(new Date(e.t))} ET`} />;
        })}
        <i className="dk-end" style={{ left: `${endX}%`, top: `${endY}%` }} />
        <span className="dk-tnow" style={{ top: `${endY}%` }}>{cents(now)}</span>
        {compact ? null : <span className="dk-tavg" style={{ top: `${avgY}%`, transform: `translateY(${close ? (avgY > endY ? "60%" : "-160%") : "-50%"})` }}>avg {cents(avg)}</span>}
      </div>
      {compact ? null : <figcaption className="dk-axis"><span>{ETD.format(new Date(t0))} ET</span><span>{edge.to - t1 < 10 * 60_000 ? "Now" : `${ET.format(new Date(t1))} ET`}</span></figcaption>}
    </figure>
  );
}

/** Today's millionaire bets as rows: one divider between rows, nothing around a row. */
export function BetRows({ bets, now, copy = true, fresh, moved }: { bets: BoardBet[]; now: number; copy?: boolean; fresh?: ReadonlySet<string>; moved?: ReadonlyMap<string, 1 | -1> }) {
  return (
    <ol className="dk-rows" data-testid="live-flow">
      <li className="dk-row dk-row--head" aria-hidden="true"><span>Time</span><span>Market and wallet</span><span>Side</span><span className="dk-r">Size</span><span className="dk-r">In → now</span><span className="dk-r">Move</span><span /></li>
      {bets.map(b => {
        const dec = decision(b);
        return (
          <li key={b.id} className={`dk-row${fresh?.has(b.id) ? " is-new" : ""}`} data-bet={b.id} data-testid="bet-row">
            <span className="dk-dim dk-time">{ago(b.at, now)}</span>
            <span className="dk-mkt"><span className="dk-title"><MarketName title={b.title} category={b.category} /></span><Wallet short={b.short} pnl={b.pnl} tier={b.tier} /></span>
            <span className="dk-pick">{b.outcome ?? <span className="dk-dim">Members</span>}</span>
            <span className="dk-r dk-num dk-size">{dollars(b.amount)}</span>
            <span className={`dk-r dk-num dk-px${moved?.get(b.id) === 1 ? " is-up" : moved?.get(b.id) === -1 ? " is-down" : ""}`}>{cents(b.priceThen)} → {cents(b.priceNow)}</span>
            <span className="dk-r dk-num dk-mv"><Delta from={b.priceThen} to={b.priceNow} /></span>
            <span className="dk-r dk-act">{dec ? <span className="dk-dim" data-testid="bet-decided">{decidedText(dec, b.outcome)}</span> : copy && b.outcome ? <a href={`/copy/${encodeURIComponent(b.id)}`} className="dk-link" data-testid="bet-copy" aria-label={`Copy: ${b.outcome} in ${b.title}`}>Copy</a> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The featured bet's three actions: one white pill (Copy at the price now), two text actions. */
export function Actions({ bet, now, followed = false }: { bet: BoardBet; now: number | null; followed?: boolean }) {
  const dec = decision({ ...bet, priceNow: now ?? bet.priceNow });
  return (
    <div className="dk-actions">
      {dec ? <span className="dk-dim" data-testid="edge-decided">{decidedText(dec, bet.outcome)}</span> : <a className="dk-pill" href={`/copy/${encodeURIComponent(bet.id)}`} data-testid="edge-copy">Copy at {cents(now ?? bet.priceNow)}</a>}
      <FollowLink wallet={bet.wallet} initial={followed} />
      <PingsLink />
    </div>
  );
}
