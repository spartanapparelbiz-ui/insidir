/* /discover: the members' home, Trackers (components/home/Discover.tsx). Visitors get the public home page instead. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Discover } from "@/components/home/Discover";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trackers", robots: { index: false } };

export default async function DiscoverPage() {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) redirect("/");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/discover" trialHref={unlockHref()} />
      <Discover db={hasDatabase() ? getDb() : null} viewer={viewer} now={Date.now()} />
    </>
  );
}
