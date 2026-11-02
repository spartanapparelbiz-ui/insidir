/* A check (/read/<id>): the market as it was read, in the brand's language (components/brand/read/CheckPage.tsx): which
 * side are you on, the verdict for that side, then the details; then the box for the next one. A member opening one
 * saved without its analyst line gets it written now. Anyone with the link sees it; only members see the wallets,
 * the big bets and the line. Visitors: the pop-ups after their free check. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { BrandNav } from "@/components/brand/Nav";
import { PayMoments } from "@/components/brand/PayMoments";
import { CheckPage } from "@/components/brand/read/CheckPage";
import { StageMotion } from "@/components/brand/StageMotion";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { marketMoney, positions, pulse, type MarketMoney, type Position } from "@/lib/millionaires/queries";
import { isPaid } from "@/lib/plans";
import { claimRead, getRead, lineFor, setLine } from "@/lib/read/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = hasDatabase() ? await getRead(getDb(), id).catch(() => null) : null;
  return r ? { title: `Check: ${r.data.question}`, robots: { index: false }, openGraph: { images: [{ url: `/read/${id}/image`, width: 1080, height: 1350 }] } } : { title: "Check a bet" };
}

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (!hasDatabase()) notFound();
  const db = getDb();
  const r = await getRead(db, id);
  if (!r) notFound();
  const member = isPaid(viewer.plan);
  const now = Date.now();
  let data = r.data;
  const visitor = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (viewer.user && !r.userId && visitor && r.visitorId === visitor) await claimRead(db, id, viewer.user.id, visitor).catch(() => undefined);
  if (member && viewer.user && !data.line) {
    const { line: _l, ...base } = data;
    const line = await lineFor(db, base, viewer.user.id, now).catch(() => null);
    if (line) { data = { ...data, line: { text: line.text, origin: line.origin, model: line.model } }; await setLine(db, id, data.line).catch(() => undefined); }
  }
  // Millionaire money: the watchlist's open bets in this Polymarket market (Kalshi trades are anonymous).
  const pid = data.polymarket?.id ?? null;
  const [money, pos, p] = await Promise.all([
    pid ? marketMoney(db, { marketIds: [pid], now }).then(x => x[0] ?? null).catch((): MarketMoney | null => null) : Promise.resolve(null),
    pid ? positions(db, pid).catch((): Position[] => []) : Promise.resolve([] as Position[]),
    pulse(db, now).catch(() => null),
  ]);
  const startHref = `/go?step=paywall&from=read`;
  return (
    <main className="b-root" data-testid="check-page">
      <BrandNav fixed member={member} />
      <CheckPage id={id} data={data} money={money} positions={pos} member={member} us={viewer.region !== "non_us"} now={now} startHref={startHref} />
      {member ? null : <PayMoments ctx={{ count: p?.count ?? 0, window: p?.window ?? "hour", biggest: null }} now={now} />}
      <StageMotion />
    </main>
  );
}
