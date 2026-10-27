/* A profile (docs/INSIDIR-V2.md §6): who is behind a move, as far as public data says.
 *   /p/0x…           a Polymarket trader: public username or short address, the record and stats (20+ resolved
 *                    markets), profit over time, wins and losses by category, open positions and recent moves
 *   /p/insider-<cik> an SEC filer: every open-market buy and sale on their Form 4s, totals, and the price paid
 *   /p/fund-<cik>    a 13F filer: top 10 holdings, biggest adds and cuts per quarter, quarters on file
 * Names are for everyone; the numbers are for members ("Get Insidir · $39/mo"), and are never sent to a free
 * viewer's browser. Every number links to where it came from. Nothing about who is behind a wallet, ever. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FundProfile } from "@/components/v2/profiles/FundProfile";
import { InsiderProfile } from "@/components/v2/profiles/InsiderProfile";
import { TraderProfile } from "@/components/v2/profiles/TraderProfile";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { walletLabel } from "@/lib/moves/records";
import { parseProfileId, personName } from "@/lib/profiles/name";
import { fundOf, historyOf, insiderTradesFor, recordOf } from "@/lib/profiles/store";

export const dynamic = "force-dynamic";

async function title(id: string): Promise<string | null> {
  const ref = parseProfileId(id);
  if (!ref) return null;
  if (ref.kind === "trader") {
    const rec = hasDatabase() ? await recordOf(getDb(), ref.wallet).catch(() => null) : null;
    return walletLabel(ref.wallet, rec?.name ?? null);
  }
  if (!hasDatabase()) return null;
  if (ref.kind === "fund") return (await fundOf(getDb(), ref.cik).catch(() => null))?.name ?? null;
  const t = (await insiderTradesFor(getDb(), ref.cik, 1).catch(() => []))[0];
  const h = t ? null : await historyOf(getDb(), "owner", ref.cik).catch(() => null);
  return t ? personName(t.ownerName) : h?.name ? personName(h.name) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const name = await title(id);
  return { title: name ?? "Profile", robots: { index: false } };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ref = parseProfileId(id);
  if (!ref) notFound();
  const viewer = await requireMember(`/p/${id}`);
  const trial = unlockHref();
  const db = hasDatabase() ? getDb() : null;
  const now = Date.now();
  let body: React.ReactNode;
  if (ref.kind === "trader") body = <TraderProfile db={db} wallet={ref.wallet} viewer={viewer} trial={trial} now={now} />;
  else if (!db) notFound();
  else if (ref.kind === "insider") body = <InsiderProfile db={db} cik={ref.cik} viewer={viewer} trial={trial} />;
  else body = <FundProfile db={db} cik={ref.cik} viewer={viewer} trial={trial} />;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/p" />
      <main className="wrap app2 trader profile dark">{body}</main>
    </>
  );
}
