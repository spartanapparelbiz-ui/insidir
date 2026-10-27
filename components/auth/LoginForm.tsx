"use client";
/* "Log in to Insidir": an email, then the 6-digit code we email (app/api/login/*). One field at a time, big targets,
 * the code field takes the code straight from the iOS/Android keyboard suggestion (autocomplete="one-time-code") and
 * submits itself on the 6th digit. Errors say what to do next; "No active plan" offers Get Insidir. */
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

type Step = "email" | "code";

export function LoginForm({ next, startHref, initialEmail = "" }: { next: string; startHref: string; initialEmail?: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; noPlan?: boolean } | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const post = async (url: string, body: Record<string, string>) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string; next?: string } | null;
    return { ok: Boolean(res?.ok && data?.ok), data };
  };

  const sendCode = async (again = false) => {
    setBusy(true); setError(null); setSentAgain(false);
    const r = await post("/api/login/start", { email });
    setBusy(false);
    if (!r.ok) { setError({ message: r.data?.message ?? "Something went wrong. Try again.", noPlan: r.data?.error === "no_plan" }); return; }
    setStep("code"); setCode(""); setSentAgain(again);
    setTimeout(() => codeRef.current?.focus(), 0);
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true); setError(null);
    const r = await post("/api/login/verify", { email, code: value, next });
    if (r.ok) { location.assign(r.data?.next ?? next); return; }
    setBusy(false);
    setError({ message: r.data?.message ?? "Something went wrong. Try again.", noPlan: r.data?.error === "no_plan" });
    if (r.data?.error === "locked" || r.data?.error === "expired") setCode("");
  };

  const onEmail = (e: FormEvent) => { e.preventDefault(); void sendCode(); };
  const onCode = (e: FormEvent) => { e.preventDefault(); void verify(); };

  return (
    <div className="login">
      <h1 className="login__h">Log in to Insidir</h1>
      {step === "email" ? (
        <form className="login__form" onSubmit={onEmail} noValidate>
          <p className="login__p">Type the email you paid with. We&apos;ll send you a 6-digit code.</p>
          <label className="login__label" htmlFor="login-email">Email</label>
          <input id="login-email" className="login__input" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none"
            spellCheck={false} required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          {error ? <Err e={error} startHref={startHref} /> : null}
          <button className="btn btn--primary btn--big btn--block" type="submit" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form className="login__form" onSubmit={onCode} noValidate>
          <p className="login__p">{sentAgain ? "A new code is on its way to" : "We sent a 6-digit code to"} <b>{email}</b>. It works for 10 minutes.</p>
          <label className="login__label" htmlFor="login-code">Code</label>
          <input id="login-code" ref={codeRef} className="login__input login__input--code" name="code" autoComplete="one-time-code" inputMode="numeric"
            pattern="[0-9]*" maxLength={6} required value={code} placeholder="000000"
            onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) void verify(v); }} />
          {error ? <Err e={error} startHref={startHref} /> : null}
          <button className="btn btn--primary btn--big btn--block" type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Log in"}</button>
          <div className="login__row">
            <button type="button" className="login__link" onClick={() => void sendCode(true)} disabled={busy}>Send a new code</button>
            <button type="button" className="login__link" onClick={() => { setStep("email"); setError(null); }}>Use a different email</button>
          </div>
        </form>
      )}
      <p className="login__fine">New here? <Link href={startHref}>Get Insidir · $39/mo</Link>. By logging in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
    </div>
  );
}

function Err({ e, startHref }: { e: { message: string; noPlan?: boolean }; startHref: string }) {
  return (
    <p className="login__err" role="alert">
      {e.noPlan ? <>No active plan for this email. <Link href={startHref}>Get Insidir · $39/mo</Link>.</> : e.message}
    </p>
  );
}
