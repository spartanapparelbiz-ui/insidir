"use client";
/* The function-key bar: F1 BOARD · F2 WALLETS · F3 MARKETS · F4 BRIEFING · F5 WATCH MY BET · F6 DAILY BRIEF ·
 * F7 RESULTS · F8 ASK. The current page's key is filled Custodious Blue. Keys 1–8 open them when no field has focus
 * (the real F-keys are left alone: F5 is refresh). A horizontal scroll row on phones. */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const FKEYS: ReadonlyArray<readonly [string, string, string]> = [
  ["F1", "BOARD", "/board"], ["F2", "WALLETS", "/wallets"], ["F3", "MARKETS", "/markets"], ["F4", "BRIEFING", "/briefing"],
  ["F5", "WATCH MY BET", "/watch"], ["F6", "DAILY BRIEF", "/brief"], ["F7", "RESULTS", "/results"], ["F8", "ASK", "/ask"],
];

/** The key for a path: exact, or the section it's under ("/wallet/0x…" is WALLETS, "/market/x" MARKETS). Pure. */
export function activeKey(path: string): string | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/wallet" || p.startsWith("/wallet/")) return "/wallets";
  if (p.startsWith("/market/")) return "/markets";
  return FKEYS.find(([, , h]) => p === h || p.startsWith(`${h}/`))?.[2] ?? null;
}

const typing = (el: Element | null) => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

export function FKeys() {
  const path = usePathname() ?? "/";
  const on = activeKey(path);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= FKEYS.length) { e.preventDefault(); window.location.assign(FKEYS[n - 1]![2]); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <nav className="t-fkeys" aria-label="Function keys" data-testid="t-fkeys">
      {FKEYS.map(([k, label, href], i) => (
        <a key={k} href={href} className="t-fkey" aria-current={on === href ? "page" : undefined} aria-keyshortcuts={String(i + 1)} title={`${label} (key ${i + 1})`}>
          <span className="t-fkey__k">{k}</span><span className="t-fkey__l">{label}</span>
        </a>
      ))}
    </nav>
  );
}
