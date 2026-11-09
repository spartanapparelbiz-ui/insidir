/* /brief: the Daily Brief, on the terminal. The 5 biggest things the $1M+ money did since 8 PM ET last night, each in
 * two lines (what happened, what it means for someone about to bet), and, for members, what changed on their watched
 * bets (lib/brief/build.ts). Visitors get it without sides (and on the board's 60-minute delay), with the way in.
 * Members' lines are logged to "What we told you"; opening it is an activation event. Information, not advice. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { Frame } from "@/components/brand/app/Frame";
import { TierBadge } from "@/components/brand/Bits";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { category as categoryInfo } from "@/lib/brand/categories";
import { buildBrief, logBriefShown, type Brief } from "@/lib/brief/build";
import { etClock } from "@/lib/briefing/math";
import { GET_CTA } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { recordBriefOpen } from "@/lib/metrics/events";
import { isPaid } from "@/lib/plans";
import "../brief.css";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The Daily Brief: what the $1M+ money did overnight",
  description: "Every morning: the 5 biggest moves by $1M+ Polymarket wallets overnight, each explained in two lines. Information, not advice.",
  alternates: { canonical: "/brief" },
};

const VIA = new Set(["app", "email", "push", "nav", "home"]);

export default async function BriefPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [q, viewer, jar] = await Promise.all([searchParams, getViewer(), cookies()]);
  const member = isPaid(viewer.plan) && Boolean(viewer.user), now = Date.now();
  const via = typeof q.via === "string" && VIA.has(q.via) ? q.via : "app";
  let brief: Brief | null = null;
  if (hasDatabase()) brief = await buildBrief(getDb(), now, { member, userId: viewer.user?.id ?? null }).catch(e => { console.error("brief", e instanceof Error ? e.message : e); return null; });
  const userId = viewer.user?.id ?? null;
  if (userId) {
    after(async () => {
      await recordBriefOpen(userId, jar.get(VISITOR_COOKIE)?.value ?? null, via, now);
      if (member && brief) await logBriefShown(getDb(), userId, brief).catch(() => undefined);
    });
  }
  const sinceText = brief ? `${etClock(brief.since).toUpperCase()} ET` : "8 P.M. ET";
  const since = brief ? `since ${etClock(brief.since)} ET last night` : "overnight";
  return (
    <Frame member={member} current="home" testid="brief-page">
      <div className="t-wrap tg-page">
        <header className="tg-head" data-testid="brief-hero">
          <h1 className="tg-h1" id="brief-h">The Daily Brief.</h1>
          <p className="tg-sub">The 5 biggest things the $1M+ money did {since}, and what each one means for you.{member ? "" : " Members see which side each one took."}</p>
        </header>
        <PanelGrid>
          <Panel n={1} title={`Overnight · the 5 biggest $1M+ moves since ${sinceText}`} meta={brief ? `${brief.items.length} of 5${member ? "" : " · 60 min late"}` : null} span={member ? 2 : 3}
            testid="brief-items" source="Polymarket public data · Insidir" fetchedAt={now}>
            {brief && brief.items.length ? (
              <ol className="tg-list" data-testid="brief-list">
                {brief.items.map((it, i) => (
                  <li key={it.key} className="tg-li" data-testid="brief-item" data-side={it.side ?? ""}>
                    <span className="tg-li__n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="tg-li__h"><a href={it.href}>{it.lines[0]}</a></span>
                    <span className="tg-li__m" data-testid="brief-why">{it.lines[1]}</span>
                    <span className="tg-li__meta">{it.tier ? <TierBadge tier={it.tier} /> : null}<span>{it.short}</span><span>· {categoryInfo(it.category).name}</span><span>· {etClock(it.at)} ET</span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="t-empty" data-testid="brief-empty">No $1M+ wallet has bet since {brief ? etClock(brief.since) : "8 p.m."} ET last night yet.</p>}
            {!member ? (
              <div className="tg-row">
                <a className="t-cta" href="/go" data-testid="brief-join" data-unlock="brief">{GET_CTA}</a>
                <span className="tg-note" style={{ marginTop: 0 }}>Members see every side live, and the brief at 8 AM.</span>
              </div>
            ) : null}
          </Panel>
          {member ? (
            <Panel n={2} title="Your watched bets" meta={brief ? `${brief.watched.length} open` : null} testid="brief-watched" source="Polymarket prices · your watched bets" fetchedAt={now}
              empty={brief && brief.watched.length ? null : undefined}>
              {brief && brief.watched.length ? (
                <ul className="tg-list">
                  {brief.watched.map(w => (
                    <li key={w.id} className="tg-li" data-testid="brief-watch-item">
                      <span className="tg-li__n">·</span>
                      <span className="tg-li__h"><a href={w.href}>{w.lines[0]}</a></span>
                      <span className="tg-li__m">{w.lines[1]}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="t-empty">You aren&apos;t watching any bets yet. <a className="t-link" href="/watch">Watch a bet</a> and its overnight changes show up here.</p>}
            </Panel>
          ) : null}
        </PanelGrid>
        <p id="brief-foot-h" className="bf-foot tg-note" data-testid="brief-foot">Information, not advice. Past results don&apos;t predict future ones. <a href="/record">Every position we&apos;ve flagged, losses included</a>.</p>
      </div>
    </Frame>
  );
}
