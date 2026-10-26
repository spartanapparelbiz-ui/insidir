"use client";
/* The sheet frame shared by the Terminal's detail sheet and its "Show me how" sheet: up from the bottom on phones, a
 * right-side panel on desktop. Escape, the close button or the backdrop close it; focus stays inside while it's
 * open and goes back to whatever opened it afterwards; the page behind doesn't scroll. */
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({ labelledBy, href, onClose, children }: { labelledBy: string; href: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    el?.querySelector<HTMLElement>("[data-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      // An open "?" explanation closes first (the browser handles that Escape itself).
      if (e.key === "Escape") { if (!document.querySelector(".help__tip:popover-open")) { e.preventDefault(); close.current(); } return; }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
      const first = items[0], last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; opener?.focus(); };
  }, []);

  return (
    <div className="dsheet">
      <div className="dsheet__scrim" onClick={onClose} aria-hidden="true" />
      <div className="dsheet__panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="dsheet__bar">
          <a className="btn btn--ghost dsheet__full" href={href}>Open full page</a>
          <button type="button" className="btn btn--secondary dsheet__x" onClick={onClose} data-close>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
