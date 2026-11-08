/* /t/<match id>: an Autopilot ticket, what a match push opens. The finished Kalshi bet (market, side, limit price,
 * contracts, cost), what the wallet paid, how long after their trade it was sent, and one button to the exact Kalshi
 * market. Only the member it was sent to sees it. Insidir never places the bet. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isReady } from "@/lib/features";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, Pill, Stage } from "@/components/system";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { matchFor, paperPnl } from "@/lib/autopilot/queries";
import { sentAfter } from "@/lib/autopilot/engine";
import { dollars } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Kalshi ticket", robots: { index: false } };
const cents = (p: number | null) => (p === null ? "No price" : `${Math.round(p * 100)}¢`);
const TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isReady("autopilot")) redirect("/"); // Autopilot is off until reviewed (lib/features.ts)
  const [{ id }, viewer] = await Promise.all([params, requireMember("/autopilot")]);
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const m = await matchFor(getDb(), n, viewer.user!.id).catch(() => null);
  if (!m) notFound();
  const live = m.status === "sent" || m.status === "quiet";
  const side = m.side === "yes" ? "Yes" : "No";
  const pnl = paperPnl(m);
  const state = m.exitAt ? `The wallet sold out ${TIME.format(m.exitAt)}${m.exitPrice !== null ? `; Kalshi's bid then was ${cents(m.exitPrice)}` : ""}.`
    : m.result ? `Settled: ${m.result === "won" ? "won" : m.result === "lost" ? "lost" : "void"}.` : null;
  return (
    <Frame member current="autopilot" testid="ticket-page">
      <Stage first className="ap-stage" testid="ticket" labelledBy="tk-h">
        <div className="b-head">
          <p className="b-label">{m.ruleName}</p>
          <h1 id="tk-h" className="b-h2 ap-h1" data-testid="ticket-title">{m.title}</h1>
          <p className="b-sub" data-testid="ticket-sent">{sentAfter(m.latencyMs)} · {TIME.format(m.matchedAt)}</p>
        </div>
        <Panel className="s-col s-form" testid="ticket-panel" data-status={m.status}>
          {live ? (
            <>
              <dl className="ap-ticket">
                <div><dt className="b-small">Buy on Kalshi</dt><dd data-testid="ticket-side">{m.outcome} · {side}</dd></div>
                <div><dt className="b-small">Limit price</dt><dd data-testid="ticket-limit">{cents(m.limitPrice)}</dd></div>
                <div><dt className="b-small">Contracts</dt><dd data-testid="ticket-contracts">{m.contracts}</dd></div>
                <div><dt className="b-small">Cost at the limit</dt><dd data-testid="ticket-cost">{dollars(m.stake ?? 0)}</dd></div>
              </dl>
              <p className="b-small">A proven wallet put {dollars(m.amount)} on {m.outcome} at {cents(m.theirPrice)}. Kalshi&apos;s ask when this was sent: {cents(m.ask)}. On Kalshi, buy {side} on {m.outcome} with a limit order at {cents(m.limitPrice)}; if the price has moved past it, the order waits instead of paying more.</p>
              <div className="b-ctas"><Pill href={m.kalshiUrl} data-testid="ticket-open">Open on Kalshi</Pill></div>
              {/(SPREAD|TOTAL)-/.test(m.kalshiId) ? <p className="b-small" data-testid="ticket-line">Kalshi lists every line for this game on one page: pick the line on this ticket ({m.outcome}), market {m.kalshiId}.</p> : null}
            </>
          ) : <p className="b-small" data-testid="ticket-skip">{m.reason}</p>}
          {state ? <p className="b-small" data-testid="ticket-state">{state}{pnl !== null ? ` Paper result: ${pnl >= 0 ? "+" : "−"}${dollars(Math.abs(pnl))}.` : ""}</p> : null}
          <p className="b-small">Information, not advice. Insidir doesn&apos;t place trades or hold funds.</p>
        </Panel>
      </Stage>
    </Frame>
  );
}
