/* /told, "What we told you" (members), on the terminal: every briefing, alert and brief line Insidir showed this
 * member, newest first, with when (ET) and how it turned out (Won / Lost / Void / Open) once the market settled. Losses
 * are shown exactly like wins. terminal.told_log; results set by the watcher (lib/watch/job.ts). Information, not advice. */
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { GET_CTA } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { isPaid } from "@/lib/plans";
import "../watch.css";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What we told you", description: "Every briefing and alert Insidir showed you, and how it turned out, losses included.", robots: { index: false } };

const KIND: Record<string, string> = { briefing: "Briefing", alert: "Alert", brief: "Brief" };
const RESULT: Record<string, string> = { won: "Won", lost: "Lost", void: "Void", open: "Open" };
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

interface Row { id: string; kind: string; market_id: string | null; market_title: string | null; side: string | null; headline: string; body: string | null; result: string | null; created_at: string }

export default async function ToldPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const head = (
    <header className="tg-head" data-testid="told-hero">
      <h1 className="tg-h1" id="told-h">What we told you.</h1>
      <p className="tg-sub">Every briefing and alert we showed you, and how it turned out once the market settled. Losses included.</p>
    </header>
  );
  if (!member || !viewer.user || !hasDatabase()) {
    return (
      <Frame member={false} current="following" testid="told-page">
        <div className="t-wrap tg-page">
          {head}
          <PanelGrid>
            <Panel n={1} title="What we told you · members" span={3} testid="told-about">
              <p className="tg-body">Members get a record of every briefing, alert and brief line we showed them, and how each one turned out, losses included.</p>
              <div className="tg-row"><a className="t-cta" href="/go" data-checkout="told">{GET_CTA}</a></div>
            </Panel>
          </PanelGrid>
        </div>
      </Frame>
    );
  }
  const now = Date.now();
  const rows = (await getDb().execute(sql`select id, kind, market_id, market_title, side, headline, body, result, created_at from terminal.told_log
    where user_id = ${viewer.user.id} order by created_at desc limit 500`).catch(() => ({ rows: [] }))).rows as unknown as Row[];
  const settled = rows.filter(r => r.result === "won" || r.result === "lost");
  const won = settled.filter(r => r.result === "won").length;
  return (
    <Frame member current="following" testid="told-page">
      <div className="t-wrap tg-page">
        {head}
        <PanelGrid>
          <Panel n={1} title="Summary" span={3} testid="told-summary-panel" source="Insidir · your briefings, alerts and briefs" fetchedAt={now}>
            <dl className="tg-kpis" data-testid="told-summary">
              <div className="tg-kpi"><dt className="t-label">Told</dt><dd className="tg-kpi__n" data-testid="told-count">{rows.length}</dd></div>
              <div className="tg-kpi"><dt className="t-label">Settled</dt><dd className="tg-kpi__n">{settled.length}</dd></div>
              <div className="tg-kpi"><dt className="t-label">Their side won</dt><dd className="tg-kpi__n">{won}</dd></div>
              <div className="tg-kpi"><dt className="t-label">Their side lost</dt><dd className="tg-kpi__n">{settled.length - won}</dd></div>
            </dl>
          </Panel>
          <Panel n={2} title="Everything we told you" meta={`${rows.length} lines · newest first`} span={3} testid="told-log" source="Insidir · results from Polymarket settlement" fetchedAt={now}
            empty={rows.length ? null : undefined}>
            {rows.length ? (
              <div className="t-scroll">
                <table className="t-table">
                  <thead><tr><th scope="col">When (ET)</th><th scope="col">Kind</th><th scope="col">What we said</th><th scope="col" className="r">Result</th></tr></thead>
                  <tbody data-testid="told-rows">
                    {rows.map(r => {
                      const res = r.result ?? "open";
                      return (
                        <tr key={r.id} data-testid="told-row" data-result={res}>
                          <td className="t-muted">{ET.format(new Date(r.created_at))}</td>
                          <td><span className="tg-tag w-told__kind">{KIND[r.kind] ?? r.kind}</span></td>
                          <td className="w-told__what">
                            {r.market_id && r.market_title ? <a className="t-link" href={marketPath(r.market_id, r.market_title)}>{r.market_title}</a> : null}
                            <p className="w-alert__h">{r.headline}</p>
                            {r.body ? <p className="w-alert__m">{r.body}</p> : null}
                          </td>
                          <td className="r"><span className={`w-res w-res--${res}`}>{RESULT[res] ?? res}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="t-empty">Nothing yet. Watch a bet on <a className="t-link" href="/watch">Watch my bet</a> and every alert lands here.</p>}
            <p className="tg-note">&ldquo;Won&rdquo; and &ldquo;Lost&rdquo; are for the side the line was about, once its market settled. Past results don&apos;t predict future ones. Information, not advice.</p>
          </Panel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
