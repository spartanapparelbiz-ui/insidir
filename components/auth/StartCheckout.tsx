"use client";
/* The checkout on /start, for someone signed in with Whop who doesn't have Insidir yet: Whop's embedded checkout
 * (docs.whop.com/developer/guides/embed-checkout) opens in place straight away, 7 days for $1, then $39/month, Apple Pay
 * and Google Pay first where the device has them. The checkout carries our account id as metadata
 * (app/api/checkout/start), so the billing webhook links the membership to this account; when it completes we go to
 * /welcome, which waits for Whop to say they have access. Access only ever comes from Whop, never from this page. */
import { useCallback, useEffect, useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";
import { chargeLine } from "@/lib/copy";

interface Elements { checkout: { create: (o: Record<string, unknown>) => { create: (k: "checkout", p?: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void } } } }
declare global { interface Window { WhopElements?: (o?: Record<string, unknown>) => Elements } }

/** The checkout's dark theme, so it sits in the page without a white flash. */
const APPEARANCE = { theme: { appearance: "light" } };

function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    if (window.WhopElements) return ok();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.dataset.whopElements = "";
    s.onload = () => ok(); s.onerror = () => fail(new Error("script"));
    document.head.appendChild(s);
  });
}

type State = "opening" | "ready" | "error" | "unconfigured";

export function StartCheckout({ elementsUrl, signedInAs }: { elementsUrl: string; signedInAs: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("opening");
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setState("opening"); setError(null);
    const res = await fetch("/api/checkout/start", { method: "POST" }).catch(() => null);
    const o = (await res?.json().catch(() => null)) as { planId?: string; metadata?: Record<string, string>; email?: string | null; returnUrl?: string; message?: string } | null;
    if (!res?.ok || !o?.planId) {
      if (res?.status === 503) { setState("unconfigured"); return; }
      setError(o?.message ?? "Something went wrong. Try again."); setState("error");
      return;
    }
    await loadScript(elementsUrl);
    if (!box.current || !window.WhopElements) { setState("error"); return; }
    const checkout = window.WhopElements({ appearance: APPEARANCE }).checkout.create({
      plan: o.planId, metadata: o.metadata, returnUrl: o.returnUrl,
      onComplete: (c: { result?: string }) => { if (c.result === "payment") location.assign("/welcome?status=succeeded"); },
    });
    checkout.create("checkout", o.email ? { buyerEmail: o.email, lockBuyerEmail: true } : {}).mount(box.current);
    setState("ready");
    beacon("checkout_start", "start");
  }, [elementsUrl]);

  useEffect(() => { void open().catch(() => setState("error")); }, [open]);

  return (
    <div className="start__flow">
      <p className="start__who" data-testid="start-signed-in">Signed in as <b>{signedInAs}</b>. <a href="/login/start?next=%2Fstart&amp;fresh=1">Use a different account</a></p>
      <section className="start__pay" aria-label="Payment">
        <p className="start__step">Pay $1 today · then $39/mo, cancel anytime</p>
        {state === "opening" ? <p className="start__note" role="status">Opening secure checkout…</p> : null}
        {state === "error" ? <p className="login__err" role="alert">{error ?? "The checkout didn't load. Refresh the page; if it keeps happening, write to hello@aethric.llc."}</p> : null}
        {state === "unconfigured" ? <p className="login__err" role="alert">Checkout isn&apos;t open yet. Check back soon.</p> : null}
        <div ref={box} className="start__frame" hidden={state !== "ready"} />
        <p className="start__charge" data-testid="charge-line" suppressHydrationWarning>{chargeLine(Date.now())}</p>
        <p className="continue__by">Secure sign-in and payments by Whop. Cancel anytime from your Whop orders.</p>
      </section>
    </div>
  );
}
