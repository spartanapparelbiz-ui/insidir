"use client";
/* Follow / Following on a trader, market, insider, company or fund (lib/follows.ts). Free viewers see it locked (lock icon); tapping opens the lock sheet; when following
 * isn't ready on production it is the Coming soon item instead. */
import { useState } from "react";
import { LockButton } from "@/components/lock/Lock";
import type { FollowKind } from "@/lib/db/schema";
import { ComingSoon } from "./ComingSoon";

export type FollowState = "locked" | "soon" | "off" | "on";

export function FollowButton({ kind, target, state: initial, trialHref, label = "Follow" }: { kind: FollowKind; target: string; state: FollowState; trialHref: string; label?: string }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (state === "soon") return <ComingSoon feature="follows" className="btn btn--secondary">{label}</ComingSoon>;
  if (state === "locked") {
    return <LockButton where="follow" className="btn btn--secondary follow--locked" label={`${label}: for members`}>{label}</LockButton>;
  }
  async function toggle() {
    setBusy(true); setErr(null);
    const on = state === "on";
    const res = await fetch("/api/follows", { method: on ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, target }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (res?.ok) setState(on ? "off" : "on"); else setErr(body?.error ?? "Couldn't do that now. Try again.");
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
