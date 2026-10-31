"use client";
/* The visitors' bottom bar: once they've scrolled 30% of a public page, "You're seeing data 30 minutes late. Live for
 * $1 this week." with "Start for $1". × hides it for the rest of the session. Never on sign-up, sign-in, checkout or
 * account pages (the pay prompt's NEVER list), and not while the pay prompt is open. It slides up with transform
 * only, so nothing on the page moves. Rendered by app/layout.tsx for visitors only. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { beacon } from "@/components/app/beacon";
import { NEVER } from "./PayPrompt";

export const LATE_KEY = "insidir_latebar_closed";
const closed = () => { try { return sessionStorage.getItem(LATE_KEY) === "1"; } catch { return false; } };

export function LateBar() {
  const path = usePathname() ?? "/";
  const [on, setOn] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    if (NEVER.test(path) || closed()) { setGone(true); setOn(false); return; }
    setGone(false);
    let raf = 0;
    const check = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      setOn(max > 0 && scrollY / max >= 0.3);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [path]);

  if (gone) return null;
  const close = () => { try { sessionStorage.setItem(LATE_KEY, "1"); } catch { /* the session just won't remember */ } setGone(true); beacon("latebar_closed", "latebar", { page: path }); };
  return (
    <div className={`latebar${on ? " latebar--on" : ""}`} role="region" aria-label="Live data" aria-hidden={!on} data-testid="late-bar">
      <div className="pg latebar__in">
        <p className="latebar__t">You&apos;re seeing data 30 minutes late. <b>Live for $1 this week.</b></p>
        <Link className="btn btn--primary latebar__cta" href={`/start?next=${encodeURIComponent(path)}&from=latebar`} tabIndex={on ? 0 : -1} data-checkout="latebar">Start for $1</Link>
        <button type="button" className="latebar__x" aria-label="Hide for this visit" tabIndex={on ? 0 : -1} onClick={close}>×</button>
      </div>
    </div>
  );
}
