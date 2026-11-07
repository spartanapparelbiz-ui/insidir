/* /markets/<category>: the category's photo as the stage, its markets with millionaire money (tap one for its page), and
 * the live bets in it. */
import { marketPath } from "@/lib/entities/slug";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, Lines, Panel, ScrollFx } from "@/components/system";
import { Rows } from "@/components/system/Figures";
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
  const milOf = (m: (typeof markets)[number]) => m.millionaire.yes.dollars + m.millionaire.no.dollars;
  const week = markets.reduce((t, m) => t + milOf(m), 0);
  const lead = markets[0] && milOf(markets[0]) > 0 ? `Millionaires put ${dollars(week)} into ${c.name} this week, ${dollars(milOf(markets[0]))} of it on ${markets[0].title}.` : null;
  return (
    <Frame member={member} current="markets" testid="category-page">
      <Stage bg={{ kind: "photo", photo: categoryPhoto(slug), priority: true, dark: 0.5 }} first testid="category-band" labelledBy="cat-h">
        <div className="b-head">
          <p className="b-label" data-m="quiet">{c.name} · {c.blurb}</p>
          <Insight id="cat-h" text={lead} fallback={[c.name + "."]} size={56} />
        </div>
        {markets.length ? (
          <Panel className="s-col s-col--wide" testid="category-markets">
            <p className="b-label">Markets with millionaire money this week</p>
            <Rows label={`${c.name} markets`} rows={markets.map(m => {
              const mil = milOf(m), pro = m.pro.yes.dollars + m.pro.no.dollars;
              return { key: m.marketId, title: <a className="s-link" href={marketPath(m.marketId, m.title)} data-entity="market">{m.title}</a>,
                sub: `${m.millionaire.yes.wallets + m.millionaire.no.wallets} millionaire · ${m.pro.yes.wallets + m.pro.no.wallets} Pro wallets`, right: `${dollars(mil || pro)} ${mil ? "millionaire" : "Pro"}` };
            })} />
          </Panel>
        ) : <p className="b-empty b-center" data-testid="category-markets">No millionaire money in {c.name} this week yet.</p>}
      </Stage>
      <Stage testid="category-live" labelledBy="cat-live-h">
        <div className="b-head"><Lines as="h2" id="cat-live-h" lines={["The latest bets."]} size={52} /></div>
        <div className="s-col s-col--wide">
          <LiveFeed initial={{ now, pulse: p ?? { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0, count24h: 0 }, bets }} n={12} cats={[slug]} />
        </div>
      </Stage>
      {member ? null : <PayMoments ctx={{ count: p?.count ?? 0, window: p?.window ?? "hour", biggest: null }} now={now} />}
      <ScrollFx />
    </Frame>
  );
}
