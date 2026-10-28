"use client";
/* The sign-up pop-up, once per visit, on the public pages (home, Sports, Markets, Stocks, Results): after the visitor has
 * scrolled 60% of the page, or on a desktop when the mouse leaves the window. A centred card on desktop, a bottom sheet
 * on phones: one of our photos, the logo, one line, the price, Get Insidir (/start) and a way to log in. No timers, no
 * numbers. Closes with ×, Escape or a tap outside, keeps focus inside while open, and stays closed for the rest of the
 * visit (sessionStorage). The pages only render it for visitors, never for members. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";
import { Photo } from "@/components/Photo";
import { Wordmark } from "@/components/Wordmark";
import { SPOT } from "@/lib/photos";
import { CANCEL_LINE, GET_CTA } from "@/lib/copy";

const KEY = "insidir_offer_seen";

export function ScrollOffer({ where }: { where: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch { /* private mode: once per page view */ }
    if (seen) return;
    let raf = 0;
    let done = false;
    const show = (why: string) => {
      if (done) return;
      done = true;
      back.current = document.activeElement;
      setOpen(true);
      try { sessionStorage.setItem(KEY, "1"); } catch { /* fine */ }
      beacon("offer_view", `${where}:${why}`);
      stop();
    };
    const check = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.6) show("scroll");
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    // Exit intent: a fine pointer leaving through the top of the window (towards the tabs and the address bar).
    const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget && e.clientY <= 0) show("exit"); };
    const stop = () => {
      removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
    addEventListener("scroll", onScroll, { passive: true });
    check(); // already past 60% when the page came in (a reload or a jump link)
    if (desktop) document.addEventListener("mouseout", onLeave);
    return stop;
  }, [where]);

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    el?.querySelector<HTMLElement>(".popup__btn")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>("a[href], button")];
      const first = f[0], last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", key);
    const html = document.documentElement;
    html.classList.add("popup-open");
    return () => {
      removeEventListener("keydown", key);
      html.classList.remove("popup-open");
      if (back.current instanceof HTMLElement) back.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="popup" role="presentation" data-testid="signup-popup" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={panel} className="popup__panel" role="dialog" aria-modal="true" aria-labelledby="popup-h">
        <Photo n={SPOT.popup} className="popup__photo" wideOnly sizes="(min-width: 640px) 440px, 100vw" />
        <div className="popup__body">
          <span className="popup__logo"><Wordmark /></span>
          <h2 id="popup-h" className="popup__h">See the biggest bets the moment they happen.</h2>
          <p className="popup__p">{CANCEL_LINE}</p>
          <Link className="btn btn--primary btn--block popup__btn" href="/start" data-unlock={`popup-${where}`}>{GET_CTA}</Link>
          <p className="popup__login">Already a member? <Link href="/login">Log in</Link></p>
        </div>
        <button type="button" className="popup__x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
    </div>
  );
}
