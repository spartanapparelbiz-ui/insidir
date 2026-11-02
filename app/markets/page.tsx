/* Markets (/markets): open Polymarket and Kalshi markets as cards (new design system), sorted by proven money:
 * category tabs (Elections · Sports · Economy · World · Culture), a search box, and a grid. Each card opens its Read.
 * Members see it in the member frame; visitors in the site frame. */
import type { Metadata, Viewport } from "next";
import { MarketCard } from "@/components/sky/Card";
import { VisitorFrame } from "@/components/sky/Landing";
import { Shell } from "@/components/sky/Shell";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { CATS, isCat, marketCards, type MarketCard as Card } from "@/lib/nx/data";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets", description: "Open Polymarket and Kalshi markets with proven money on them: elections, sports, the economy, world events and culture, live." };
export const viewport: Viewport = { themeColor: "#070B14" };

export default async function MarketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const cat = isCat(sp.cat) ? sp.cat : null, q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const now = Date.now();
  const cards: Card[] = hasDatabase() ? await marketCards(getDb(), now, { cat, q, limit: 24, sort: "proven" }).catch(() => []) : [];
  const href = (c: string | null) => { const p = new URLSearchParams(); if (c) p.set("cat", c); if (q) p.set("q", q); const s = p.toString(); return `/markets${s ? `?${s}` : ""}`; };
  const body = (
    <section className="skm-sec" aria-labelledby="mk-h" data-testid="markets-page">
      <div className="sk-sec__head"><div><p className="sk-meta"><span className="sk-live" aria-hidden="true" /> Live</p><h1 id="mk-h" className="sk-h2">Markets</h1></div></div>
      <form className="sk-ask skm-search" role="search" action="/markets" method="get">
        {cat ? <input type="hidden" name="cat" value={cat} /> : null}
        <label className="sr-only" htmlFor="mk-q">Search markets</label>
        <input id="mk-q" className="sk-ask__input" name="q" defaultValue={q} placeholder="Search markets" autoComplete="off" />
        <button className="sk-pill sk-sm" type="submit">Search</button>
      </form>
      <nav className="nx-tabs skm-cats" aria-label="Categories">
        <a className="nx-tab" href={href(null)} aria-selected={!cat} aria-current={!cat ? "page" : undefined}>All</a>
        {CATS.map(c => <a key={c.key} className="nx-tab" href={href(c.key)} aria-selected={cat === c.key} aria-current={cat === c.key ? "page" : undefined}>{c.label}</a>)}
      </nav>
      {cards.length ? <div className="sk-grid" data-testid="markets-grid">{cards.map((c, i) => <MarketCard key={c.key} c={c} />)}</div>
        : <p className="sk-muted" data-testid="markets-none">{q ? `No open markets match “${q}”.` : "No open markets with tracked money here right now."}</p>}
    </section>
  );
  return isPaid(viewer.plan) && viewer.user ? <Shell current="markets">{body}</Shell> : <VisitorFrame>{body}</VisitorFrame>;
}
