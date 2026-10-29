/* /splits/scorecard: every split we flagged (15+ points when first seen), and which side was right once it ended,
 * losses included. Markets are scored when they settle; stocks 90 days after the flag. Public. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Section, Table, Tiles } from "@/components/stats/Stats";
import { getViewer } from "@/lib/auth/viewer";
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
  const rows = hasDatabase() ? await flaggedSplits(getDb()).catch(() => []) : [];
  const all = scorecard(rows), mk = scorecard(rows.filter(r => r.kind === "crowd" || r.kind === "bigmoney")), st = scorecard(rows.filter(r => r.kind === "insider_dip" || r.kind === "fund_add"));
  const share = (x: ReturnType<typeof scorecard>) => (x.share === null ? null : `${Math.round(x.share * 100)}%`);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/splits" trialHref={unlockHref()} />
      <main className="wrap app2">
        <header className="phead">
          <h1 className="phead__h">Positioning scorecard</h1>
          <p className="phead__sub">Every divergence we flagged, and which side was right. Gains and losses, all of them.</p>
        </header>
        <Tiles cols={4} label="Scorecard" tiles={[
          { label: "Divergences flagged", value: rows.length.toLocaleString("en-US") },
          { label: "Scored so far", value: all.scored.toLocaleString("en-US") },
          { label: "Proven traders right, markets", ...(share(mk) ? { value: share(mk) } : { value: "—", note: "None scored yet" }) },
          { label: "Insiders and funds right, stocks", ...(share(st) ? { value: share(st) } : { value: "—", note: "None scored yet" }) },
        ]} />
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
