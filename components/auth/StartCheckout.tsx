"use client";
/* Get Insidir on /start: one page, sign-up on top and Whop's checkout embedded below
 * (docs.whop.com/developer/guides/embed-checkout).
 *   New: email and a password (at least 8 characters), then "Continue to payment" opens the checkout under them with
 *   that email filled in and locked. Paying makes the account with that email and password.
 *   Logged in (their plan ended): the checkout opens straight away.
 * The checkout carries a claim token (and our account id when logged in) as metadata (app/api/checkout/start); when
 * it completes we go to /welcome, which logs the buyer in as soon as the billing webhook has made the account. Access
 * itself only ever comes from the webhook, never from this page. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { beacon } from "@/components/app/beacon";

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

type State = "form" | "opening" | "ready" | "error" | "unconfigured";

export function StartCheckout({ elementsUrl, signedInEmail, pendingEmail = null }: { elementsUrl: string; signedInEmail: string | null;
  /** Made their account here before but didn't pay: their email, filled in. */
  pendingEmail?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>(signedInEmail ? "opening" : "form");
  const [email, setEmail] = useState(pendingEmail ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ message: string; exists?: boolean } | null>(null);

  const open = useCallback(async (body: Record<string, string>) => {
    setState("opening"); setError(null);
    const res = await fetch("/api/checkout/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const o = (await res?.json().catch(() => null)) as { planId?: string; metadata?: Record<string, string>; email?: string; returnUrl?: string; error?: string; message?: string } | null;
    if (!res?.ok || !o?.planId) {
      if (res?.status === 503) { setState("unconfigured"); return; }
      setError({ message: o?.message ?? "Something went wrong. Try again.", exists: o?.error === "exists" });
      setState(signedInEmail ? "error" : "form");
      return;
    }
    await loadScript(elementsUrl);
    if (!box.current || !window.WhopElements) { setState("error"); return; }
    const checkout = window.WhopElements({ appearance: APPEARANCE }).checkout.create({
      plan: o.planId, metadata: o.metadata, returnUrl: o.returnUrl,
      onComplete: (c: { result?: string }) => { if (c.result === "payment") location.assign("/welcome?status=succeeded"); },
    });
    // The payment form opens in place, right under the account step: the page doesn't jump (its slot keeps its height).
    checkout.create("checkout", { buyerEmail: o.email, lockBuyerEmail: true }).mount(box.current);
    setState("ready");
    beacon("checkout_start", "start");
  }, [elementsUrl, signedInEmail]);

  useEffect(() => { if (signedInEmail) void open({}).catch(() => setState("error")); }, [signedInEmail, open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError({ message: "Use at least 8 characters for your password." }); return; }
    void open({ email, password }).catch(() => setState("error"));
  };

  return (
    <div className="start__flow">
      {signedInEmail ? (
        <p className="start__who">Restarting Insidir for <b>{signedInEmail}</b>.</p>
      ) : (
        <form className="login__form start__signup" onSubmit={submit} noValidate aria-label="Create your account">
          <p className="start__step"><span className="start__n">1</span> {pendingEmail ? "Finish getting Insidir" : "Create your account"}</p>
          <label className="login__label" htmlFor="start-email">Email</label>
          <input id="start-email" className="login__input" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
            required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={state === "ready" || state === "opening"} />
          <label className="login__label" htmlFor="start-password">Password</label>
          <div className="login__pw">
            <input id="start-password" className="login__input" type={show ? "text" : "password"} name="password" autoComplete="new-password" minLength={8} required
              value={password} onChange={e => setPassword(e.target.value)} aria-describedby="start-password-hint" disabled={state === "ready" || state === "opening"} />
            <button type="button" className="login__show" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
          </div>
          <p id="start-password-hint" className="login__fine">At least 8 characters. You&apos;ll log in with this email and password.</p>
          {error ? <p className="login__err" role="alert">{error.message}{error.exists ? <> <Link href="/login?next=%2Fstart">Log in</Link></> : null}</p> : null}
          {state === "ready" || state === "opening" ? null
            : <button className="btn btn--primary btn--big btn--block" type="submit" disabled={!email.includes("@") || !password}>Continue to payment</button>}
          <p className="start__trust">Cancel anytime in 2 clicks. Secure payment by Whop.</p>
        </form>
      )}
      <section className="start__pay" aria-label="Payment">
        <p className="start__step"><span className="start__n">{signedInEmail ? 1 : 2}</span> Pay $39/month · Cancel anytime</p>
        {state === "form" ? <p className="start__note">The secure payment form opens here once you&apos;ve chosen a password.</p> : null}
        {state === "opening" ? <p className="start__note" role="status">Opening secure checkout…</p> : null}
        {state === "error" ? <p className="login__err" role="alert">{error?.message ?? "The checkout didn't load. Refresh the page; if it keeps happening, write to hello@aethric.llc."}</p> : null}
        {state === "unconfigured" ? <p className="login__err" role="alert">Checkout isn&apos;t open yet. Check back soon.</p> : null}
        <div ref={box} className="start__frame" hidden={state !== "ready"} />
        {state === "ready" ? <p className="start__trust">Cancel anytime in 2 clicks. Secure payment by Whop.</p> : null}
      </section>
    </div>
  );
}
