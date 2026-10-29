/* /check/history: every bet a member checked, newest first, and how each leg settled (read from the venue when it
 * was still open). Members only. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { checksFor, settleCheck } from "@/lib/check/run";
import { verdictLabel } from "@/components/check/CheckResult";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your checked positions", robots: { index: false } };
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

function outcome(results: string[] | null): string {
  if (!results) return "Open";
  if (results.some(r => r === "lost")) return "Lost";
  if (results.every(r => r === "won" || r === "void")) return results.every(r => r === "void") ? "Voided" : "Won";
  return "Open";
}

export default async function HistoryPage() {
  const viewer = await requireMember("/check/history");
  const db = getDb(), now = Date.now();
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  const list = await checksFor(db, viewer.user!.id);
  // Open checks are settled from their venues (at most 10 per visit, newest first, all at once).
  await Promise.all(list.filter(c => !c.results || c.results.includes("open")).slice(0, 10).map(async c => { c.results = await settleCheck(db, clients, c, now).catch(() => c.results); }));
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} current="/check" trialHref={unlockHref()} />
      <main className="wrap app2 checkp">
        <header className="phead">
          <h1 className="phead__h">Your checked positions</h1>
          <p className="phead__sub">Every slip you checked, what the data said, and how it settled.</p>
        </header>
        {list.length ? (
          <ol className="slist">
            {list.map(c => {
              const o = outcome(c.results);
              return (
                <li key={c.id}>
                  <Link className="srow" href={`/check/${c.id}`}>
                    <span className="srow__kind">{DAY.format(new Date(c.createdAt))}{c.book ? ` · ${c.book}` : ""} · {c.legs.length > 1 ? `${c.legs.length} legs` : "1 leg"}</span>
                    <span className="srow__title">{c.summary}</span>
                    <span className="srow__line">{c.legs.map(l => verdictLabel(l)).join(" · ")}</span>
                    <span className={`srow__gap${o === "Won" ? " srow__gap--won" : o === "Lost" ? " srow__gap--lost" : ""}`}>{o}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : <div className="tempty"><p className="tempty__h">No checked positions yet</p><p><Link href="/check">Check your first position</Link>.</p></div>}
      </main>
    </>
  );
}
