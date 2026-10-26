"use client";
/* The only funnel events the browser reports from the public pages: a tap on an Unlock button ([data-unlock]) or
 * a checkout CTA ([data-checkout]) that leaves for the Whop checkout. One delegated listener; navigation is never delayed (sendBeacon). */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function send(name: "unlock_click" | "checkout_start", where: string): void {
  try {
    const body = new Blob([JSON.stringify({ name, where })], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", body)) {
      void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
    }
  } catch { /* measurement must never break a tap */ }
}

export function Beacons() {
  // The two pages a visitor goes to next, fetched while the browser is idle so the tap feels instant.
  const router = useRouter();
  useEffect(() => {
    const go = () => { router.prefetch("/terminal"); router.prefetch("/receipts"); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go); else window.setTimeout(go, 1500);
  }, [router]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const unlock = t.closest("[data-unlock]");
      const checkout = t.closest("[data-checkout]");
      const where = (unlock ?? checkout)?.getAttribute(unlock ? "data-unlock" : "data-checkout") ?? "";
      if (unlock) send("unlock_click", where);
      // checkout_start only when the tap actually leaves for the Whop checkout (not the sign-in fallback).
      const href = (unlock ?? checkout)?.closest("a")?.getAttribute("href") ?? "";
      if ((unlock || checkout) && /^https?:\/\/[^/]+\/checkout\//.test(href)) send("checkout_start", where);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
