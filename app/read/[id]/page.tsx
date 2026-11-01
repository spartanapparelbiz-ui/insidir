/* A Read (/read/<id>): the card as it was read (components/read/ReadCard.tsx), then the box for the next one. A member
 * opening a Read saved without its analyst line (theirs from before they paid) gets it written now. Anyone with the
 * link sees it; only members see the big bets and the line. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { claimRead, getRead, lineFor, setLine } from "@/lib/read/store";
import { cookies } from "next/headers";
import { VISITOR_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/read" trialHref={`/start?next=${encodeURIComponent(`/read/${id}`)}`} />
      <main className="pg rpage">
        <ReadCard id={id} data={data} member={member} us={viewer.region !== "non_us"} now={now} startHref={`/start?next=${encodeURIComponent(`/read/${id}`)}`} />
        <section className="rpage__next" aria-label="Read another market">
          <h2 className="rpage__h">Read another</h2>
          <ReadBox size="small" />
        </section>
      </main>
    </>
  );
}
