"use client";
/* Every lock on the site opens the same sheet (the funnel: the public preview → hit a lock → Get Insidir): what you get
 * (the Insidir plan's ready features), "Try 7 days for $1" and "Then $39/mo, cancel anytime.", and one button to the
 * checkout. Locks sit where curiosity peaks: a trader's record, Follow, live (vs. 30 minutes late), alerts.
 * Opening one is recorded as lock_view with where it was; the button carries data-unlock, so components/landing/
 * Beacons records unlock_click and checkout_start. */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { beacon } from "@/components/app/beacon";
import { Photo } from "@/components/Photo";
import { SPOT } from "@/lib/photos";
import { CANCEL_LINE, GET_CTA } from "@/lib/copy";

interface LockApi { open: (where: string) => void }
const Ctx = createContext<LockApi>({ open: () => undefined });

export function LockProvider({ unlocks, trialHref, children }: { unlocks: string[]; trialHref: string; children: ReactNode }) {
  const [where, setWhere] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((w: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    setWhere(w);
    beacon("lock_view", w);
  }, []);
  const close = useCallback(() => { setWhere(null); opener.current?.focus?.(); }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {where ? <LockSheet where={where} unlocks={unlocks} trialHref={trialHref} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

const HEADINGS: Record<string, string> = {
  live: "See every position the second it happens.",
  record: "See who wins, and how often.",
  follow: "Follow the traders who win.",
  alerts: "Alerts on their new positions.",
};

function LockSheet({ where, unlocks, trialHref, onClose }: { where: string; unlocks: string[]; trialHref: string; onClose: () => void }) {
  const id = useId();
  const btn = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const kind = Object.keys(HEADINGS).find(k => where.startsWith(k)) ?? "live";
  return (
    <div className="sheet" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet__panel lock" role="dialog" aria-modal="true" aria-labelledby={id} data-lock={where}>
        <Photo n={SPOT.lock} className="sheet__photo" wideOnly />
        <h2 id={id} className="sheet__h">{HEADINGS[kind]}</h2>
        <ul className="lock__list">{unlocks.map(u => <li key={u}>{u}</li>)}</ul>
        <a ref={btn} className="btn btn--primary btn--big btn--block" href={trialHref} data-unlock={where}>{GET_CTA}</a>
        <p className="lock__price">{CANCEL_LINE}</p>
        <button type="button" className="lock__close" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}

const LockIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;

/** A locked control: looks like what it unlocks, opens the lock sheet. */
export function LockButton({ where, className = "btn btn--secondary", children, label }: { where: string; className?: string; children: ReactNode; label?: string }) {
  const { open } = useContext(Ctx);
  return (
    <button type="button" className={`${className} lockbtn`} aria-haspopup="dialog" aria-label={label} onClick={() => open(where)}>
      <LockIcon />{children}
    </button>
  );
}
