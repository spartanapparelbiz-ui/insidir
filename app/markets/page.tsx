/* /markets, in the terminal: every category as a row of one table, ranked by the millionaire money in it (today, or this
 * week when today is quiet), with the Pro money beside it. No photos behind data. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { Insight } from "@/components/system";
import { TermHead } from "@/components/system/Entity";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { liveCategories } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import "../pages-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets", description: "Every market people bet on, with the millionaire money in each." };

export default async function Markets() {
  const viewer = await getViewer(), now = Date.now();
  const live = hasDatabase() ? await liveCategories(getDb(), now).catch(() => ({ window: "day" as const, list: [] })) : { window: "day" as const, list: [] };
  const by = new Map(live.list.map(c => [c.slug, c]));
  const order = [...CATEGORIES].sort((a, b) => (by.get(b.slug)?.millionaire ?? 0) + (by.get(b.slug)?.pro ?? 0) / 10 - ((by.get(a.slug)?.millionaire ?? 0) + (by.get(a.slug)?.pro ?? 0) / 10));
  const when = live.window === "day" ? "today" : "this week";
  const top = order[0] ? by.get(order[0].slug) : undefined;
  const insight = top?.millionaire ? `${order[0]!.name} drew ${dollars(top.millionaire)} of millionaire money ${when}.` : null;
  const total = live.list.reduce((t, c) => t + (c.millionaire ?? 0), 0);
  return (
    <Frame member={isPaid(viewer.plan)} current="markets" testid="markets-page">
      <div className="t-wrap t-page">
        <TermHead testid="markets-band" title={<Insight id="markets-h" text={insight} fallback={["Every market", "people bet on."]} size={56} />}
          sub={<>Every market people bet on, by the millionaire money in it {when}.</>} />
        <PanelGrid>
          <TPanel n={1} title="Markets by category" meta={`${CATEGORIES.length} CATEGORIES${total ? ` · ${dollars(total)} $1M+ MONEY ${when.toUpperCase()}` : ""}`} span={3} compact source="Polymarket public data (bets of $5K+ by watched wallets)" fetchedAt={now}>
            <div className="t-scroll">
              <table className="t-table">
                <thead><tr><th className="r">#</th><th>Category</th><th className="r">$1M+ money {when}</th><th className="r">Pro money {when}</th><th>About</th></tr></thead>
                <tbody>
                  {order.map((c, i) => {
                    const l = by.get(c.slug);
                    return (
                      <tr key={c.slug} data-href={`/markets/${c.slug}`}>
                        <td className="r b-num t-muted">{i + 1}</td>
                        <td><a className="s-link t-strong" href={`/markets/${c.slug}`} data-testid="category-card">{c.name}</a></td>
                        <td className="r b-num t-strong">{l?.millionaire ? dollars(l.millionaire) : "—"}</td>
                        <td className="r b-num">{l?.pro ? dollars(l.pro) : "—"}</td>
                        <td className="t-ell t-muted">{c.blurb}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TPanel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
