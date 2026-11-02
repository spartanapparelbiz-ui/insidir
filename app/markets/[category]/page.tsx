/* /markets/<category>: the category's photo as the stage, its markets with millionaire money (tap one to check it), and
 * the live bets in it. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Lines } from "@/components/brand/Bits";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Stage } from "@/components/brand/Stage";
import { getViewer } from "@/lib/auth/viewer";
import { category, categoryPhoto, isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { marketMoney, pulse, recentBets } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: c } = await params;
  return isCategory(c) ? { title: `${category(c).name}: millionaire money` } : { title: "Markets" };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const [{ category: slug }, viewer] = await Promise.all([params, getViewer()]);
  if (!isCategory(slug)) notFound();
  const member = isPaid(viewer.plan), now = Date.now(), c = category(slug);
  const db = hasDatabase() ? getDb() : null;
  const [markets, bets, p] = db ? await Promise.all([
    marketMoney(db, { categories: [slug], since: now - 7 * 86_400_000, limit: 20, now }).catch(() => []),
    recentBets(db, { now, limit: 12, member, categories: [slug] }).catch(() => []),
    pulse(db, now).catch(() => null),
  ]) : [[], [], null];
  return (
    <Frame member={member} current="markets" testid="category-page">
      <Stage bg={{ kind: "photo", photo: categoryPhoto(slug), priority: true, dark: 0.45 }} className="b-stage--head">
        <div style={{ display: "grid", gap: 10 }}><span className="b-label" style={{ color: "var(--ink-muted)" }} data-m="quiet">{c.blurb}</span><Lines as="h1" lines={[c.name + "."]} size={72} /></div>
      </Stage>
      <Stage className="b-stage--body">
        <div className="b-panels">
          <div className="b-glass b-pad" data-m="settle" data-testid="category-markets">
            <h2 className="b-panel-h">Markets with millionaire money</h2>
            {markets.length ? (
              <ul className="b-rows">{markets.map(m => {
                const mil = m.millionaire.yes.dollars + m.millionaire.no.dollars, pro = m.pro.yes.dollars + m.pro.no.dollars;
                return (
                  <li key={m.marketId}><a className="b-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} href={`/read/open?pick=polymarket:${m.marketId}`}>
                    <span className="b-row__main"><span className="b-row__title">{m.title}</span><span className="b-row__meta">{m.millionaire.yes.wallets + m.millionaire.no.wallets} millionaire · {m.pro.yes.wallets + m.pro.no.wallets} Pro wallets · tap to check</span></span>
                    <span className="b-row__money"><span className="b-row__size b-num">{dollars(mil || pro)}</span><span className="b-small">{mil ? "millionaire" : "Pro"}</span></span>
                  </a></li>
                );
              })}</ul>
            ) : <p className="b-empty">No millionaire money in {c.name} this week yet.</p>}
          </div>
          <LiveFeed initial={{ now, pulse: p ?? { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0 }, bets }} n={12} cats={[slug]} />
        </div>
      </Stage>
      {member ? null : <PayMoments ctx={{ count: p?.count ?? 0, window: p?.window ?? "hour", biggest: null }} now={now} />}
    </Frame>
  );
}
