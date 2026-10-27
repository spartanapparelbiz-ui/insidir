"use client";
/* The embedded Whop checkout on /start (docs.whop.com/developer/guides/embed-checkout): Whop's Checkout element,
 * mounted on insidir.com, collects the email and the card (Apple Pay where the device has it). We open it with a
 * claim token and, when logged in, our account id in its metadata (app/api/checkout/start); when it completes we go
 * to /welcome, which logs the buyer in as soon as the billing webhook has made the account. Access itself only ever
 * comes from the webhook, never from this page. */
import { useEffect, useRef, useState } from "react";

interface Elements { checkout: { create: (o: Record<string, unknown>) => { create: (k: "checkout", p?: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void } } } }
declare global { interface Window { WhopElements?: (o?: Record<string, unknown>) => Elements } }

/** Whop's dark theme, so the checkout sits in the page without a white flash. */
const APPEARANCE = { theme: { appearance: "dark" } };

function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    if (window.WhopElements) return ok();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.dataset.whopElements = "";
    s.onload = () => ok(); s.onerror = () => fail(new Error("script"));
    document.head.appendChild(s);
  });
}

export function StartCheckout({ elementsUrl }: { elementsUrl: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unconfigured">("loading");
  useEffect(() => {
    let gone = false;
    (async () => {
      const res = await fetch("/api/checkout/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
      if (!res?.ok) { if (!gone) setState(res?.status === 503 ? "unconfigured" : "error"); return; }
      const o = (await res.json()) as { planId: string; metadata: Record<string, string>; email: string; returnUrl: string };
      await loadScript(elementsUrl);
      if (gone || !box.current || !window.WhopElements) return;
      const checkout = window.WhopElements({ appearance: APPEARANCE }).checkout.create({
        plan: o.planId, metadata: o.metadata, returnUrl: o.returnUrl,
        onComplete: (c: { result?: string }) => { if (c.result === "payment") location.assign("/welcome?status=succeeded"); },
      });
      checkout.create("checkout", o.email ? { buyerEmail: o.email } : undefined).mount(box.current);
      setState("ready");
    })().catch(() => { if (!gone) setState("error"); });
    return () => { gone = true; };
  }, [elementsUrl]);
  return (
    <div className="start__pay">
      {state === "loading" ? <p className="start__note" role="status">Opening secure checkout…</p> : null}
      {state === "error" ? <p className="login__err" role="alert">The checkout didn&apos;t load. Refresh the page; if it keeps happening, write to hello@aethric.llc.</p> : null}
      {state === "unconfigured" ? <p className="login__err" role="alert">Checkout isn&apos;t open yet. Check back soon.</p> : null}
      <div ref={box} className="start__frame" />
    </div>
  );
}
