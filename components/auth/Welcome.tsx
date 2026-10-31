"use client";
/* Right after paying: "Setting up your account…" while it asks /api/checkout/status every second until Whop says this
 * account has Insidir (the webhook can lag; the status check asks Whop directly), then straight into onboarding. After 30 seconds: "Payment received,
 * finishing up" with a refresh button and our email; it keeps asking in the background. Whop sends the buyer back here with ?status=failed|canceled when an off-site step
 * (3-D Secure, a bank page) didn't go through: then nothing was charged and they can try again. */
import Link from "next/link";
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
        try { const from = sessionStorage.getItem("insidir_pay_from"); if (from) { beacon("paid_seen", "popup", { page: from }); sessionStorage.removeItem("insidir_pay_from"); } } catch { /* attribution only */ } const to = r.next ?? "/onboarding"; location.replace(next !== "/" ? `${to}${to.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : to); return; }
      if (++n === 30) setSlow(true);
      setTimeout(tick, n < 30 ? 1000 : 3000);
    };
    void tick();
    return () => { gone = true; };
  }, [failed]);
  if (failed) return (
    <div className="astart rise-in">
      <h1 className="astart__h">Payment didn&apos;t go through.</h1>
      <p className="aerr" role="alert">Nothing was charged. Try again, or use another card.</p>
      <div className="astart__cta"><Link className="btn btn--primary btn--big btn--block acta" href="/start">Try again</Link></div>
    </div>
  );
  return (
    <div className="astart rise-in" aria-live="polite" data-testid="setting-up">
      <h1 className="astart__h">{slow ? "Payment received, finishing up" : "Setting up your account…"}</h1>
      {slow ? <p className="astart__sub">Your payment went through. Your account is still being set up; this page keeps checking. Refresh in a moment, or write to <a href="mailto:hello@aethric.llc">hello@aethric.llc</a> and we&apos;ll sort it out.</p> : null}
      <span className="welcome__bar" aria-hidden="true" />
      {slow ? <button type="button" className="btn btn--primary btn--block" onClick={() => location.reload()}>Refresh</button> : null}
    </div>
  );
}
