"use client";
/* Step 2 of "Forgot password?" (/reset): the new password, at least 8 characters (app/api/password/reset). */
import { useState, type FormEvent } from "react";

export function NewPassword({ email }: { email: string | null }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError(null);
    const res = await fetch("/api/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string; next?: string } | null;
    if (res?.ok && data?.ok) { location.assign(data.next ?? "/feed"); return; }
    setBusy(false); setError(data?.message ?? "Something went wrong. Try again.");
  };
  return (
    <form className="login__form" onSubmit={submit} noValidate>
      <p className="login__p">It&apos;s you{email ? <> (<b>{email}</b>)</> : null}. Choose a new password.</p>
      {email ? <input type="email" name="email" autoComplete="username" value={email} readOnly hidden /> : null}
      <label className="login__label" htmlFor="new-password">New password</label>
      <div className="login__pw">
        <input id="new-password" className="login__input" type={show ? "text" : "password"} name="password" autoComplete="new-password" minLength={8} required autoFocus
          value={password} onChange={e => setPassword(e.target.value)} aria-describedby="new-password-hint" />
        <button type="button" className="login__show" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
      </div>
      <p id="new-password-hint" className="login__fine">At least 8 characters.</p>
      {error ? <p className="login__err" role="alert">{error}</p> : null}
      <button className="btn btn--primary btn--big btn--block" type="submit" disabled={busy}>{busy ? "Saving…" : "Save and log in"}</button>
    </form>
  );
}
