/* /briefing: paste a Polymarket or Kalshi link, get its Bet Briefing (lib/briefing). Gated like a market's page:
 * members get every line, everyone else the first line of each section (side-neutral until it settles). ?m=<market
 * id> opens one market straight away (an event's list links here). Information, not advice. */
import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/brand/app/Frame";
import { BetBriefing } from "@/components/brand/BetBriefing";
import { Lines, Panel, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { gateBriefing } from "@/lib/briefing/gate";
import { resolvePasted, type Resolved } from "@/lib/briefing/link";
import { getBriefing, logTold } from "@/lib/briefing/store";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { isPaid } from "@/lib/plans";
import "@/app/briefing.css";

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
      <Stage bg={{ kind: "globe", dark: 0.6 }} first labelledBy="briefing-h">
        <div className="b-head">
          <Lines as="h1" id="briefing-h" lines={["Bet Briefing."]} size={56} />
          <p className="b-sub">Paste a Polymarket or Kalshi link. Before you bet: what it takes to win, what it costs and pays, who&apos;s on each side, and what the money says.</p>
        </div>
        <Panel className="s-col">
          <form className="bb-paste" method="get" action="/briefing" data-testid="briefing-form">
            <label className="sr-only" htmlFor="briefing-url">Market link</label>
            <input id="briefing-url" name="url" type="url" inputMode="url" placeholder="https://polymarket.com/event/…" defaultValue={url} required />
            <button type="submit">Get the briefing</button>
          </form>
        </Panel>
      </Stage>
      {resolved?.kind === "none" ? <p className="b-small b-center" role="status" data-testid="briefing-note">{resolved.note}</p> : null}
      {resolved?.kind === "pick" ? (
        <Stage bg={{ kind: "globe", dark: 0.7 }} labelledBy="pick-h">
          <div className="b-head"><Lines as="h2" id="pick-h" lines={["Which market?"]} size={40} /></div>
          <Panel className="s-col"><ul className="b-rows" data-testid="briefing-pick">{resolved.options.map(o => <li key={o.marketId}><Link href={`/briefing?m=${encodeURIComponent(o.marketId)}`}>{o.title}</Link></li>)}</ul></Panel>
        </Stage>
      ) : null}
      {resolved?.kind === "market" && !gated ? <p className="b-small b-center" role="status" data-testid="briefing-note">Insidir doesn&apos;t have that market yet.</p> : null}
      {gated ? (
        <Stage bg={{ kind: "globe", dark: 0.65 }} labelledBy="bb-title">
          <div className="b-head">
            <Lines as="h2" id="bb-title" lines={[gated.title]} size={gated.title.length > 44 ? 32 : 40} />
            <p className="b-sub"><Link href={marketPath(gated.marketId, gated.title)}>The market&apos;s page</Link></p>
          </div>
          <Panel className="s-col"><BetBriefing b={gated} /></Panel>
        </Stage>
      ) : null}
    </Frame>
  );
}
