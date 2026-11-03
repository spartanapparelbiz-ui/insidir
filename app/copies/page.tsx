/* My copies (/copies): copying whole wallets and trackers, on the homepage's stages (components/copies/MyCopies.tsx):
 * what copying has made at your size, their new moves and the weekly recap. Members only. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { MyCopies } from "@/components/copies/MyCopies";
import { ScrollFx } from "@/components/system";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My copies", robots: { index: false } };

export default async function CopiesPage() {
  const viewer = await requireMember("/copies");
  return (
    <Frame member current="copies" testid="copies-page">
      <MyCopies db={hasDatabase() ? getDb() : null} viewer={viewer} now={Date.now()} />
      <ScrollFx />
    </Frame>
  );
}
