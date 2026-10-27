"use client";
/* Instant feedback on every link tap: a thin bar starts across the top of the screen the moment a link to another page
 * is pressed (before the server answers) and finishes when the new page is in. Mounted once in app/layout.tsx. Skips
 * new tabs, downloads, other sites, same-page anchors and modified clicks. Under reduced motion the bar simply shows. */
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function NavProgress() {
  const path = usePathname();
  const query = useSearchParams();
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.nav) { root.dataset.nav = "done"; const t = setTimeout(() => { delete root.dataset.nav; }, 250); return () => clearTimeout(t); }
  }, [path, query]);
  useEffect(() => {
    const start = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      document.documentElement.dataset.nav = "go";
    };
    document.addEventListener("click", start);
    return () => document.removeEventListener("click", start);
  }, []);
  return <span className="navbar-prog" aria-hidden="true" />;
}
