/* A position as the subject: the market's own image (a logo on a neutral disc), the market, the side, "in at 79¢ ·
 * now 94¢" (green or red only for the change), the wallet's all-time profit (never a face), the entry-vs-now chart,
 * then Copy and Follow. The chart's line draws as its stage enters; the entry dots pop at their times; "now" lands last.
 * Real points only: without the venue's history it says so and shows the entry and the price now. */
import Image from "next/image";
import type { Edge } from "@/lib/desk/edge";
import type { MarketArt } from "@/lib/market/art";
import { decidedText, decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { FollowLink } from "@/components/desk/Act";
import { Panel, Pill } from "./index";

const cents = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}¢`);
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const ET = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function Change({ from, to }: { from: number | null; to: number | null }) {
  if (from === null || to === null) return null;
  const d = Math.round((to - from) * 100);
  if (!d) return <span className="b-dim">unchanged</span>;
  return <span className={d > 0 ? "s-up" : "s-down"}>{d > 0 ? "up" : "down"} {Math.abs(d)}¢</span>;
}

export function EntryChart({ edge }: { edge: Edge }) {
  const pts = edge.points, now = edge.now, avg = edge.avg;
  if (pts.length < 2) return <p className="b-small" data-testid="entry-chart" data-mode="none">Price history isn&apos;t available from the venue right now: in at {cents(avg)}, now {cents(now)}.</p>;
  const t0 = pts[0]!.t, t1 = pts.at(-1)!.t;
  const vals = [...pts.map(p => p.p), avg, ...(now !== null ? [now] : [])];
  const lo = Math.max(0, Math.min(...vals) - 0.03), hi = Math.min(1, Math.max(...vals) + 0.03);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100;
  const y = (p: number) => (1 - (p - lo) / Math.max(0.01, hi - lo)) * 100;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`).join("");
  const maxD = Math.max(...edge.entries.map(e => e.dollars), 1), endY = y(now ?? pts.at(-1)!.p);
  return (
    <figure className="s-chart" data-testid="entry-chart" data-mode="chart" role="img" aria-label={`In at ${cents(avg)} on average, now ${cents(now)}`}>
      <div className="s-chart__plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="100" y1={y(avg)} y2={y(avg)} className="s-chart__avg" vectorEffect="non-scaling-stroke" />
          <path d={d} className="s-chart__line s-draw" pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {edge.entries.filter(e => e.t >= t0).map((e, i) => {
          const r = 6 + 8 * Math.sqrt(e.dollars / maxD);
          return <i key={i} className="s-chart__entry s-pop" style={{ left: `${x(e.t)}%`, top: `${y(e.p)}%`, width: r, height: r, "--at": (x(e.t) / 100).toFixed(2) } as React.CSSProperties} title={`${dollars(e.dollars)} at ${cents(e.p)}`} />;
        })}
        <span className="s-chart__now s-land" style={{ top: `${endY}%` }}>now {cents(now)}</span>
      </div>
      <figcaption className="b-small s-chart__axis"><span>{ET.format(new Date(t0))} ET</span><span>in at {cents(avg)} on average</span></figcaption>
    </figure>
  );
}

export function Ticket({ bet, edge, art, followed = false, testid = "ticket" }: { bet: BoardBet; edge: Edge | null; art: MarketArt | null; followed?: boolean; testid?: string }) {
  const now = edge?.now ?? bet.priceNow, entry = edge?.avg ?? bet.priceThen, dec = decision({ ...bet, priceNow: now });
  return (
    <Panel className="s-ticket" testid={testid}>
      <div className="s-ticket__head">
        {art?.image ? <span className="s-disc"><Image src={art.image} alt="" width={56} height={56} sizes="112px" quality={85} /></span> : null}
        <div><h3 className="s-ticket__mkt">{bet.title}</h3><p className="b-small">{dollars(edge?.total ?? bet.amount)} from wallets up $1M+</p></div>
      </div>
      <div className="s-ticket__px">
        <span className="s-big b-num" data-count={Math.round((now ?? 0) * 100)} data-fmt="cents">{cents(now)}</span>
        <span><b>{bet.outcome}</b><br /><span className="b-small">in at {cents(entry)} · now {cents(now)} <Change from={entry} to={now} /></span></span>
      </div>
      <p className="b-small">{bet.short}{bet.pnl !== null ? <> · <b>{signed(bet.pnl)}</b> all-time</> : null}</p>
      {edge ? <EntryChart edge={edge} /> : null}
      <div className="b-ctas s-ticket__act">
        {dec ? <span className="b-small" data-testid="ticket-decided">{decidedText(dec, bet.outcome)}</span> : <Pill href={`/copy/${encodeURIComponent(bet.id)}`} data-testid="ticket-copy">Copy at {cents(now)}</Pill>}
        <FollowLink wallet={bet.wallet} initial={followed} />
      </div>
    </Panel>
  );
}
