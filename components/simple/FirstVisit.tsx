"use client";
/* The Terminal shows "How it works" the first time someone opens it. The server decides (no cookie yet); this marks
 * it seen as soon as it shows, so the next visit goes straight to the deals. "Got it" hides it now. */
import { useEffect, useState, type ReactNode } from "react";
import { SEEN_COOKIE } from "@/lib/view";

export function FirstVisit({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  useEffect(() => { document.cookie = `${SEEN_COOKIE}=1; path=/; max-age=${365 * 86_400}; samesite=lax`; }, []);
  if (!shown) return null;
  return (
    <section className="first" aria-label="How it works">
      {children}
      <button type="button" className="btn btn--primary first__ok" onClick={() => setShown(false)}>Got it</button>
    </section>
  );
}
