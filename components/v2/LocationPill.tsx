"use client";
/* The location question (docs/V2.md §5): asked once, the first time someone taps a market link, never as a wall in
 * front of the feed. "Where are you? US / Outside US." The answer is remembered (cookie, and the account when signed
 * in) and shown as a small pill they can change. Links are computed on the server for the chosen region, so the page
 * reloads after a choice: a US viewer's page never contains an international Polymarket link. */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { Region } from "@/lib/types";

async function choose(region: Region): Promise<void> {
  const form = new FormData();
  form.set("region", region);
  form.set("next", location.pathname + location.search);
  await fetch("/api/region", { method: "POST", body: form }).catch(() => null);
  location.reload();
}

export function RegionSheet({ onClose }: { onClose: () => void }) {
  const id = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id} className="sheet__h">Where are you?</h2>
        <p className="sheet__p">We only link to apps that work where you are. You can change this any time.</p>
        <div className="sheet__choices">
          <button type="button" className="btn btn--primary btn--block" onClick={() => void choose("us")}>US</button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void choose("non_us")}>Outside US</button>
        </div>
      </div>
    </div>
  );
}

/** The small pill showing the answer ("US" / "Outside US" / "Set location"); tapping it asks again. */
export function LocationPill({ region }: { region: Region | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pill" onClick={() => setOpen(true)} aria-label={`Location: ${region === "us" ? "US" : region === "non_us" ? "Outside US" : "not set"}. Change`}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        {region === "us" ? "US" : region === "non_us" ? "Outside US" : "Set location"}
      </button>
      {open ? <RegionSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A market link that asks the location first when it isn't known yet. */
export function MarketLinkButton({ href, label, regionKnown, className = "btn btn--secondary" }: { href: string | null; label: string; regionKnown: boolean; className?: string }): ReactNode {
  const [open, setOpen] = useState(false);
  if (!regionKnown) {
    return (
      <>
        <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
        {open ? <RegionSheet onClose={() => setOpen(false)} /> : null}
      </>
    );
  }
  return href ? <a className={className} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null;
}
