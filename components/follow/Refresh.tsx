"use client";
/* Keeps a server-rendered list live: re-renders it from the server every `ms` while the tab is visible. */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function Refresh({ ms = 30_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
