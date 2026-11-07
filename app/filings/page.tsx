/* SEC filings (/filings; docs/INSIDIR-V3.md §3): the searchable Form 4 database. Every Form 4 and 4/A we have read from
 * SEC EDGAR, newest first, searchable by company, ticker, person, role, transaction code, date and value, each row
 * linked to the filing on sec.gov. An amended filing is marked, and so is the 4/A that restates it.
 * Members only (through Whop, like every paid page), and Coming soon until the 20-row EDGAR accuracy check passes and
 * `filings` is in FEATURES_READY (lib/features.ts, lib/accuracy/filings.ts). */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Coverage, Filters, FilingsTable, PAGE_SIZE, Pager, SecHead, SecPage, SecSoon } from "@/components/sec/Sec";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { isPaid } from "@/lib/plans";
import { coverageSince } from "@/lib/stocks/backfill";
import { parseQuery, searchFilings, type FilingView } from "@/lib/stocks/filings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SEC filings: the Form 4 database", description: "Every Form 4 filed with the SEC, searchable, each linked to the original filing on sec.gov.", robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;

export default async function FilingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  if (!isReady("filings")) {
    return (
      <Frame member={paid} current="board" testid="filings-page">
        <SecSoon title="SEC filings" line="Every Form 4 filed with the SEC, searchable by company, person, role, transaction and date, each linked to the original filing on sec.gov." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const sp = await searchParams;
  const q = parseQuery(sp);
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const db = hasDatabase() ? getDb() : null;
  const [rows, since] = db ? await Promise.all([
    searchFilings(db, q, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }).catch(e => { console.error("filings", e instanceof Error ? e.message : e); return [] as FilingView[]; }),
    coverageSince(db, Date.now()).catch(() => null),
  ]) : [[] as FilingView[], null];
  const href = (p: number) => {
    const u = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]));
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/filings${s ? `?${s}` : ""}`;
  };
  return (
    <Frame member current="board" testid="filings-page">
      <SecPage testid="filings">
        <SecHead current="filings" title="SEC filings" sub="Every Form 4 and amendment we have read from SEC EDGAR, newest first. Each row opens the original filing on sec.gov." />
        <Coverage since={since} />
        <Filters action="/filings" q={q} codes />
        <FilingsTable rows={rows.slice(0, PAGE_SIZE)} />
        <Pager page={page} more={rows.length > PAGE_SIZE} href={href} />
      </SecPage>
    </Frame>
  );
}
