/* /markets/<category>, in the terminal: the category's markets with millionaire money this week as a table (tap one
 * for its page), and the latest bets in it. No photo behind data. */
import { marketPath } from "@/lib/entities/slug";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, ScrollFx } from "@/components/system";
import { TermHead } from "@/components/system/Entity";
import { LiveFeed } from "@/components/brand/LiveFeed";
import { PayMoments } from "@/components/brand/PayMoments";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { category, isCategory } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { marketMoney, pulse, recentBets } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import "../../pages-terminal.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: c } = await params;
  return isCategory(c) ? { title: `${category(c).name}: millionaire money` } : { title: "Markets" };
}

const SOURCE = "Polymarket public data (bets of $5K+ by watched wallets)";

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
      <div className="t-wrap t-page">
        <TermHead testid="category-band" label={<>{c.name} · {c.blurb}</>} title={<Insight id="cat-h" text={lead} fallback={[c.name + "."]} size={56} />} />
        <PanelGrid>
          <TPanel n={1} title="Markets with millionaire money this week" meta={`${markets.length} MARKETS${week ? ` · ${dollars(week)} $1M+` : ""}`} span={3} compact source={SOURCE} fetchedAt={now}
            empty={markets.length ? null : `No millionaire money in ${c.name} this week yet.`} testid={markets.length ? undefined : "category-markets"}>
            <div className="t-scroll" data-testid="category-markets">
              <table className="t-table" aria-label={`${c.name} markets`}>
                <thead><tr><th>Market</th><th className="r">$1M+ wallets</th><th className="r">Pro wallets</th><th className="r">Money</th></tr></thead>
                <tbody>
                  {markets.map(m => {
                    const mil = milOf(m), pro = m.pro.yes.dollars + m.pro.no.dollars;
                    return (
                      <tr key={m.marketId}>
                        <td className="t-ell"><a className="s-link" href={marketPath(m.marketId, m.title)} data-entity="market">{m.title}</a></td>
                        <td className="r b-num">{m.millionaire.yes.wallets + m.millionaire.no.wallets}</td>
                        <td className="r b-num">{m.pro.yes.wallets + m.pro.no.wallets}</td>
                        <td className="r b-num t-strong">{dollars(mil || pro)} <span className="t-muted">{mil ? "$1M+" : "Pro"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TPanel>
          <TPanel n={2} title="The latest bets" meta={member ? "LIVE" : "60 MIN LATE · SIDE FOR MEMBERS"} span={3} source={SOURCE} fetchedAt={now} testid="category-live">
            <LiveFeed initial={{ now, pulse: p ?? { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 }, bets }} n={12} cats={[slug]} />
          </TPanel>
        </PanelGrid>
      </div>
      {member ? null : <PayMoments ctx={{ count: p?.count ?? 0, window: p?.window ?? "hour", biggest: null }} now={now} />}
      <ScrollFx />
    </Frame>
  );
}
