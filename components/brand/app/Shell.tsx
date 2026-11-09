/* The members' shell: the homepage's own nav (components/brand/Nav.tsx, member mode) over the black stage. No sidebar. */
import type { ReactNode } from "react";
import { StageMotion } from "../StageMotion";
import { BrandFoot, BrandNav } from "../Nav";
import { ViewAs } from "@/components/ViewAs";
import { electionDay } from "@/lib/brand/pulse";
import { isReady } from "@/lib/features";

export type Tab = "autopilot" | "book" | "today" | "home" | "election" | "board" | "wallets" | "markets" | "following" | "copies" | "library" | "account";
export const SEARCH_HREF = "/?search=1";

export function Shell({ children }: { current?: Tab; children: ReactNode }) {
  return (
    <>
    <ViewAs />
    <main className="b-root b-app" data-testid="app-shell">
      <BrandNav fixed member election={electionDay(Date.now())} autopilot={isReady("autopilot")} />
      <div className="b-main">{children}<BrandFoot inline /></div>
      <StageMotion />
    </main>
    </>
  );
}
