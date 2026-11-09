/* /told, "What we told you" (members): every briefing, alert and brief line Insidir showed this member, newest first,
 * with when (ET) and how it turned out (Won / Lost / Void / Open) once the market settled. Losses are shown exactly like
 * wins. terminal.told_log; results set by the watcher (lib/watch/job.ts). Information, not advice. */
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Pill, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { GET_CTA } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { isPaid } from "@/lib/plans";
import "../watch.css";

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
    <div className="b-head">
      <Lines as="h1" id="told-h" lines={["What we told you."]} size={56} />
      <p className="b-sub">Every briefing and alert we showed you, and how it turned out once the market settled. Losses included.</p>
    </div>
  );
  if (!member || !viewer.user || !hasDatabase()) {
    return (
      <Frame member={false} current="following" testid="told-page">
        <Stage first testid="told-hero" labelledBy="told-h">
          {head}
          <div className="b-ctas" style={{ marginTop: 24 }}><Pill href="/go" data-checkout="told">{GET_CTA}</Pill></div>
        </Stage>
      </Frame>
    );
  }
  const rows = (await getDb().execute(sql`select id, kind, market_id, market_title, side, headline, body, result, created_at from terminal.told_log
    where user_id = ${viewer.user.id} order by created_at desc limit 500`).catch(() => ({ rows: [] }))).rows as unknown as Row[];
  const settled = rows.filter(r => r.result === "won" || r.result === "lost");
  const won = settled.filter(r => r.result === "won").length;
  return (
    <Frame member current="following" testid="told-page">
      <Stage first testid="told-hero" labelledBy="told-h">
        <div className="w-wrap">
          {head}
          <div className="w-summary" data-testid="told-summary">
            <span className="w-num"><span className="b-small">Told</span><b data-testid="told-count">{rows.length}</b></span>
            <span className="w-num"><span className="b-small">Settled</span><b>{settled.length}</b></span>
            <span className="w-num"><span className="b-small">Their side won</span><b>{won}</b></span>
            <span className="w-num"><span className="b-small">Their side lost</span><b>{settled.length - won}</b></span>
          </div>
          {rows.length ? (
            <ol className="w-told" data-testid="told-rows">
              {rows.map(r => {
                const res = r.result ?? "open";
                return (
                  <li key={r.id} className="w-told__row" data-testid="told-row" data-result={res}>
                    <span className="b-small w-told__when">{ET.format(new Date(r.created_at))} ET</span>
                    <span>
                      <span className="w-told__kind">{KIND[r.kind] ?? r.kind}</span>
                      {r.market_id && r.market_title ? <a className="b-small" href={marketPath(r.market_id, r.market_title)}>{r.market_title}</a> : null}
                      <p className="w-alert__h">{r.headline}</p>
                      {r.body ? <p className="w-alert__m">{r.body}</p> : null}
                    </span>
                    <span className={`w-res w-res--${res}`}>{RESULT[res] ?? res}</span>
                  </li>
                );
              })}
            </ol>
          ) : <p className="b-empty">Nothing yet. Watch a bet on <a href="/watch">Watch my bet</a> and every alert lands here.</p>}
          <p className="b-small" style={{ marginTop: 20 }}>&ldquo;Won&rdquo; and &ldquo;Lost&rdquo; are for the side the line was about, once its market settled. Past results don&apos;t predict future ones. Information, not advice.</p>
        </div>
      </Stage>
    </Frame>
  );
}
