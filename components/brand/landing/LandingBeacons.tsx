"use client";
/* The landing's taps, for the funnel (/admin/funnel splits them by where): a Start for $1 ([data-cta]: hero, pricing or
 * sticky) is "hero_cta_click", a board row ([data-board-row]) is "board_row_click" (where: landing) and opens the bet.
 * One delegated listener; navigation is never delayed (sendBeacon). */
import { useEffect } from "react";
import { beacon } from "@/components/app/beacon";

export function LandingBeacons() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const cta = t.closest("[data-cta]");
      if (cta) { beacon("hero_cta_click", cta.getAttribute("data-cta") ?? "landing"); return; }
      const row = t.closest<HTMLElement>("[data-board-row]");
      if (row) {
        beacon("board_row_click", "landing");
        const href = row.dataset.href;
        if (href && !t.closest("a")) window.location.assign(href);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const row = (e.target as Element | null)?.closest?.<HTMLElement>("[data-board-row]");
      if (row && e.key === "Enter" && row.dataset.href) { beacon("board_row_click", "landing"); window.location.assign(row.dataset.href); }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);
  return null;
}
