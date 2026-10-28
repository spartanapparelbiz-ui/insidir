"use client";
/* One small card, once per visit, after the visitor has scrolled about 60% of the page (home and the Sports /
 * Markets / Stocks previews): "See every big move live. $39/mo, cancel anytime." and Get Insidir. No timers, no
 * numbers, closes with × or Escape and stays closed for the rest of the visit (sessionStorage). Visitors only. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { beacon } from "@/components/app/beacon";

const KEY = "insidir_offer_seen";

export function ScrollOffer({ where }: { where: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch { /* private mode: show once per page view */ }
    if (seen) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.6) {
        setOpen(true);
        try { sessionStorage.setItem(KEY, "1"); } catch { /* fine */ }
        beacon("offer_view", where);
        removeEventListener("scroll", onScroll);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [where]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;
  return (
    <aside className="offer" role="complementary" aria-label="Get Insidir">
      <p className="offer__h">See every big move live.</p>
      <p className="offer__p">$39/mo, cancel anytime.</p>
      <Link className="btn btn--primary offer__btn" href="/start" data-unlock={`offer-${where}`}>Get Insidir</Link>
      <button type="button" className="offer__x" onClick={() => setOpen(false)} aria-label="Close">×</button>
    </aside>
  );
}
