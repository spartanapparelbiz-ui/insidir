"use client";
/* Right after paying: asks /api/checkout/claim every second until the billing webhook has made the account, then
 * lands on the feed's "You're in." Whop sends the buyer back here with ?status=failed|canceled when an off-site step
 * (3-D Secure, a bank page) didn't go through: then nothing was charged and they can try again. */
import Link from "next/link";
import { useEffect, useState } from "react";

export function Welcome({ status }: { status: string | null }) {
  const failed = status === "failed" || status === "canceled";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (failed) return;
    let n = 0, gone = false;
    const tick = async () => {
      if (gone) return;
      const r = await fetch("/api/checkout/claim", { method: "POST" }).then(x => x.json() as Promise<{ ready: boolean; next?: string }>).catch(() => ({ ready: false } as { ready: boolean; next?: string }));
      if (r.ready) { location.replace(r.next ?? "/feed?welcome=1"); return; }
      if (++n === 20) setSlow(true);
      setTimeout(tick, n < 30 ? 1000 : 3000);
    };
    void tick();
    return () => { gone = true; };
  }, [failed]);
  if (failed) return (
    <div className="login">
      <h1 className="login__h">Payment didn&apos;t go through.</h1>
      <p className="login__p">Nothing was charged. You can try again with another card.</p>
      <Link className="btn btn--primary btn--big btn--block" href="/start">Try again</Link>
    </div>
  );
  return (
    <div className="login" aria-live="polite">
      <h1 className="login__h">You&apos;re in.</h1>
      <p className="login__p">{slow ? "Your payment went through. We're still setting up your account; this can take a minute. You can also log in with your email." : "Setting up your account…"}</p>
      <span className="welcome__bar" aria-hidden="true" />
      {slow ? <Link className="btn btn--secondary btn--block" href="/login">Log in with your email</Link> : null}
    </div>
  );
}
