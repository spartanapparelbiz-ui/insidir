"use client";
/* Re-reads the page's server data on an interval while the tab is visible (router.refresh: no reload, no flash). */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function Refresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
