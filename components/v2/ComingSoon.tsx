"use client";
/* The Coming soon rule (docs/INSIDIR-V2.md §2): an item that isn't live is visible but can't be used. It shows one badge
 * style everywhere (violet tint pill, "Coming soon"), and tapping it opens a small sheet: "Coming soon. Want a
 * heads-up when it's live?" with an email field saved to the waitlist for that feature. */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { Feature } from "@/lib/features";

export function SoonBadge() {
  return <span className="soon">Coming soon</span>;
}

export function ComingSoon({ feature, children, className = "" }: { feature: Feature; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`soonitem ${className}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="soonitem__label">{children}</span> <SoonBadge />
      </button>
      {open ? <SoonSheet feature={feature} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The waitlist form: "Want a heads-up when it's live?" with an email field. */
export function SoonForm({ feature, autoFocus = false }: { feature: Feature; autoFocus?: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; text?: string }>({ kind: "idle" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "busy" });
    const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, feature }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string; error?: string } | null;
    setState(res?.ok ? { kind: "done", text: body?.message ?? "Thanks. We'll email you when it's live." } : { kind: "error", text: body?.error ?? "Couldn't save that just now. Try again in a minute." });
  }
  if (state.kind === "done") return <p className="sheet__p" role="status">{state.text}</p>;
  return (
    <form className="sheet__form" onSubmit={submit}>
      <label className="sheet__p" htmlFor={`${id}-e`}>Want a heads-up when it&apos;s live?</label>
      <input id={`${id}-e`} className="input" type="email" required autoComplete="email" autoFocus={autoFocus} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      {state.kind === "error" ? <p className="sheet__err" role="alert">{state.text}</p> : null}
      <button className="btn btn--primary btn--block" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Saving…" : "Tell me when it's live"}</button>
    </form>
  );
}

export function SoonSheet({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const id = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id} className="sheet__h">Coming soon.</h2>
        <SoonForm feature={feature} autoFocus />
        <button type="button" className="btn btn--secondary btn--block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
