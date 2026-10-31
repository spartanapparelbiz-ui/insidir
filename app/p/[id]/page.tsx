/* A profile (docs/INSIDIR-V2.md §6): who is behind a move, as far as public data says.
 *   /p/0x…           a Polymarket trader: public username or short address, the record and stats (20+ resolved
 *                    markets), profit over time, wins and losses by category, open positions and recent moves
 *   /p/insider-<cik> and /p/fund-<cik> redirect to the public SEC pages (/insiders/<cik>-<slug>, /funds/<cik>-<slug>)
 * Names are for everyone; the numbers are for members ("Try 7 days for $1"), and are never sent to a free
 * viewer's browser. Every number links to where it came from. Nothing about who is behind a wallet, ever. */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { TraderProfile } from "@/components/v2/profiles/TraderProfile";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { walletLabel } from "@/lib/moves/records";
import { fundHref, insiderHref, parseProfileId } from "@/lib/profiles/name";
import { recordOf } from "@/lib/profiles/store";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { EntityLd } from "@/lib/seo/jsonld";
import { traderTitle } from "@/lib/seo/titles";

export const dynamic = "force-dynamic";

async function title(id: string): Promise<{ name: string; title: string; description: string } | null> {
  const ref = parseProfileId(id);
  if (ref?.kind !== "trader") return null;
  const rec = hasDatabase() ? await recordOf(getDb(), ref.wallet).catch(() => null) : null;
  const name = walletLabel(ref.wallet, rec?.name ?? null);
  return { name, ...traderTitle(name, rec, RECORD_MIN_RESOLVED) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await title(id);
  return t ? { title: { absolute: `${t.title} · Insidir` }, description: t.description, alternates: { canonical: `/p/${id.toLowerCase()}` }, openGraph: { title: t.title, description: t.description } } : { title: "Profile", robots: { index: false } };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  const ref = parseProfileId(id);
  if (!ref) notFound();
  if (ref.kind === "insider") permanentRedirect(insiderHref(ref.cik));
  if (ref.kind === "fund") permanentRedirect(fundHref(ref.cik));
  const viewer = await getViewer();
  const trial = unlockHref();
  const db = hasDatabase() ? getDb() : null;
  const body = <TraderProfile db={db} wallet={ref.wallet} viewer={viewer} trial={trial} now={Date.now()} page={page} />;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/p" />
      <main className="wrap app2 trader profile dark">{body}
        <EntityLd trail={[["Leaderboard", "/top"], [walletLabel(ref.wallet, null), `/p/${ref.wallet}`]]} name={`Polymarket account ${walletLabel(ref.wallet, null)}: verified record`} path={`/p/${ref.wallet}`}
          description="Every large position Insidir has seen from this Polymarket account, settled from the public record." sources={["https://polygonscan.com"]} />
      </main>
    </>
  );
}
