/* /brief: the Daily Brief. The 5 biggest things the $1M+ money did since 8 PM ET last night, each in two lines (what
 * happened, what it means for someone about to bet), and, for members, what changed on their watched bets
 * (lib/brief/build.ts). Visitors get it without sides (and on the board's 60-minute delay), with the way in. Members'
 * lines are logged to "What we told you"; opening it is an activation event. Information, not advice. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { Frame } from "@/components/brand/app/Frame";
import { TierBadge } from "@/components/brand/Bits";
import { Lines, Stage } from "@/components/system";
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
  const since = brief ? `since ${etClock(brief.since)} ET last night` : "overnight";
  return (
    <Frame member={member} current="home" testid="brief-page">
      <Stage first testid="brief-hero" labelledBy="brief-h">
        <div className="b-head">
          <Lines as="h1" id="brief-h" lines={["The Daily Brief."]} size={56} />
          <p className="b-sub">The 5 biggest things the $1M+ money did {since}, and what each one means for you.{member ? "" : " Members see which side each one took."}</p>
        </div>
      </Stage>
      <Stage testid="brief-items" labelledBy="brief-items-h">
        <h2 id="brief-items-h" className="b-label">Overnight</h2>
        {brief && brief.items.length ? (
          <ol className="bf-list" data-testid="brief-list">
            {brief.items.map((it, i) => (
              <li key={it.key} className="bf-item" data-testid="brief-item" data-side={it.side ?? ""}>
                <span className="bf-n b-num">{i + 1}</span>
                <span className="bf-head"><a href={it.href}>{it.lines[0]}</a></span>
                <span className="bf-why" data-testid="brief-why">{it.lines[1]}</span>
                <span className="bf-meta">{it.tier ? <TierBadge tier={it.tier} /> : null} {it.short} · {categoryInfo(it.category).name} · {etClock(it.at)} ET</span>
              </li>
            ))}
          </ol>
        ) : <p className="b-small" data-testid="brief-empty">No $1M+ wallet has trade since {brief ? etClock(brief.since) : "8 p.m."} ET last night yet.</p>}
        {!member ? (
          <div className="bf-cta">
            <a className="b-btn b-btn-lg b-primary" href="/go" data-testid="brief-join" data-unlock="brief">{GET_CTA}</a>
            <span className="b-small">Members see every side live, and the brief at 8 AM.</span>
          </div>
        ) : null}
      </Stage>
      {member ? (
        <Stage testid="brief-watched" labelledBy="brief-watched-h">
          <h2 id="brief-watched-h" className="b-label">Your watched trades</h2>
          {brief && brief.watched.length ? (
            <ul className="bf-list">
              {brief.watched.map(w => (
                <li key={w.id} className="bf-item" data-testid="brief-watch-item">
                  <span className="bf-n b-num">·</span>
                  <span className="bf-head"><a href={w.href}>{w.lines[0]}</a></span>
                  <span className="bf-why">{w.lines[1]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="b-small">You aren&apos;t watching any positions yet. Add one and it shows here. <a href="/watch">Watch a trade</a> and its overnight changes show up here.</p>}
        </Stage>
      ) : null}
      <Stage testid="brief-foot" labelledBy="brief-foot-h">
        <p id="brief-foot-h" className="bf-foot">Information, not advice. Past results don&apos;t predict future ones. <a href="/record">Every position we&apos;ve flagged, losses included</a>.</p>
      </Stage>
    </Frame>
  );
}
