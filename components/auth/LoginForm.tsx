"use client";
/* "Log in to Insidir": email and password (app/api/login). Errors say what to do next: "No active plan" offers Get
 * Insidir; a wrong password points to "Forgot password?". */
import Link from "next/link";
import { useState, type FormEvent } from "react";

export function LoginForm({ next, initialEmail = "" }: { next: string; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; noPlan?: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, next }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string; next?: string } | null;
    if (res?.ok && data?.ok) { location.assign(data.next ?? next); return; }
    setBusy(false);
    setError({ message: data?.message ?? "Something went wrong. Try again.", noPlan: data?.error === "no_plan" });
  };

  return (
    <div className="login">
      <h1 className="login__h">Log in to Insidir</h1>
      <form className="login__form" onSubmit={submit} noValidate>
        <label className="login__label" htmlFor="login-email">Email</label>
        <input id="login-email" className="login__input" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none"
          spellCheck={false} required autoFocus={!initialEmail} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <div className="login__labelrow">
          <label className="login__label" htmlFor="login-password">Password</label>
          <Link className="login__link" href="/reset">Forgot password?</Link>
        </div>
        <div className="login__pw">
          <input id="login-password" className="login__input" type={show ? "text" : "password"} name="password" autoComplete="current-password" required
            autoFocus={Boolean(initialEmail)} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" className="login__show" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
        </div>
        {error ? <p className="login__err" role="alert">{error.noPlan ? <>No active plan for this email. <Link href="/start">Try 7 days for $1</Link>.</> : error.message}</p> : null}
        <button className="btn btn--primary btn--big btn--block" type="submit" disabled={busy || !email.includes("@") || !password}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <p className="login__fine">New here? <Link href="/start">Try 7 days for $1</Link>, then $39/mo. By logging in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
    </div>
  );
}
