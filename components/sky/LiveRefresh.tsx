"use client";
/* Re-reads the page's server data every `ms` while the tab is visible, so live numbers (components/nx/Tick.tsx) tick
 * to their new values. Nothing else changes on the page. */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ ms = 30_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
