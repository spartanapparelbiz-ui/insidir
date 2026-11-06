/* /filings: the members' EDGAR terminal (docs/RESEARCH-DESK.md): alerts on watchlists, the full tape, the Cluster &
 * Whale Stream, the journal and the position desk. Members only; off until FEATURES_READY has "filings". The
 * terminal draws the site's own logo in its header; the site footer follows below the fold. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TerminalPage } from "@/components/filings/TerminalPage";
import type { View } from "@/components/filings/Terminal";
import { requireMember } from "@/lib/auth/viewer";
import { isReady } from "@/lib/features";
import "@/components/filings/filings.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EDGAR terminal", robots: { index: false } };

const VIEWS = new Set<View>(["alerts", "tape", "stream", "journal", "positions"]);

export default async function FilingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isReady("filings")) notFound();
  const [, q] = await Promise.all([requireMember("/filings"), searchParams]);
  return <TerminalPage initialView={VIEWS.has(q.view as View) ? (q.view as View) : "alerts"} />;
}
