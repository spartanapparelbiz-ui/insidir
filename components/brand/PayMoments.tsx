"use client";
/* Pop-ups only after value. A bottom sheet on phones, a centred glass modal on desktop, holding the paywall (Paywall).
 *   After a Read: 8 seconds after the free auto-playing Read finished ("insidir:aha-done") while still on the page, or
 *     when the visitor's own free Read finished ("insidir:read-done").
 *   A tap on anything locked ([data-locked]): always opens, with that item's context ("This wallet is up $3.1M…").
 *   Exit intent on desktop (the cursor leaves through the top), once per session.
 *   60% scroll with no action: a slim bar at the bottom, never a modal.
 * Rules: nothing automatic before the visitor has seen the live feed (on screen 1.5 s) or a Read; at most one automatic
 * modal per session; close button, Esc and tap outside close it, and a close is remembered for 24 hours (cookie);
 * no countdowns, discounts or scarcity; the full price is always in the sheet. */
import { useCallback, useEffect, useRef, useState } from "react";
import { dollars } from "@/lib/money";
import { PLANS, TRIAL } from "@/lib/plans";
import { Paywall } from "./Paywall";
import { gsap, reduced } from "./scroll/engine";

const CLOSED = "insidir_pay_closed";
const AUTO = "insidir_pay_auto";
const AFTER_AHA_MS = 8_000;

export interface PayContext { count: number; window: "hour" | "day"; biggest: { title: string; amount: number } | null }
type Open = { kind: "after-read" | "locked" | "exit"; headline: string } | null;

const closedRecently = () => typeof document !== "undefined" && document.cookie.split("; ").some(c => c.startsWith(`${CLOSED}=`));
const autoUsed = () => { try { return sessionStorage.getItem(AUTO) === "1"; } catch { return false; } };
const markAuto = () => { try { sessionStorage.setItem(AUTO, "1"); } catch { /* private mode */ } };

export function PayMoments({ ctx, now, href = "/go?step=checkout" }: { ctx: PayContext; now: number; href?: string }) {
  const [open, setOpen] = useState<Open>(null);
  const [bar, setBar] = useState(false);
  const valueSeen = useRef(false);
  const acted = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const last = useRef<HTMLElement | null>(null);

  const bets = `${ctx.count} millionaire ${ctx.count === 1 ? "bet" : "bets"} from ${ctx.window === "hour" ? "the last hour" : "today"}`;
  const afterRead = `See the side on all ${bets}. $${TRIAL.fee} for ${TRIAL.days} days.`;

  const show = useCallback((o: NonNullable<Open>, automatic: boolean) => {
    if (automatic && (closedRecently() || autoUsed() || !valueSeen.current)) return;
    if (automatic) markAuto();
    last.current = document.activeElement as HTMLElement | null;
    setBar(false);
    setOpen(o);
  }, []);

  const close = useCallback(() => {
    document.cookie = `${CLOSED}=1; max-age=86400; path=/; samesite=lax`;
    setOpen(null);
    last.current?.focus?.();
  }, []);

  useEffect(() => {
    // Value seen: the live feed on screen for 1.5 s, or a Read.
    const feed = document.querySelector("[data-testid=live-feed]");
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = feed ? new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) t = setTimeout(() => { valueSeen.current = true; }, 1500); else clearTimeout(t);
    }, { threshold: 0.4 }) : null;
    if (feed) io!.observe(feed);
    let aha: ReturnType<typeof setTimeout> | undefined;
    const onAha = () => { valueSeen.current = true; aha = setTimeout(() => show({ kind: "after-read", headline: afterRead }, true), AFTER_AHA_MS); };
    const onRead = () => { valueSeen.current = true; setTimeout(() => show({ kind: "after-read", headline: afterRead }, true), 1500); };
    const onLocked = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-locked]");
      if (!el) return;
      e.preventDefault();
      acted.current = true;
      const pnl = Number(el.dataset.pnl);
      show({ kind: "locked", headline: Number.isFinite(pnl) && pnl > 0 ? `This wallet is up ${dollars(pnl)}. See which side it took. $${TRIAL.fee} for ${TRIAL.days} days.`
        : `See which side the millionaires took. $${TRIAL.fee} for ${TRIAL.days} days.` }, false);
    };
    const onExit = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 0 || window.innerWidth < 768) return;
      show({ kind: "exit", headline: ctx.biggest ? `Before you go: today's biggest millionaire bet is ${dollars(ctx.biggest.amount)} on ${ctx.biggest.title}. See the side for $${TRIAL.fee}.`
        : `Before you go: see every millionaire bet with its side for $${TRIAL.fee}.` }, true);
    };
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && window.scrollY / h >= 0.6 && !acted.current && !closedRecently()) setBar(true);
    };
    const onAct = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.("a, button, input")) acted.current = true; };
    window.addEventListener("insidir:aha-done", onAha);
    window.addEventListener("insidir:read-done", onRead);
    document.addEventListener("click", onLocked, true);
    document.addEventListener("click", onAct);
    document.documentElement.addEventListener("mouseleave", onExit);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io?.disconnect(); clearTimeout(t); clearTimeout(aha);
      window.removeEventListener("insidir:aha-done", onAha);
      window.removeEventListener("insidir:read-done", onRead);
      document.removeEventListener("click", onLocked, true);
      document.removeEventListener("click", onAct);
      document.documentElement.removeEventListener("mouseleave", onExit);
      window.removeEventListener("scroll", onScroll);
    };
  }, [show, afterRead, ctx.biggest]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    lenis?.stop();
    panel.current?.focus();
    if (panel.current && !reduced()) {
      const mobile = window.innerWidth < 768;
      gsap.fromTo(panel.current, mobile ? { yPercent: 100 } : { y: 24, opacity: 0 }, mobile ? { yPercent: 0, duration: 0.7, ease: "expo.out" } : { y: 0, opacity: 1, duration: 0.7, ease: "expo.out" });
    }
    return () => { document.removeEventListener("keydown", onKey); lenis?.start(); };
  }, [open, close]);

  return (
    <>
      {open ? (
        <div className="b-sheet" data-testid="pay-sheet" data-kind={open.kind}>
          <div className="b-sheet__scrim" onClick={close} data-testid="pay-sheet-scrim" />
          <div className="b-sheet__panel b-glass" role="dialog" aria-modal="true" aria-labelledby="pay-h" tabIndex={-1} ref={panel}>
            <button type="button" className="b-sheet__close" onClick={close} aria-label="Close" data-testid="pay-sheet-close">✕</button>
            <Paywall headline={<span id="pay-h">{open.headline}</span>} now={now} href={`${href}&from=${open.kind}`} testid="sheet-paywall" />
          </div>
        </div>
      ) : null}
      {bar && !open ? (
        <div className="b-bar-cta b-glass" role="region" aria-label="Start for $1" data-testid="pay-bar">
          <p>See every side. <b>${TRIAL.fee} for {TRIAL.days} days</b>, then ${PLANS.insidir.price}/mo.</p>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a className="b-btn b-btn--sm" href={`${href}&from=bar`} data-checkout="bar">Start for ${TRIAL.fee} →</a>
            <button type="button" className="b-bar-cta__x" aria-label="Close" onClick={() => { document.cookie = `${CLOSED}=1; max-age=86400; path=/; samesite=lax`; setBar(false); }}>✕</button>
          </span>
        </div>
      ) : null}
    </>
  );
}
