/* The 404 page (components/WrongTrail.tsx). */
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { WrongTrail } from "@/components/WrongTrail";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default async function NotFound() {
  const viewer = await getViewer().catch(() => null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer?.user)} plan={viewer?.plan} tone="light" />
      <WrongTrail code="404" title="Page not found." text="This page doesn't exist. The link may be old or mistyped." />
    </>
  );
}
