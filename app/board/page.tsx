/* The Millionaires' board (/board): every millionaire bet (lib/millionaire/board.ts: a $5K+ bet by a watchlist wallet
 * with $100K+ all-time profit), newest first: the market, the side, the size, the price then → now with its change, the
 * tier badge, and when. Category filters, and on Nov 3–4 an "Election night" filter that pins Senate and House.
 * Members see it live in the dashboard frame (it refreshes itself); visitors see it 60 minutes late in the template
 * frame, with the live count of the last hour. Never who is behind a wallet. */
import type { Metadata, Viewport } from "next";
import { unlockHref } from "@/components/app/links";
import { BoardList } from "@/components/millionaire/BoardList";
import { OpenFrame } from "@/components/open/Frame";
import { Shell } from "@/components/sky/Shell";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { boardRows, electionNight, lastHourCount, VISITOR_DELAY_MS, type BoardFilter, type BoardRow } from "@/lib/millionaire/board";
import { CATS, isCat } from "@/lib/nx/data";
import { isPaid, TRIAL } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Millionaires' board", description: "Every bet from Polymarket wallets that have made $100K to $1M+ all-time: the market, the side, the size and the price." };
export const viewport: Viewport = { themeColor: "#070B14" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const now = Date.now(), night = electionNight(now);
  const filter: BoardFilter | null = sp.f === "election-night" && night ? "election-night" : isCat(sp.f) ? sp.f : null;
  const db = hasDatabase() ? getDb() : null;
  const [rows, hour]: [BoardRow[], number] = db ? await Promise.all([
    boardRows(db, now, { delayMs: member ? 0 : VISITOR_DELAY_MS, limit: 60, filter }).catch(() => []),
    lastHourCount(db, now).catch(() => 0),
  ]) : [[], 0];
  const tabs: Array<[string | null, string]> = [[null, "All"], ...(night ? [["election-night", "Election night"] as [string, string]] : []), ...CATS.map(c => [c.key, c.label] as [string, string])];
  const body = (
    <section className="skm-sec mb-page" aria-labelledby="board-h" data-testid="board-page">
      <div>
        <h1 id="board-h" className="sk-h2">The Millionaires&apos; board</h1>
        <p className="sk-muted">Every bet of $5K+ from Polymarket wallets that have made $100K or more all-time, newest first. The badge is the wallet&apos;s profit tier; we never show who is behind a wallet.</p>
      </div>
      <nav className="nx-tabs skm-cats" aria-label="Filter">
        {tabs.map(([k, l]) => <a key={k ?? "all"} className="nx-tab" href={k ? `/board?f=${k}` : "/board"} aria-selected={filter === k} aria-current={filter === k ? "page" : undefined} data-testid={`board-f-${k ?? "all"}`}>{l}</a>)}
      </nav>
      {member ? <p className="sk-meta" data-testid="board-live"><span className="sk-live" aria-hidden="true" /> Live · {hour.toLocaleString("en-US")} millionaire bet{hour === 1 ? "" : "s"} in the last hour</p>
        : <p className="mb-late" data-testid="board-delay"><span><b data-testid="board-hour">{hour.toLocaleString("en-US")}</b> millionaire bet{hour === 1 ? "" : "s"} in the last hour. Members see them as they happen. This board is 60 minutes behind.</span><a className="op-btn-sm op-primary" href={unlockHref()} data-unlock="board-page">Start for ${TRIAL.fee}</a></p>}
      {rows.length ? <BoardList rows={rows} now={now} member={member} /> : <p className="sk-muted" data-testid="board-none">No millionaire bets here in the last week{member ? "" : " that are more than an hour old"}.</p>}
    </section>
  );
  return member ? <Shell current="board">{body}</Shell> : <OpenFrame startHref={unlockHref()}>{body}</OpenFrame>;
}
