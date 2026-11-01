/* My copies (/copies), kept live by URL: what copying winners has made at your size, their new moves and the weekly
 * recap (components/copies/MyCopies.tsx). Members only. */
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MyCopies } from "@/components/copies/MyCopies";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My copies", robots: { index: false } };

export default async function CopiesPage() {
  const viewer = await requireMember("/copies");
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} current="/copies" />
      <MyCopies db={hasDatabase() ? getDb() : null} viewer={viewer} now={Date.now()} />
    </>
  );
}
