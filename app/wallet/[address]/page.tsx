/* A wallet (/wallet/0x…): a Polymarket wallet's verified record, settled from the public record, losses included:
 * all-time profit, its last closed bets, open positions, categories and today's bets, and Follow. Never a name, a handle
 * or a face: only the short address. The numbers are for members, and never sent to a visitor's browser. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { ScrollFx } from "@/components/system";
import { WalletProfile } from "@/components/system/WalletProfile";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { getDb, hasDatabase } from "@/lib/db";
import { walletLabel } from "@/lib/moves/records";
import { parseProfileId } from "@/lib/profiles/name";
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

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address: id } = await params;
  const t = await title(id);
  return t ? { title: { absolute: `${t.title} · Insidir` }, description: t.description, alternates: { canonical: `/wallet/${id.toLowerCase()}` }, openGraph: { title: t.title, description: t.description } } : { title: "Profile", robots: { index: false } };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<{ page?: string }> }) {
  const { address: id } = await params;
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  const ref = parseProfileId(id);
  if (ref?.kind !== "trader") notFound();
  const viewer = await getViewer();
  const db = hasDatabase() ? getDb() : null;
  return (
    <Frame member={isPaid(viewer.plan)} current="wallets" testid="wallet-page">
      <WalletProfile db={db} wallet={ref.wallet} viewer={viewer} now={Date.now()} page={page} />
      <ScrollFx />
        <EntityLd trail={[["Wallets", "/wallets"], [walletLabel(ref.wallet, null), `/wallet/${ref.wallet}`]]} name={`Polymarket account ${walletLabel(ref.wallet, null)}: verified record`} path={`/wallet/${ref.wallet}`}
          description="Every large position Insidir has seen from this Polymarket account, settled from the public record." sources={["https://polygonscan.com"]} />
    </Frame>
  );
}
