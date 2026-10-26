"use client";
/* One click listener for the page: links marked data-unlock fire "unlock_click"; any link to Whop checkout fires
 * "checkout_start" before the browser leaves. Works for server-rendered links (table rows, banners) without making
 * them client components. */
import { useEffect } from "react";
import { beacon } from "./beacon";

export function Beacons({ where }: { where: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("a, button") : null;
      if (!el) return;
      const unlock = el.getAttribute("data-unlock");
      if (unlock !== null) beacon("unlock_click", unlock || where);
      const href = el instanceof HTMLAnchorElement ? el.href : "";
      // Any absolute link to a /checkout/ page is the Whop checkout (the site itself has no such route).
      if (el.hasAttribute("data-checkout") || /^https?:\/\/[^/]+\/checkout\//.test(href)) beacon("checkout_start", unlock || where);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [where]);
  return null;
}
