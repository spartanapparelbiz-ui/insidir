/* Insider activity (/insiders; docs/INSIDIR-V3.md §3): what officers, directors and 10% owners reported on Form 4.
 * The first tab is open-market trades only: Table I purchases (P, acquired) and sales (S, disposed). Option exercises,
 * grants and awards, tax withholding, gifts and every other code each have their own tab and are never added into the
 * open-market totals. Lines restated by a later 4/A are left out (lib/stocks/filings.ts). Every row links to its filing
 * on sec.gov. Members only, and Coming soon until the 20-row EDGAR accuracy check passes (lib/accuracy/filings.ts). */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Coverage, Filters, PAGE_SIZE, Pager, SecHead, SecPage, SecSoon, Tabs, Totals, TradesTable } from "@/components/sec/Sec";
import { secViewer } from "@/components/sec/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { coverageSince } from "@/lib/stocks/backfill";
import { openMarketTotals, parseQuery, searchTrades, tabOf, type TabKey, type TradeView } from "@/lib/stocks/filings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insider activity", description: "Open-market purchases and sales by officers, directors and 10% owners from SEC Form 4, kept apart from option exercises and grants.", robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;

export default async function InsidersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { paid, unread } = await secViewer();
  if (!isReady("filings")) {
    return (
      <Frame member={paid} current="board" testid="insiders-page">
        <SecSoon title="Insider activity" line="Open-market purchases and sales by officers, directors and 10% owners, straight from Form 4, kept apart from option exercises and stock grants." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const sp = await searchParams;
  const q = parseQuery(sp);
  const tab = tabOf(Array.isArray(sp.tab) ? sp.tab[0] : sp.tab);
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const now = Date.now();
  const db = hasDatabase() ? getDb() : null;
  const [rows, since, totals] = db ? await Promise.all([
    searchTrades(db, tab, q, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }).catch(e => { console.error("insiders", e instanceof Error ? e.message : e); return [] as TradeView[]; }),
    coverageSince(db, now).catch(() => null),
    tab === "open" ? openMarketTotals(db, q, now).catch(() => null) : Promise.resolve(null),
  ]) : [[] as TradeView[], null, null];
  const href = (t: TabKey, p = 1) => {
    const u = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]));
    if (t !== "open") u.set("tab", t);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/insiders${s ? `?${s}` : ""}`;
  };
  return (
    <Frame member current="board" testid="insiders-page">
      <SecPage testid="insiders">
        <SecHead current="insiders" unread={unread} title={q.ticker ? `Insider activity · ${q.ticker}` : "Insider activity"}
          sub="What officers, directors and 10% owners reported on Form 4. Open-market purchases and sales first; option exercises, grants, tax withholding and gifts each in their own tab." />
        <Coverage since={since} />
        <Filters action="/insiders" q={q} tab={tab} codes={tab === "other"} />
        <Tabs tab={tab} href={t => href(t)} />
        {totals ? <Totals t={totals} /> : null}
        <TradesTable rows={rows.slice(0, PAGE_SIZE)} open={tab === "open"} />
        <Pager page={page} more={rows.length > PAGE_SIZE} href={p => href(tab, p)} />
      </SecPage>
    </Frame>
  );
}
