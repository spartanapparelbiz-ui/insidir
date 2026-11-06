/* /filings/<TICKER>: one company in the terminal: its Form 4 and 8-K filings as documents on the left, the member's
 * private journal on the right. The ticker resolves through the SEC directory (terminal.issuer_tickers); a CIK works
 * too. ?note=<accession> opens that filing with the composer anchored to it. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TerminalPage } from "@/components/filings/TerminalPage";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { resolveTicker } from "@/lib/filings/store";
import "@/components/filings/filings.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${decodeURIComponent(ticker).toUpperCase()} · EDGAR terminal`, robots: { index: false } };
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isReady("filings")) notFound();
  const [, { ticker }, q] = await Promise.all([requireMember("/filings"), params, searchParams]);
  const raw = decodeURIComponent(ticker).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(raw)) notFound();
  const hit = await resolveTicker(getDb(), raw);
  if (!hit) notFound();
  const note = q.note && /^\d{18}$/.test(q.note) ? q.note : null;
  return <TerminalPage company={{ cik: hit.cik, ticker: hit.ticker, title: hit.title }} noteFor={note} />;
}
