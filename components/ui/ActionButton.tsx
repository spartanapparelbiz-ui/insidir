"use client";
/* A button that always says what's happening: pressed (CSS :active), then a spinner inside the button while the
 * action runs, then the result: a toast in plain words ("Saved", "Alerts on") and, on failure, an error that says
 * what happened and what to do. The label never changes width-jumps: the spinner sits inside the same box. */
import { useState, type ReactNode } from "react";
import { useToast } from "./Toast";

export interface ActionResult { ok: boolean; message: string }

export function ActionButton({ children, action, variant = "secondary", className = "", disabled = false, ...rest }: {
  children: ReactNode;
  /** Runs the action; resolves to what to tell the user. Throwing counts as a failure with a generic retry line. */
  action: () => Promise<ActionResult>;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await action();
      toast(r.message, r.ok ? "ok" : "error");
    } catch {
      toast("Couldn't reach Insidir. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`btn btn--${variant} uibtn${busy ? " uibtn--busy" : ""} ${className}`} onClick={() => void run()}
      disabled={disabled || busy} aria-busy={busy} data-testid={rest["data-testid"]}>
      <span className="uibtn__label">{children}</span>
      {busy ? <span className="uibtn__spin" aria-hidden="true" /> : null}
    </button>
  );
}

/** POST JSON and read `{ ok, message }` back; HTTP errors turn into the server's message or a plain retry line. */
export async function postJson(url: string, body: unknown, okMessage: string): Promise<ActionResult> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) return { ok: false, message: data?.error ?? `That didn't work (error ${res.status}). Try again in a moment.` };
  return { ok: true, message: data?.message ?? okMessage };
}
