/* P&L (Pro): the user's own totals from public records: a Polymarket wallet address (public Data API) and a Kalshi
 * CSV they upload. Their numbers only; no suggestions. No links to polymarket.com. */
import type { Metadata } from "next";
import { Beacons } from "@/components/app/Beacons";
import { KalshiUpload } from "@/components/app/KalshiUpload";
import { Locked } from "@/components/app/Locked";
import { unlockHref } from "@/components/app/links";
import { PnlTable } from "@/components/app/PnlTable";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { entitlements } from "@/lib/plans";
import { fetchPolymarketPnl, isWallet, type PnlSummary } from "@/lib/pnl";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My results", robots: { index: false } };

export default async function PnlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  const allowed = entitlements(viewer.plan).pnl;
  const raw = (await searchParams).wallet;
  const wallet = typeof raw === "string" ? raw.trim() : "";
  let summary: PnlSummary | null = null;
  let error: string | null = null;
  if (allowed && wallet) {
    if (!isWallet(wallet)) error = "That isn't a wallet address. It starts with 0x and has 40 more characters.";
    else {
      try { summary = await fetchPolymarketPnl(wallet); }
      catch { error = "Couldn't read that wallet from Polymarket's public data right now. Try again in a minute."; }
    }
  }
  const label = viewer.region === "non_us" ? "Polymarket wallet address" : "Your Polymarket wallet address";

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/pnl" />
      <main className="wrap app">
        <Beacons where="pnl" />
        <h1 className="page__h">My results</h1>
        {!allowed ? (
          <Locked title="P&L" text="See your own realized P&L, open positions and results per market, from your Polymarket wallet and a Kalshi CSV. No API keys." href={unlockHref("pro", "/pnl")} plan="pro" where="pnl" />
        ) : (
          <>
            <section className="card fs" aria-labelledby="pm-h">
              <h2 id="pm-h" className="fs__h">Polymarket</h2>
              <form method="get" action="/pnl" className="walletform">
                <div className="field">
                  <label htmlFor="wallet">{label}</label>
                  <input id="wallet" name="wallet" className="input" placeholder="0x…" defaultValue={wallet} autoComplete="off" spellCheck={false} inputMode="text" pattern="0x[0-9a-fA-F]{40}" />
                </div>
                <button type="submit" className="btn btn--primary">Show P&amp;L</button>
              </form>
              <p className="muted small">Positions and history are public on-chain data. Nothing is stored.</p>
              {error ? <p className="err small" role="alert">{error}</p> : null}
              {summary ? <PnlTable summary={summary} label="Polymarket P&L" /> : null}
            </section>
            <section className="card fs" aria-labelledby="k-h">
              <h2 id="k-h" className="fs__h">Kalshi</h2>
              <p className="muted small">Download your account history as a CSV from Kalshi, then upload it here. We never ask for your Kalshi login or API keys.</p>
              <KalshiUpload />
            </section>
          </>
        )}
      </main>
    </>
  );
}
