/* /briefing: paste a Polymarket or Kalshi link, get its Bet Briefing (lib/briefing), on the terminal. Gated like a
 * market's page: members get every line, everyone else the first line of each section (side-neutral until it
 * settles). ?m=<market id> opens one market straight away (an event's list links here). Information, not advice. */
import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/brand/app/Frame";
import { BetBriefing } from "@/components/brand/BetBriefing";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { gateBriefing } from "@/lib/briefing/gate";
import { resolvePasted, type Resolved } from "@/lib/briefing/link";
import { getBriefing, logTold } from "@/lib/briefing/store";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { isPaid } from "@/lib/plans";
import "@/app/briefing.css";
import "@/app/flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bet Briefing", description: "Paste a Polymarket or Kalshi link: what the bet needs to win, what it costs and pays, who's on each side and what the money says.", robots: { index: false } };

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BriefingPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams, viewer = await getViewer();
  const member = Boolean(viewer.user) && isPaid(viewer.plan);
  const url = one(q.url).slice(0, 500), m = one(q.m);
  const now = Date.now();
  let resolved: Resolved | null = null;
  if (hasDatabase()) {
    if (/^[\w:.-]{3,120}$/.test(m)) resolved = { kind: "market", marketId: m, fallback: null };
    else if (url.trim()) resolved = await resolvePasted(getDb(), url).catch(() => ({ kind: "none", note: "Couldn't read that link just now. Try again." }) as Resolved);
  }
  const b = resolved?.kind === "market" ? await getBriefing(getDb(), resolved.marketId, now, { fallback: resolved.fallback }).catch(() => null) : null;
  if (b && member && viewer.user) await logTold(getDb(), viewer.user.id, b, now).catch(() => undefined);
  const gated = b ? gateBriefing(b, member) : null;
  return (
    <Frame member={member} current="markets" testid="briefing-page">
      <div className="t-wrap tg-page">
        <header className="tg-head">
          <h1 className="tg-h1" id="briefing-h">Bet Briefing.</h1>
          <p className="tg-sub">Paste a Polymarket or Kalshi link. Before you bet: what it takes to win, what it costs and pays, who&apos;s on each side, and what the money says.</p>
        </header>
        <PanelGrid>
          <Panel n={1} title="Paste a market link" meta="Polymarket · Kalshi" span={3} testid="briefing-paste">
            <form className="bb-paste" method="get" action="/briefing" data-testid="briefing-form">
              <label className="b-sr" htmlFor="briefing-url">Market link</label>
              <input id="briefing-url" name="url" type="url" inputMode="url" placeholder="https://polymarket.com/event/…" defaultValue={url} required />
              <button type="submit">BRIEF &lt;GO&gt;</button>
            </form>
            {resolved?.kind === "none" ? <p className="tg-msg" role="status" data-testid="briefing-note" style={{ marginTop: 10 }}>{resolved.note}</p> : null}
            {resolved?.kind === "market" && !gated ? <p className="tg-msg" role="status" data-testid="briefing-note" style={{ marginTop: 10 }}>Insidir doesn&apos;t have that market yet.</p> : null}
          </Panel>
          {resolved?.kind === "pick" ? (
            <Panel n={2} title="Which market?" meta={`${resolved.options.length} in this event`} span={3} testid="briefing-pick-panel">
              <ul className="tg-list" data-testid="briefing-pick">{resolved.options.map((o, i) => <li key={o.marketId} className="tg-li"><span className="tg-li__n">{String(i + 1).padStart(2, "0")}</span><span className="tg-li__h"><Link href={`/briefing?m=${encodeURIComponent(o.marketId)}`}>{o.title}</Link></span></li>)}</ul>
            </Panel>
          ) : null}
          {gated ? (
            <Panel n={2} title={`Bet Briefing · ${gated.title}`} meta={<Link className="t-link" href={marketPath(gated.marketId, gated.title)}>THE MARKET&apos;S PAGE</Link>} span={3} testid="briefing-result"
              source="Polymarket rules and prices · Kalshi · Insidir" fetchedAt={now}>
              <BetBriefing b={gated} />
            </Panel>
          ) : null}
        </PanelGrid>
      </div>
    </Frame>
  );
}
