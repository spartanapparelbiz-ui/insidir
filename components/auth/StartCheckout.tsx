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

export function StartCheckout({ elementsUrl, signedInAs, next = "/" }: { elementsUrl: string; signedInAs: string; next?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("opening");
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setState("opening"); setError(null);
    const res = await fetch("/api/checkout/start", { method: "POST" }).catch(() => null);
    const o = (await res?.json().catch(() => null)) as { planId?: string; metadata?: Record<string, string>; email?: string | null; returnUrl?: string; message?: string } | null;
    if (!res?.ok || !o?.planId) {
      if (res?.status === 503) { setState("unconfigured"); return; }
      setError(res ? "The checkout didn't open. Try again." : "We couldn't reach the checkout. Check your connection and try again."); setState("error");
      return;
    }
    try { await loadScript(elementsUrl); } catch { setError("We couldn't reach the checkout. Check your connection and try again."); setState("error"); return; }
    if (!box.current || !window.WhopElements) { setState("error"); return; }
    const checkout = window.WhopElements({ appearance: APPEARANCE }).checkout.create({
      plan: o.planId, metadata: o.metadata, returnUrl: o.returnUrl,
      onComplete: (c: { result?: string }) => { if (c.result === "payment") location.assign(`/welcome?status=succeeded${next && next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`); },
    });
    checkout.create("checkout", o.email ? { buyerEmail: o.email, lockBuyerEmail: true } : {}).mount(box.current);
    setState("ready");
    let from: string | null = null;
    try { from = sessionStorage.getItem("insidir_pay_from"); } catch { from = null; }
    beacon("checkout_start", from ? "popup" : "start", from ? { page: from } : undefined);
  }, [elementsUrl]);

  useEffect(() => { void open().catch(() => setState("error")); }, [open]);

  return (
    <div className="astart astart--pay" data-testid="start-pay">
      <h1 className="astart__h astart__h--small">Start for $1.</h1>
      <p className="astart__plan" data-testid="charge-line" suppressHydrationWarning>{chargeLine(Date.now())}</p>
      {state === "opening" ? <p className="astart__note" role="status"><span className="acta__spin acta__spin--ink" aria-hidden="true" /> Opening secure checkout…</p> : null}
      {state === "error" ? <p className="aerr" role="alert">{error ?? "The checkout didn't open. Try again."} <button type="button" className="aerr__retry" onClick={() => void open()}>Try again</button></p> : null}
      {state === "unconfigured" ? <p className="aerr" role="alert">Checkout isn&apos;t open yet. Check back soon.</p> : null}
      <div ref={box} className="astart__frame" hidden={state !== "ready"} />
      <p className="astart__who" data-testid="start-signed-in">Signed in as <b>{signedInAs}</b> · <a href="/login/start?next=%2Fstart&amp;fresh=1">Change account</a></p>
      <p className="continue__by">Secure sign-in and payments by Whop.</p>
    </div>
  );
}
