/* /splits/scorecard: every split we flagged (15+ points when first seen), and which side was right once it ended,
 * losses included. Markets are scored when they settle; stocks 90 days after the flag. Public. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Section, Table, Tiles } from "@/components/stats/Stats";
import { getViewer } from "@/lib/auth/viewer";
import { redirect } from "next/navigation";
import { isPaid } from "@/lib/plans";
import { PAST } from "@/lib/copy";
import { positioningEdge } from "@/lib/smart/gate";
import { edgeOf, positioningPublic, SCORE_MIN } from "@/lib/smart/splits";
import { getDb, hasDatabase } from "@/lib/db";
import { scorecard, STOCK_WINDOW_DAYS } from "@/lib/smart/splits";
import { flaggedSplits, type SplitRec } from "@/lib/smart/store";
import { KIND_NAME, pct, splitHref, yesName } from "@/lib/smart/text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Positioning scorecard", description: "Every divergence between proven traders and the market we flagged, and which side was right. Losses included." };

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function called(s: SplitRec): string {
  if (s.kind === "insider_dip" || s.kind === "fund_add") return `${String(s.detail.ticker ?? "")} up in ${STOCK_WINDOW_DAYS} days`;
  const side = s.smartSide === "yes" ? yesName(s.detail) ?? "Yes" : String(s.detail.noLabel ?? "No");
  return `${side} (${s.kind === "bigmoney" ? "large positions" : "market"} ${pct(s.flaggedCrowd ?? s.crowd ?? 0)}, smart ${pct(s.flaggedSmart ?? s.smart ?? 0)})`;
}

function result(s: SplitRec): string {
  if (!s.resolvedAt) return "Open";
  if (s.smartRight === null) return "Void";
  return s.smartRight ? "Proven traders right" : "Proven traders wrong";
}

export default async function ScorecardPage() {
  const viewer = await getViewer();
  const gate = hasDatabase() ? await positioningEdge(getDb()).catch(() => null) : null;
  // Off public pages until the edge is positive on 100+ scored calls; members can still see where it stands.
  if (!(gate && positioningPublic(gate)) && !isPaid(viewer.plan)) redirect("/top");
  const rows = hasDatabase() ? await flaggedSplits(getDb(), 20_000).catch(() => []) : [];
  // The tiles read the calls as they are now (the gate's answer is kept for up to 10 minutes).
  const edge = hasDatabase() ? edgeOf(rows) : null;
  const all = scorecard(rows), mk = scorecard(rows.filter(r => r.kind === "crowd" || r.kind === "bigmoney")), st = scorecard(rows.filter(r => r.kind === "insider_dip" || r.kind === "fund_add"));
  const share = (x: ReturnType<typeof scorecard>) => (x.share === null ? null : `${Math.round(x.share * 100)}%`);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/splits" trialHref={unlockHref()} />
      <main className="wrap app2">
        <header className="phead">
          <h1 className="phead__h">Positioning scorecard</h1>
          <p className="phead__sub">Every divergence we flagged, and how the side proven traders leaned to did. Scored as edge: how often that side won, minus the price the market already gave it when flagged. A call counts with 3+ proven traders in and the side priced 5–95%. {PAST}</p>
        </header>
        {edge && !positioningPublic(edge) ? <p className="dnote" data-testid="positioning-hidden">Members only for now: Positioning goes public once its edge is positive on {SCORE_MIN} scored calls ({edge.scored} so far{edge.edge !== null ? `, edge ${edge.edge >= 0 ? "+" : "−"}${Math.abs(Math.round(edge.edge * 1000) / 10)} points` : ""}).</p> : null}
        <Tiles cols={4} label="Scorecard" tiles={[
          { label: "Market calls scored", value: (edge?.scored ?? 0).toLocaleString("en-US") },
          { label: "Their side won", ...(edge?.winRate != null ? { value: `${Math.round(edge.winRate * 1000) / 10}%` } : { value: "—", note: "None scored yet" }) },
          { label: "Average price of that side", ...(edge?.avgPrice != null ? { value: `${Math.round(edge.avgPrice * 1000) / 10}%` } : { value: "—", note: "None scored yet" }) },
          { label: "Edge", ...(edge?.edge != null ? { value: `${edge.edge >= 0 ? "+" : "−"}${Math.abs(Math.round(edge.edge * 1000) / 10)} pts` } : { value: "—", note: "None scored yet" }) },
        ]} />
        <p className="dnote">Stocks (insiders and funds buying a fall): {share(st) ? `${share(st)} up ${STOCK_WINDOW_DAYS} days later, of ${st.scored} scored` : "none scored yet"}. Every flag, before today's rules too: {all.scored.toLocaleString("en-US")} scored, {share(mk) ?? "—"} of market calls right.</p>
        <Section id="sc-h" title="Every flagged divergence" note={`Markets are scored when they settle: proven traders were right if the side they leaned to, against the market, won. Stocks are scored ${STOCK_WINDOW_DAYS} days after the flag: right if the price is higher. Past results, not a promise.`}>
          {rows.length ? (
            <Table label="Flagged divergences" head={["Flagged", "Market", "Proven traders", "Gap", "Result"]} numeric={[3]} rows={rows.map(s => [
              day(s.flaggedAt!),
              <Link key="t" className="dtable__link" href={splitHref(s)}>{s.kind === "insider_dip" || s.kind === "fund_add" ? String(s.detail.company ?? s.title) : s.title}<span className="dtable__sub">{KIND_NAME[s.kind]}</span></Link>,
              called(s),
              s.kind === "insider_dip" || s.kind === "fund_add" ? `−${s.flaggedGap ?? s.gap}%` : `${Math.round(s.flaggedGap ?? s.gap)} pts`,
              <span key="r" className={s.smartRight === true ? "money" : s.smartRight === false ? "loss" : undefined}>{result(s)}</span>,
            ])} />
          ) : <p className="dnote">No divergence has been flagged yet. The first one of 15+ points is listed here and stays, right or wrong.</p>}
        </Section>
      </main>
    </>
  );
}
