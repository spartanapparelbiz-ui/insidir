"use client";
/* Follow / Following on a trader or market. Free viewers see it locked (lock icon) with the $1 upsell; when following
 * isn't ready on production it is the Coming soon item instead. */
import { useState } from "react";
import { ComingSoon } from "./ComingSoon";

export type FollowState = "locked" | "soon" | "off" | "on";

export function FollowButton({ kind, target, state: initial, trialHref, label = "Follow" }: { kind: "trader" | "market"; target: string; state: FollowState; trialHref: string; label?: string }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (state === "soon") return <ComingSoon feature="follows" className="btn btn--secondary">{label}</ComingSoon>;
  if (state === "locked") {
    return (
      <a className="btn btn--secondary follow--locked" href={trialHref} data-unlock="follow" aria-label={`${label}: for members. Try it for $1`}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        {label}
      </a>
    );
  }
  async function toggle() {
    setBusy(true); setErr(null);
    const on = state === "on";
    const res = await fetch("/api/follows", { method: on ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, target }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (res?.ok) setState(on ? "off" : "on"); else setErr(body?.error ?? "Couldn't do that just now. Try again.");
    setBusy(false);
  }
  return (
    <>
      <button type="button" className={`btn ${state === "on" ? "btn--secondary follow--on" : "btn--secondary"}`} aria-pressed={state === "on"} disabled={busy} onClick={() => void toggle()}>
        {state === "on" ? "Following" : label}
      </button>
      {err ? <span className="follow__err" role="alert">{err}</span> : null}
    </>
  );
}
