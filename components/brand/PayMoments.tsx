"use client";
/* Pop-ups only after value: a glass modal that settles in, holding the paywall.
 *   After a free Read: 8 s after the free auto-building Read was seen ("insidir:aha-done"), or when the visitor's own free
 *     Read finished ("insidir:read-done").
 *   A tap on anything locked ([data-locked]): opens with that item's context ("This wallet is up $3.1M…").
 *   Exit intent on desktop (the cursor leaves through the top).
 * Rules: automatic ones never in the first 15 s on the page, and at most once per session; a close (button, Esc, a tap
 * outside) is remembered for 24 hours; taps on locked items always open. No countdowns, discounts or scarcity; the full
 * price is always in it. */
import { useCallback, useEffect, useRef, useState } from "react";
import { dollars } from "@/lib/money";
import { TRIAL } from "@/lib/plans";
import { Paywall } from "./Paywall";

const CLOSED = "insidir_pay_closed", AUTO = "insidir_pay_auto";
export const QUIET_MS = 15_000, AFTER_AHA_MS = 8_000;

export interface PayContext { count: number; window: "hour" | "day"; biggest: { title: string; amount: number } | null }
type Open = { kind: "after-read" | "locked" | "exit"; headline: string } | null;

const closedRecently = () => document.cookie.split("; ").some(c => c.startsWith(`${CLOSED}=`));
const autoUsed = () => { try { return sessionStorage.getItem(AUTO) === "1"; } catch { return false; } };
const markAuto = () => { try { sessionStorage.setItem(AUTO, "1"); } catch { /* private mode */ } };

export function PayMoments({ ctx, now, href = "/go?step=checkout" }: { ctx: PayContext; now: number; href?: string }) {
  const [open, setOpen] = useState<Open>(null);
  const t0 = useRef(Date.now());
  const panel = useRef<HTMLDivElement>(null), back = useRef<HTMLElement | null>(null);
  const bets = `${ctx.count} millionaire ${ctx.count === 1 ? "bet" : "bets"} from ${ctx.window === "hour" ? "the last hour" : "today"}`;
  const afterRead = `See the side on all ${bets}. $${TRIAL.fee} for ${TRIAL.days} days.`;

  const show = useCallback((o: NonNullable<Open>, automatic: boolean) => {
    if (automatic) {
      if (closedRecently() || autoUsed()) return;
      const wait = QUIET_MS - (Date.now() - t0.current);
      if (wait > 0) { setTimeout(() => show(o, true), wait); return; }
      markAuto();
    }
    back.current = document.activeElement as HTMLElement | null;
    setOpen(o);
  }, []);
  const close = useCallback(() => { document.cookie = `${CLOSED}=1; max-age=86400; path=/; samesite=lax`; setOpen(null); back.current?.focus?.(); }, []);

  useEffect(() => {
    let aha: ReturnType<typeof setTimeout> | undefined;
    const onAha = () => { aha = setTimeout(() => show({ kind: "after-read", headline: afterRead }, true), AFTER_AHA_MS); };
    const onRead = () => setTimeout(() => show({ kind: "after-read", headline: afterRead }, true), 1500);
    const onLocked = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-locked]");
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      const pnl = Number(el.dataset.pnl);
      show({ kind: "locked", headline: Number.isFinite(pnl) && pnl > 0 ? `This wallet is up ${dollars(pnl)}. See which side it took. $${TRIAL.fee} for ${TRIAL.days} days.` : `See which side the millionaires took. $${TRIAL.fee} for ${TRIAL.days} days.` }, false);
    };
    const onExit = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 0 || window.innerWidth < 768) return;
      show({ kind: "exit", headline: ctx.biggest ? `Before you go: today's biggest millionaire bet is ${dollars(ctx.biggest.amount)} on ${ctx.biggest.title}. See the side for $${TRIAL.fee}.` : `Before you go: see every millionaire bet with its side for $${TRIAL.fee}.` }, true);
    };
    window.addEventListener("insidir:aha-done", onAha);
    window.addEventListener("insidir:read-done", onRead);
    document.addEventListener("click", onLocked, true);
    document.documentElement.addEventListener("mouseleave", onExit);
    return () => {
      clearTimeout(aha);
      window.removeEventListener("insidir:aha-done", onAha); window.removeEventListener("insidir:read-done", onRead);
      document.removeEventListener("click", onLocked, true); document.documentElement.removeEventListener("mouseleave", onExit);
    };
  }, [show, afterRead, ctx.biggest]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", esc);
  }, [open, close]);

  if (!open) return null;
  return (
    <div className="b-modal" data-testid="pay-sheet" data-kind={open.kind}>
      <div className="b-modal__scrim" onClick={close} data-testid="pay-sheet-scrim" />
      <div className="b-modal__panel" role="dialog" aria-modal="true" aria-labelledby="pay-h" tabIndex={-1} ref={panel}>
        <button type="button" className="b-modal__close" onClick={close} aria-label="Close" data-testid="pay-sheet-close">✕</button>
        <Paywall headline={<span id="pay-h">{open.headline}</span>} now={now} href={`${href}&from=${open.kind}`} testid="sheet-paywall" />
      </div>
    </div>
  );
}
