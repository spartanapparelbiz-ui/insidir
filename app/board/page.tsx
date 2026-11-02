/* The Millionaires' board (/board): every bet of $10K+ from a Polymarket wallet with $1M+ all-time profit
 * (lib/millionaire/board.ts): the market, the side, the size, the price they paid and the price now, the wallet's tier,
 * and when. Members see it live in the dashboard frame (it refreshes itself); visitors see it 60 minutes late in the
 * template frame, with "Members see this live". Never who is behind a wallet. */
import type { Metadata, Viewport } from "next";
import { unlockHref } from "@/components/app/links";
import { BoardList } from "@/components/millionaire/BoardList";
import { OpenFrame } from "@/components/open/Frame";
import { Shell } from "@/components/sky/Shell";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { boardRows, VISITOR_DELAY_MS, type BoardRow } from "@/lib/millionaire/board";
import { isPaid, TRIAL } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Millionaires' board", description: "Every $10K+ bet on Polymarket from wallets with $1M+ all-time profit: the market, the side, the size and the price." };
export const viewport: Viewport = { themeColor: "#070B14" };

export default async function BoardPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const now = Date.now();
  const rows: BoardRow[] = hasDatabase() ? await boardRows(getDb(), now, { delayMs: member ? 0 : VISITOR_DELAY_MS, limit: 60 }).catch(() => []) : [];
  const body = (
    <section className="skm-sec mb-page" aria-labelledby="board-h" data-testid="board-page">
      <div>
        <h1 id="board-h" className="sk-h2">The Millionaires&apos; board</h1>
        <p className="sk-muted">Every $10K+ bet from Polymarket wallets with $1M+ all-time profit, newest first. The badge is the wallet&apos;s profit tier; we never show who is behind a wallet.</p>
      </div>
      {member ? <p className="sk-meta" data-testid="board-live"><span className="sk-live" aria-hidden="true" /> Live</p>
        : <p className="mb-late" data-testid="board-delay"><span>60 minutes delayed. Members see this live.</span><a className="op-btn-sm op-primary" href={unlockHref()} data-unlock="board-page">Start for ${TRIAL.fee}</a></p>}
      {rows.length ? <BoardList rows={rows} now={now} /> : <p className="sk-muted" data-testid="board-none">No $1M+ wallet has placed a $10K+ bet in the last week{member ? "" : " that's more than an hour old"}.</p>}
    </section>
  );
  return member ? <Shell current="board">{body}</Shell> : <OpenFrame startHref={unlockHref()}>{body}</OpenFrame>;
}
