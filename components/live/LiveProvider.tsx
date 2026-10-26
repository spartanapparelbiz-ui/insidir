"use client";
/* One live stream per page, shared by every live element on it (hero, counters, tape, toasts). */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLive, type Live } from "./useLive";

const Ctx = createContext<Live | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const live = useLive();
  return <Ctx.Provider value={live}>{children}</Ctx.Provider>;
}

export function useLiveContext(): Live {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiveContext needs <LiveProvider>");
  return v;
}

/** The server's clock, ticking every second (so every "Xs ago" on the page counts up for real). */
export function useServerNow(initial: number): number {
  const live = useContext(Ctx);
  const skew = live?.skewMs ?? 0;
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now() + skew);
    const t = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(t);
  }, [skew]);
  return now;
}
