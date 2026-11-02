/* Library (/library), like Perplexity's threads: every Read the member opened, newest first: what they asked, the
 * market, when, and a dot when proven money has moved since. A search box filters them. Tapping one reads the market
 * again, fresh. Members only. */
import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/sky/Shell";
import { ReadPick } from "@/components/read/ReadPick";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { agoText } from "@/lib/moves/copy";
import { library } from "@/lib/read/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0A0C10" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireMember("/library");
  const sp = await searchParams, q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const now = Date.now();
  const rows = hasDatabase() && viewer.user ? await library(getDb(), viewer.user.id, { q }).catch(() => []) : [];
  return (
    <Shell current="library" refresh={false}>
      <section className="skm-sec" aria-labelledby="lib-h">
        <div className="skm-sec__h"><h1 id="lib-h" className="sk-h2">Library</h1></div>
        <form className="sk-ask skm-search" role="search" action="/library" method="get">
          <label className="sr-only" htmlFor="lib-q">Search your Reads</label>
          <input id="lib-q" className="sk-ask__input" name="q" defaultValue={q} placeholder="Search your Reads" autoComplete="off" />
          <button className="sk-pill sk-sm" type="submit">Search</button>
        </form>
        {rows.length ? (
          <ul className="skm-rows sk-panel" data-testid="library">
            {rows.map(r => (
              <li key={r.id}>
                <ReadPick venue={r.data.key.startsWith("p:") ? "polymarket" : "kalshi"} id={r.data.key.slice(2)} className="skm-row skm-row--btn">
                  <span className="skm-row__main">
                    <span className="skm-row__t">{r.moved ? <span className="sk-live skm-row__dot" aria-label="Moved since" /> : null}{r.question || r.data.question}</span>
                    <span className="sk-muted skm-row__fav">{r.question && r.question !== r.data.question ? `${r.data.question} · ` : ""}{agoText(r.createdAt, now)}</span>
                  </span>
                  <span className="skm-row__nums"><span className="sk-meta">Read again</span></span>
                </ReadPick>
              </li>
            ))}
          </ul>
        ) : <p className="sk-muted" data-testid="library-none">{q ? `No Reads match “${q}”.` : "Every market you read is kept here."}</p>}
      </section>
    </Shell>
  );
}
