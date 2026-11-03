/* The 404 page: a homepage stage (components/WrongTrail.tsx) in the site's frame. */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { WrongTrail } from "@/components/WrongTrail";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default async function NotFound() {
  const viewer = await getViewer().catch(() => null);
  return (
    <Frame member={Boolean(viewer && isPaid(viewer.plan))} current="home" testid="not-found">
      <WrongTrail code="404" title="Page not found." text="This page doesn't exist. The link may be old or mistyped." />
    </Frame>
  );
}
