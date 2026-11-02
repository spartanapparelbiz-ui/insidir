/* A Read (/read/<id>), as an answer: a small "You asked" line with what they asked, then the live Read card centred
 * (components/read/ReadCard.tsx, the market's name as the page's one heading), source chips, the ask box (which also shows
 * "Not this one?" after a "Which one?"), and 3 related markets. On phones Open and Share sit in a bar fixed to the bottom.
 * Members see it in the dashboard frame; visitors in the site frame. A member opening a Read saved without its analyst
 * line gets it written now. Only members see the big bets and the line. */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { MarketCard } from "@/components/sky/Card";
import { Sources, VisitorFrame } from "@/components/sky/Landing";
import { Shell } from "@/components/sky/Shell";
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { relatedCards, type MarketCard as Card } from "@/lib/nx/data";
import { isPaid } from "@/lib/plans";
import { claimRead, getRead, lineFor, setLine } from "@/lib/read/store";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#070B14" };

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
  const visitor = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (viewer.user && !r.userId && visitor && r.visitorId === visitor) await claimRead(db, id, viewer.user.id, visitor).catch(() => undefined);
  if (member && viewer.user && !data.line) {
    const { line: _l, ...base } = data;
    const line = await lineFor(db, base, viewer.user.id, now).catch(() => null);
    if (line) { data = { ...data, line: { text: line.text, origin: line.origin, model: line.model } }; await setLine(db, id, data.line).catch(() => undefined); }
  }
  const related: Card[] = await relatedCards(db, now, data).catch(() => []);
  const positions = data.big ? data.big.yes.positions + data.big.no.positions : 0;
  const startHref = `/start?next=${encodeURIComponent(`/read/${id}`)}`;
  const body = (
    <div className="skr" data-testid="read-page">
      <p className="skl-asked" data-testid="read-question"><span className="sk-muted">You asked</span> {r.question || data.question}</p>
      <ReadCard id={id} data={data} member={member} us={viewer.region !== "non_us"} now={now} startHref={startHref} level={1} />
      <Sources f={{ data, positions, at: data.at }} now={now} />
      <section className="skr-next" aria-label="Read another market"><ReadBox glass label="Read" placeholder="Read another market: paste a link or ask" /></section>
      {related.length ? (
        <section className="skr-related" aria-labelledby="related-h" data-testid="related">
          <h2 id="related-h" className="sk-h3">Related markets</h2>
          <div className="sk-row">{related.map(c => <MarketCard key={c.key} c={c} />)}</div>
        </section>
      ) : null}
    </div>
  );
  return member ? <Shell current="read" refresh={false}>{body}</Shell> : <VisitorFrame startHref={startHref}>{body}</VisitorFrame>;
}
