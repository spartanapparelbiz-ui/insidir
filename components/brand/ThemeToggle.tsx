"use client";
/* Light / dark. The choice is kept on this device (localStorage "insidir_theme"); with none, the site follows the
 * system setting. app/layout.tsx sets html[data-theme] before the first paint, so there is never a flash. */
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
import { THEME_KEY as KEY } from "@/lib/brand/theme";

export function ThemeToggle() {
  const [t, setT] = useState<Theme | null>(null);
  useEffect(() => { setT(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);
  const flip = () => {
    const next: Theme = t === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: this visit only */ }
    setT(next);
  };
  const label = t === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button type="button" className="b-theme" onClick={flip} aria-label={label} title={label} data-testid="theme-toggle">
      {t === "light"
        ? <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M13.6 10.1A6 6 0 0 1 5.9 2.4a6 6 0 1 0 7.7 7.7Z" /></svg>
        : <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" /></svg>}
    </button>
  );
}
