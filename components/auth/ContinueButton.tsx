"use client";
/* The only way in: "Continue" (52px, full width) to Whop's sign-in (Google, Apple or email), a spinner inside it while
 * Whop opens, and the line that says who handles it. A plain link underneath, so it works without JavaScript
 * (app/login/start does the rest). */
import { useState } from "react";

export function ContinueButton({ next, fresh = false, label = "Continue" }: { next: string; fresh?: boolean; label?: string }) {
  const q = new URLSearchParams({ next, ...(fresh ? { fresh: "1" } : {}) });
  const [busy, setBusy] = useState(false);
  return (
    <div className="continue">
      <a className={`btn btn--primary btn--big btn--block acta${busy ? " is-busy" : ""}`} href={`/login/start?${q}`} data-testid="continue" aria-busy={busy || undefined} onClick={() => setBusy(true)}>
        {busy ? <span className="acta__spin" aria-hidden="true" /> : null}<span>{label}</span>
      </a>
      <p className="continue__by">Secure sign-in and payments by Whop.</p>
    </div>
  );
}
