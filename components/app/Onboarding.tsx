"use client";
/* First session, signed-in members only: three skippable steps (categories, size filters, alerts), saved with
 * POST /api/onboarding. No bankroll: size filters are plain numbers the user types. */
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/app/api/settings/validate";
import { PushButton } from "./PushButton";

export function Onboarding({ paid, vapidKey, email, unlockHref, initial }: {
  paid: boolean; vapidKey: string; email: string | null; unlockHref: string;
  initial: { categories: string[]; minRoiPct: number; minSizeUsd: number; emailDigest: boolean; alertEmail: boolean };
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState<string[]>(initial.categories);
  const [minRoi, setMinRoi] = useState(String(initial.minRoiPct));
  const [minSize, setMinSize] = useState(String(initial.minSizeUsd));
  const [digest, setDigest] = useState(initial.emailDigest);
  const [alertEmail, setAlertEmail] = useState(initial.alertEmail);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { box.current?.querySelector<HTMLElement>("h2")?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void finish(true); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const finish = async (skipped: boolean) => {
    setBusy(true); setError(null);
    const body = skipped ? { skipped: true } : { categories: cats, minRoiPct: minRoi || "0", minSizeUsd: minSize || "0", emailDigest: digest, ...(paid ? { alertEmail } : {}) };
    try {
      const res = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const errs = typeof j === "object" && j !== null && Array.isArray((j as { errors?: unknown }).errors) ? (j as { errors: string[] }).errors : null;
        setError(errs?.join(" ") ?? "Couldn't save. Try again."); setBusy(false);
        if (errs) setStep(1);
        return;
      }
    } catch { setError("Couldn't save. Try again."); setBusy(false); return; }
    setOpen(false);
    if (!skipped) window.location.reload();
  };
  if (!open) return null;

  const toggle = (c: string) => setCats(x => (x.includes(c) ? x.filter(y => y !== c) : [...x, c]));
  const titles = ["What do you trade?", "Set your size filters", "Turn on alerts"];
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ob-h">
      <div className="sheet" ref={box}>
        <div className="sheet__top">
          <span className="dim small">Step {step + 1} of 3</span>
          <button type="button" className="btn btn--ghost" onClick={() => void finish(true)} disabled={busy}>Skip</button>
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
          <>
            <p className="muted small">Hide deals below these numbers. You can change them any time in Settings.</p>
            <div className="field"><label htmlFor="ob-roi">Min ROI (%)</label>
              <input id="ob-roi" className="input" inputMode="decimal" value={minRoi} onChange={e => setMinRoi(e.target.value)} /></div>
            <div className="field"><label htmlFor="ob-size">Min size ($)</label>
              <input id="ob-size" className="input" inputMode="decimal" value={minSize} onChange={e => setMinSize(e.target.value)} /></div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {paid ? <PushButton vapidKey={vapidKey} /> : (
              <p className="muted small">Push alerts come with Insidir. <a href={unlockHref} data-unlock="onboarding">Unlock</a></p>
            )}
            <label className="check"><input type="checkbox" checked={digest} onChange={e => setDigest(e.target.checked)} />Email me a daily summary</label>
            {paid ? <label className="check"><input type="checkbox" checked={alertEmail} onChange={e => setAlertEmail(e.target.checked)} />Email me alerts when push isn&apos;t on</label> : null}
            <p className="dim small">{email ? <>Emails go to <span className="muted">{email}</span> (from your Whop account).</> : "Your Whop account has no email, so email alerts can't be sent."}</p>
          </>
        ) : null}

        {error ? <p className="err small" role="alert">{error}</p> : null}
        <div className="sheet__nav">
          {step > 0 ? <button type="button" className="btn btn--secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button> : <span />}
          {step < 2
            ? <button type="button" className="btn btn--primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className="btn btn--primary" onClick={() => void finish(false)} disabled={busy}>{busy ? "Saving…" : "Done"}</button>}
        </div>
      </div>
    </div>
  );
}
