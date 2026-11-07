/* /edgar: the SEC landing. A visitor lands on a working Cluster & Whale preview, filled in the HTML itself, so the first
 * paint already has rows. The rows come from lib/filings/preview.ts, computed at most once every 30 seconds per server
 * instance and shared by every visitor: a visit costs a render, never a database read. (The page can't be a static
 * ISR page while the root layout reads cookies for the visitor bar.) Filtering, sorting and tabs run in the browser;
 * opening a filing or setting an alert opens the membership drawer. Not the home page yet: `/` stays the current landing (and the money-path monitor's) until the
 * owner switches it. Off (404) until FEATURES_READY has "filings". */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandFoot, BrandNav } from "@/components/brand/Nav";
import { EdgarLanding } from "@/components/filings/EdgarLanding";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { EMPTY_PREVIEW, previewFor } from "@/lib/filings/preview";
import "@/components/filings/filings.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Insidir · SEC Form 4 and 8-K, live from EDGAR",
  description: "Open-market insider buys and sells, $1M+ purchases, clusters and 8-Ks, straight from SEC EDGAR about a minute after filing. Research software, not advice.",
};

export default async function EdgarPage() {
  if (!isReady("filings")) notFound();
  const now = Date.now();
  const data = hasDatabase() ? await previewFor(getDb(), now).catch(() => EMPTY_PREVIEW(now)) : EMPTY_PREVIEW(now);
  return (
    <main className="b-root" data-testid="edgar-landing">
      <div className="el-page">
        <BrandNav fixed />
        <EdgarLanding initial={data} />
        <div className="el-foot"><BrandFoot inline /></div>
      </div>
    </main>
  );
}
