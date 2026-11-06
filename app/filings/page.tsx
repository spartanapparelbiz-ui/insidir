/* /filings: the members' SEC research desk (docs/RESEARCH-DESK.md): watchlist alerts for Form 4 and 8-K, the Cluster &
 * Whale Stream, watchlists, the journal and hand-logged positions. Members only; off until FEATURES_READY has
 * "filings". The site's own header stays on top (Frame → Shell). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { FilingsApp, type View } from "@/components/filings/FilingsApp";
import { requireMember } from "@/lib/auth/viewer";
import { isReady } from "@/lib/features";
import "@/components/filings/filings.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Filings", robots: { index: false } };

const VIEWS = new Set<View>(["alerts", "stream", "watchlists", "journal", "positions"]);

export default async function FilingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isReady("filings")) notFound();
  const [, q] = await Promise.all([requireMember("/filings"), searchParams]);
  const view = VIEWS.has(q.view as View) ? (q.view as View) : "alerts";
  return (
    <Frame member current="home" testid="filings-page">
      <FilingsApp initialView={view} />
    </Frame>
  );
}
