/* /filings/<TICKER>: one company's report. Its Form 4 and 8-K filings as filed, its Stream matches, and the member's
 * private journal beside them. The ticker resolves through the SEC directory (terminal.issuer_tickers); a CIK works too. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { FilingsApp } from "@/components/filings/FilingsApp";
import { requireMember } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { resolveTicker } from "@/lib/filings/store";
import "@/components/filings/filings.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${decodeURIComponent(ticker).toUpperCase()} filings`, robots: { index: false } };
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  if (!isReady("filings")) notFound();
  const [, { ticker }] = await Promise.all([requireMember("/filings"), params]);
  const raw = decodeURIComponent(ticker).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(raw)) notFound();
  const hit = await resolveTicker(getDb(), raw);
  if (!hit) notFound();
  return (
    <Frame member current="home" testid="filings-company-page">
      <FilingsApp company={{ cik: hit.cik, ticker: hit.ticker, title: hit.title }} />
    </Frame>
  );
}
