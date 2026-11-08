"use client";
/* Right after paying: "Setting up your account…" while it asks /api/checkout/status every second until Whop says this
 * account has Insidir (the webhook can lag; the status check asks Whop directly), then the one onboarding question (new members), then back to where they were (their Read). After 30 seconds: "Payment received,
 * finishing up" with a refresh button and our email; it keeps asking in the background. Whop sends the buyer back here with ?status=failed|canceled when an off-site step
 * (3-D Secure, a bank page) didn't go through: then nothing was charged and they can try again. */
import Link from "next/link";
import { Lines } from "@/components/brand/Lines";
import { useEffect, useState } from "react";
import { beacon } from "@/components/app/beacon";

export function Welcome({ status, next = "/" }: { status: string | null; next?: string }) {
  const failed = status === "failed" || status === "canceled";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (failed) return;
    let n = 0, gone = false;
    const tick = async () => {
      if (gone) return;
      const r = await fetch("/api/checkout/status", { method: "POST" }).then(x => x.json() as Promise<{ member: boolean; next?: string }>).catch(() => ({ member: false } as { member: boolean; next?: string }));
      if (r.member) {
        try { const from = sessionStorage.getItem("insidir_pay_from"); if (from) { beacon("paid_seen", "popup", { page: from }); sessionStorage.removeItem("insidir_pay_from"); } } catch { /* attribution only */ } location.replace(next || "/"); return; }
      if (++n === 30) setSlow(true);
      setTimeout(tick, n < 30 ? 1000 : 3000);
    };
    void tick();
    return () => { gone = true; };
  }, [failed]);
  if (failed) return (
    <div className="b-head">
      <Lines as="h1" lines={["Payment didn’t go through."]} size={56} />
      <p className="b-sub" role="alert">Nothing was charged. Try again, or use another card.</p>
      <div className="b-ctas"><Link className="b-btn b-btn-lg b-primary" href="/go?step=paywall">Try again</Link></div>
    </div>
  );
  return (
    <div className="b-head" aria-live="polite" data-testid="setting-up">
      <Lines as="h1" lines={[slow ? "Payment received, finishing up" : "Setting up your account…"]} size={56} />
      {slow ? <p className="b-sub">Your payment went through. Your account is still being set up; this page updates by itself. Refresh in a moment, or write to <a className="s-link" href="mailto:hello@aethric.llc">hello@aethric.llc</a> and we&apos;ll sort it out.</p> : <p className="b-sub">Confirming your payment. This takes a few seconds.</p>}
      <span className="s-meterbar s-wait" aria-hidden="true"><span className="s-grow" /></span>
      {slow ? <div className="b-ctas"><button type="button" className="b-btn b-btn-lg b-primary" onClick={() => location.reload()}>Refresh</button></div> : null}
    </div>
  );
}
