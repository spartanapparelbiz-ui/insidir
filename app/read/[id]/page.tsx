/* A Read (/read/<id>), as an answer (new design system): the question as they asked it, the live Read card
 * (components/read/ReadCard.tsx), source chips (venues, positions, when it was read), the ask box (which shows "Not
 * this one?" with the other matches when they picked from a "Which one?"), and 3 related markets. On phones, Open and
 * Share sit in a sticky bar. Members see it in the member frame; visitors in the site frame. A member opening a Read
 * saved without its analyst line (theirs from before they paid) gets it written now. Only members see the big bets
 * and the line. */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { MarketCard } from "@/components/nx/Bits";
import { VisitorFrame } from "@/components/nx/Landing";
import { Shell } from "@/components/nx/Shell";
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { PolymarketClient } from "@/lib/exchanges";
import { agoText } from "@/lib/moves/copy";
import { relatedCards, withSparks, type MarketCard as Card } from "@/lib/nx/data";
import { isPaid } from "@/lib/plans";
import { claimRead, getRead, lineFor, setLine } from "@/lib/read/store";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#0A0C10" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = hasDatabase() ? await getRead(getDb(), id).catch(() => null) : null;
  return r ? { title: `The Read: ${r.data.question}`, robots: { index: false }, openGraph: { images: [{ url: `/read/${id}/image`, width: 1080, height: 1350 }] } } : { title: "The Read" };
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
  // Theirs from before they signed in (same browser): it joins their markets.
  const visitor = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (viewer.user && !r.userId && visitor && r.visitorId === visitor) await claimRead(db, id, viewer.user.id, visitor).catch(() => undefined);
  if (member && viewer.user && !data.line) {
    const { line: _l, ...base } = data;
    const line = await lineFor(db, base, viewer.user.id, now).catch(() => null);
    if (line) { data = { ...data, line: { text: line.text, origin: line.origin, model: line.model } }; await setLine(db, id, data.line).catch(() => undefined); }
  }
  const related: Card[] = await relatedCards(db, now, data).then(cs => withSparks(cs, new PolymarketClient(), now)).catch(() => []);
  const venues = [data.polymarket ? "Polymarket" : null, data.kalshi ? "Kalshi" : null].filter(Boolean) as string[];
  const positions = data.big ? data.big.yes.positions + data.big.no.positions : 0;
  const startHref = `/start?next=${encodeURIComponent(`/read/${id}`)}`;
  const body = (
    <div className="nxr" data-testid="read-page">
      <header className="nxr-q">
        <p className="nx-label">The Read</p>
        <h1 className="nxr-q__h" data-testid="read-question">{r.question || data.question}</h1>
        {r.question && r.question !== data.question ? <p className="nx-muted nxr-q__m">{data.question}</p> : null}
      </header>
      <div className="nxr-card">
        <ReadCard id={id} data={data} member={member} us={viewer.region !== "non_us"} now={now} startHref={startHref} />
        <p className="nx-chips nx-chips--left nxl-sources" data-testid="read-sources">
          {venues.map(v => <span key={v} className="nx-chip">{v}</span>)}
          {positions ? <span className="nx-chip">{positions.toLocaleString("en-US")} {positions === 1 ? "position" : "positions"}</span> : null}
          <span className="nx-chip">Updated {agoText(data.at, now)}</span>
        </p>
      </div>
      <section className="nxr-next" aria-label="Read another market">
        <ReadBox glass label="Read" placeholder="Read another market: paste a link or ask" />
      </section>
      {related.length ? (
        <section className="nxr-related" aria-labelledby="related-h" data-testid="related">
          <h2 id="related-h" className="nxm-sec__h" style={{ fontSize: 20 }}>Related markets</h2>
          <div className="nx-row">{related.map(c => <MarketCard key={c.key} c={c} />)}</div>
        </section>
      ) : null}
    </div>
  );
  return member ? <Shell current="read" refresh={false}>{body}</Shell> : <VisitorFrame startHref={startHref}>{body}</VisitorFrame>;
}
