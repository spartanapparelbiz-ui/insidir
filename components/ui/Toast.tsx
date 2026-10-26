"use client";
/* One toast at a time, in plain words: "Saved", "Alerts on", "Copied". Auto-hides after 3 seconds; announced to
 * screen readers (role="status"); errors stay until dismissed and use role="alert". Mounted once in app/layout.tsx;
 * any client component calls useToast(). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
interface Toast { id: number; text: string; kind: Kind }
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => undefined);

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const n = useRef(0);
  const show = useCallback((text: string, kind: Kind = "ok") => setToast({ id: ++n.current, text, kind }), []);
  useEffect(() => {
    if (!toast || toast.kind === "error") return;
    const t = window.setTimeout(() => setToast(x => (x?.id === toast.id ? null : x)), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="uitoast-host" aria-live="polite">
        {toast ? (
          <div key={toast.id} className={`uitoast${toast.kind === "error" ? " uitoast--err" : ""}`} role={toast.kind === "error" ? "alert" : "status"}>
            <span>{toast.text}</span>
            <button type="button" className="uitoast__x" onClick={() => setToast(null)} aria-label="Dismiss">Dismiss</button>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
