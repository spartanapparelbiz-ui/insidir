"use client";
/* The timed pay prompt's trigger (the modal is components/paywall/PayModal.tsx, loaded only when it fires).
 *   When: `delayMs` after a visitor lands on a public page (PAYWALL_POPUP_DELAY_MS, 6s; an A/B arm gets 12s), or on a
 *   desktop when the cursor leaves the top of the window, whichever comes first; if they're scrolling then, it waits
 *   until they've stopped for 1 second.
 *   Never: for anyone signed in, on sign-up, sign-in, checkout and account pages. Every other public page has it.
 *   How often: once per session; after a dismiss, not for 24 hours (localStorage; without storage, once per page load).
 * Rendered by app/layout.tsx for visitors only. */
import { usePathname } from "next/navigation";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const PayModal = lazy(() => import("./PayModal").then(m => ({ default: m.PayModal })));

export const SEEN_KEY = "insidir_pay_seen";
export const DISMISS_KEY = "insidir_pay_dismissed";
const DAY = 86_400_000;
/** Pages where it never shows. */
export const NEVER = /^\/(start|login|welcome|checkout|onboarding|signin|reset|auth|settings|following|alerts|admin|dev)(\/|$)/;

const store = {
  get(k: "s" | "l", key: string): string | null { try { return (k === "s" ? sessionStorage : localStorage).getItem(key); } catch { return null; } },
  set(k: "s" | "l", key: string, v: string): boolean { try { (k === "s" ? sessionStorage : localStorage).setItem(key, v); return true; } catch { return false; } },
};

export function PayPrompt({ delayMs, variant }: { delayMs: number; variant: string }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (NEVER.test(path) || fired.current) return;
    if (store.get("s", SEEN_KEY) === "1") return;
    const dismissed = Number(store.get("l", DISMISS_KEY) ?? 0);
    if (dismissed && Date.now() - dismissed < DAY) return;
    let lastScroll = 0, timer = 0, wait = 0;
    const onScroll = () => { lastScroll = Date.now(); };
    const fire = () => {
      if (fired.current) return;
      // Mid-scroll: wait until they've stopped for a second.
      const idle = Date.now() - lastScroll;
      if (idle < 1000) { wait = window.setTimeout(fire, 1000 - idle + 50); return; }
      fired.current = true;
      store.set("s", SEEN_KEY, "1");
      setOpen(true);
    };
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0 && !e.relatedTarget && window.matchMedia("(pointer: fine)").matches) fire(); };
    // Test hook: the browser specs set their own delay in sessionStorage (qa/e2e/paywall-prompt.spec.ts).
    const forced = Number(store.get("s", "insidir_pay_delay_test"));
    timer = window.setTimeout(fire, forced > 0 ? forced : delayMs);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => { clearTimeout(timer); clearTimeout(wait); window.removeEventListener("scroll", onScroll); document.removeEventListener("mouseout", onLeave); };
  }, [path, delayMs]);

  if (!open) return null;
  return <Suspense fallback={null}><PayModal path={path} variant={variant} onClose={() => { setOpen(false); store.set("l", DISMISS_KEY, String(Date.now())); }} /></Suspense>;
}
