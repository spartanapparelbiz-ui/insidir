"use client";
/* The first session, shown once: three steps, skippable at every one.
 *   1. Pick the categories you trade.  2. Turn on alerts (with the iPhone "Add to Home Screen" steps when needed).
 *   3. See today's deals.
 * POST /api/onboarding marks the member onboarded whether they finish or skip (it is never shown again), saving the
 * categories they picked so far. Focus moves to each step's heading; Escape skips. */
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/app/api/settings/validate";
import { OPEN_TERMINAL, UNLOCK } from "@/lib/copy";
import { IosInstallGuide } from "./IosInstallGuide";
import { PushButton } from "./PushButton";

export function Onboarding({ paid, vapidKey, unlockHref, initial }: {
  paid: boolean; vapidKey: string; email?: string | null; unlockHref: string;
  /** Older callers pass more; only the categories are used. */
  initial: { categories: string[] } & Record<string, unknown>;
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState<string[]>(initial.categories);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const changed = cats.join() !== initial.categories.join();

  useEffect(() => { box.current?.querySelector<HTMLElement>("h2")?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void finish(true); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const finish = async (skipped: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skipped, categories: cats }) });
      if (!res.ok) { setError("Couldn't save that. Check your connection and try again."); setBusy(false); return; }
    } catch { setError("Couldn't save that. Check your connection and try again."); setBusy(false); return; }
    setOpen(false);
    if (changed) window.location.reload();
  };
  if (!open) return null;

  const toggle = (c: string) => setCats(x => (x.includes(c) ? x.filter(y => y !== c) : [...x, c]));
  const titles = ["What do you trade?", "Turn on alerts", "You're set"];
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ob-h">
      <div className="sheet" ref={box}>
        <div className="sheet__top">
          <span className="muted small">Step {step + 1} of 3</span>
          {step < 2 ? <button type="button" className="btn btn--ghost" onClick={() => void finish(true)} disabled={busy}>Skip</button> : null}
        </div>
        <h2 id="ob-h" className="sheet__h" tabIndex={-1}>{titles[step]}</h2>

        {step === 0 ? (
          <>
            <p className="muted small">Pick the categories you want in your feed. Leave them all off to see every category.</p>
            <div className="chips">
              {CATEGORIES.map(c => (
                <label key={c} className={`chip${cats.includes(c) ? " chip--on" : ""}`}>
                  <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(c)} />{CATEGORY_LABEL[c]}
                </label>
              ))}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          paid ? (
            <>
              <p className="muted small">Get a push the moment a deal shows up. You can change what sends one on the Alerts page.</p>
              <IosInstallGuide inline />
              <PushButton vapidKey={vapidKey} />
            </>
          ) : (
            <p className="muted small">Alerts come with Insidir. <a href={unlockHref} data-unlock="onboarding">{UNLOCK}</a></p>
          )
        ) : null}

        {step === 2 ? <p className="muted small">The Terminal shows every deal as the scanner finds it. Tap one to see both prices, the fees and both rule texts.</p> : null}

        {error ? <p className="err small" role="alert">{error}</p> : null}
        <div className="sheet__nav">
          {step > 0 ? <button type="button" className="btn btn--secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button> : <span />}
          {step < 2
            ? <button type="button" className="btn btn--primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className={`btn btn--primary uibtn${busy ? " uibtn--busy" : ""}`} onClick={() => void finish(false)} disabled={busy} aria-busy={busy}>
                <span className="uibtn__label">{OPEN_TERMINAL}</span>{busy ? <span className="uibtn__spin" aria-hidden="true" /> : null}
              </button>}
        </div>
      </div>
    </div>
  );
}
