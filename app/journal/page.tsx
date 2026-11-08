/* Research journal (/journal; docs/INSIDIR-V3.md §3): every company the member has tagged Researching, Watching or
 * Passed, with their private note, by status or by last edit. Private: nobody else sees it, and it is deleted with the
 * account. Members only, and Coming soon until `journal` is in FEATURES_READY. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { fmt, SecHead, SecPage, SecSoon } from "@/components/sec/Sec";
import { secViewer } from "@/components/sec/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { journalFor, STATUSES } from "@/lib/journal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Research journal", robots: { index: false } };

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { paid, unread, userId } = await secViewer();
  if (!isReady("journal")) {
    return (
      <Frame member={paid} current="board" testid="journal-page">
        <SecSoon title="Research journal" line="Tag companies Researching, Watching or Passed, with private notes next to their filings." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const sort = (await searchParams).sort === "recent" ? "recent" : "status";
  const rows = hasDatabase() && userId ? await journalFor(getDb(), userId, sort).catch(() => []) : [];
  const label = (s: string) => STATUSES.find(x => x.key === s)?.label ?? s;
  return (
    <Frame member current="board" testid="journal-page">
      <SecPage testid="journal">
        <SecHead current="journal" unread={unread} title="Research journal" sub="Your status and private notes on each company. Only you can see this." />
        <nav className="sec-chips" aria-label="Sort">
          <Link href="/journal" aria-current={sort === "status" ? "page" : undefined}>By status</Link>
          <Link href="/journal?sort=recent" aria-current={sort === "recent" ? "page" : undefined}>Last edited</Link>
        </nav>
        {rows.length ? (
          <div className="sec-wrap">
            <table className="sec-table" data-testid="journal-table">
              <thead><tr><th scope="col">Company</th><th scope="col">Status</th><th scope="col">Note</th><th scope="col">Edited</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.cik} data-status={r.status}>
                  <td data-label="Company"><Link href={r.ticker ? `/company/${encodeURIComponent(r.ticker)}` : `/company/cik-${r.cik}`}>{r.company}{r.ticker ? <span className="sec-tick">{r.ticker}</span> : null}</Link></td>
                  <td data-label="Status">{label(r.status)}</td>
                  <td data-label="Note" style={{ whiteSpace: "pre-wrap" }}>{r.note ? (r.note.length > 280 ? `${r.note.slice(0, 280)}…` : r.note) : <span className="sec-dim">No note</span>}</td>
                  <td data-label="Edited">{fmt.etDate(r.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="sec-empty" data-testid="journal-empty">Nothing yet. Open a company and set its status to start your journal.</p>}
      </SecPage>
    </Frame>
  );
}
