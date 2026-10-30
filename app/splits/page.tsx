/* /splits: the biggest live disagreements, biggest gap first. Smart money (proven traders) against the crowd (the price
 * now) on open markets, proven traders against all big bets on games, insiders buying stocks that fell 10%+ in 30
 * days and big funds adding in a falling quarter (lib/smart). Free viewers see them 30 minutes late; members get a
 * push alert for each new one of 15+ points. Public. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { getViewer } from "@/lib/auth/viewer";
import { redirect } from "next/navigation";
import { positioningEdge } from "@/lib/smart/gate";
import { positioningPublic } from "@/lib/smart/splits";
import { getDb, hasDatabase } from "@/lib/db";
import type { SplitKind } from "@/lib/db/schema";
import { movePlan } from "@/lib/moves/gate";
import { isPaid } from "@/lib/plans";
import { SPLIT_ALERT_GAP } from "@/lib/smart/splits";
import { liveSplits, type SplitRec } from "@/lib/smart/store";
import { gapLabel, KIND_NAME, splitHref, splitLine } from "@/lib/smart/text";
import { agoText } from "@/lib/moves/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Positioning: proven traders vs. the market", description: "Where proven traders are positioned against the market price, against large positions on a game, or against the stock chart. Every split we flag is scored on a public scorecard." };

const SHOW = [
  { key: "all", label: "All", kinds: undefined },
  { key: "markets", label: "Markets", kinds: ["crowd"] as SplitKind[] },
  { key: "sports", label: "Sports", kinds: ["crowd", "bigmoney"] as SplitKind[] },
  { key: "stocks", label: "Stocks", kinds: ["insider_dip", "fund_add"] as SplitKind[] },
] as const;

export default async function SplitsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show: raw } = await searchParams;
  const show = SHOW.find(s => s.key === raw) ?? SHOW[0];
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  // Off public pages until its scorecard shows a positive edge on 100+ scored calls (lib/smart/gate.ts).
  const edge = hasDatabase() ? await positioningEdge(getDb()).catch(() => null) : null;
  if (!paid && !(edge && positioningPublic(edge))) redirect("/top");
  const until = now - movePlan(viewer.plan).delayMs;
  let list: SplitRec[] = [];
  if (hasDatabase()) list = await liveSplits(getDb(), { kinds: show.kinds, until, limit: 100 }).catch(() => []);
  if (show.key === "markets") list = list.filter(s => s.tab !== "sports");
  if (show.key === "sports") list = list.filter(s => s.tab === "sports");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/splits" trialHref={unlockHref()} />
      <main className="wrap app2 splitsp">
        <header className="phead">
          <h1 className="phead__h">Positioning</h1>
          <p className="phead__sub">Where accounts with a proven record are positioned against the market price, against large positions on a game, or against the stock chart. Largest gap first. Data, not a recommendation.</p>
        </header>
        <nav className="dfilters" aria-label="Show">
          {SHOW.map(s => <a key={s.key} className="chip2" aria-current={show.key === s.key ? "true" : undefined} href={s.key === "all" ? "/splits" : `/splits?show=${s.key}`}>{s.label}</a>)}
          <Link className="chip2 chip2--link" href="/splits/scorecard">Scorecard</Link>
        </nav>
        {!paid ? <p className="dnote dnote--tight">Positioning is shown 30 minutes late. <a href={unlockHref()} data-unlock="splits">Members see them live, with a push alert for every new split of {SPLIT_ALERT_GAP}+ points.</a></p> : null}
        {list.length ? (
          <ol className="slist">
            {list.map(s => (
              <li key={s.id}>
                <Link className="srow" href={splitHref(s)}>
                  <span className="srow__kind">{KIND_NAME[s.kind]}{s.league && s.league !== "other" ? ` · ${s.league.toUpperCase()}` : ""}</span>
                  <span className="srow__title">{s.kind === "insider_dip" || s.kind === "fund_add" ? String(s.detail.company ?? s.title) : s.title}</span>
                  {s.subtitle && s.kind !== "insider_dip" && s.kind !== "fund_add" ? <span className="srow__sub">{s.subtitle}</span> : null}
                  <span className="srow__line">{splitLine(s)}</span>
                  <span className={`srow__gap${s.gap >= SPLIT_ALERT_GAP ? " srow__gap--big" : ""}`}>{gapLabel(s)}</span>
                  <span className="srow__when">{s.kind === "insider_dip" || s.kind === "fund_add" ? String(s.detail.ticker ?? "") : `${Number(s.detail.wallets ?? 0)} proven traders`} · seen {agoText(s.firstSeenAt.getTime(), now)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="tempty">
            <p className="tempty__h">No divergences right now</p>
            <p>A divergence is listed when proven traders and the price, or large positions overall, are 10+ points apart, or when insiders purchase a stock that fell 10%+ in 30 days.</p>
          </div>
        )}
        <p className="tsec__note">Proven traders: 20+ settled markets on Polymarket and a win rate above their average entry. Their open money on each side is compared with the market price now. Every divergence of {SPLIT_ALERT_GAP}+ points goes on the <Link href="/splits/scorecard">public scorecard</Link>, wins and losses.</p>
      </main>
    </>
  );
}
