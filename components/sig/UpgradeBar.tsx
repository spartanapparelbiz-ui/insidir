"use client";
/* The upgrade bar (docs/BRIEF.md §4.12): one bar for free viewers with the single most relevant line and "Try it for
 * $1". Dismissible for the session (sessionStorage; if storage is blocked it just stays). */
import { useEffect, useState, type ReactNode } from "react";

const KEY = "insidir_upgrade_bar_hidden";

export function UpgradeBar({ line, href, cta = "Try it for $1", where }: { line: ReactNode; href: string; cta?: string; where: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { if (sessionStorage.getItem(KEY)) setHidden(true); } catch { /* storage blocked */ } }, []);
  if (hidden) return null;
  return (
    <div className="upbar" role="region" aria-label="Upgrade">
      <p className="upbar__line">{line}</p>
      <a className="btn btn--primary upbar__cta" href={href} data-unlock={where}>{cta}</a>
      <button type="button" className="upbar__x" aria-label="Hide for now" onClick={() => { setHidden(true); try { sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } }}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
