/* A brand page's frame: members get the app shell (sidebar, pill bar), visitors the nav over black stages. */
import { electionDay } from "@/lib/brand/pulse";
import type { ReactNode } from "react";
import { BrandFoot, BrandNav } from "../Nav";
import { StageMotion } from "../StageMotion";
import { Shell } from "./Shell";
import { ViewAs } from "@/components/ViewAs";

export function Frame({ member, current, children, testid }: { member: boolean; current: "home" | "election" | "board" | "markets" | "following" | "copies" | "library" | "account"; children: ReactNode; testid: string }) {
  if (member) return <Shell current={current}><div data-testid={testid}>{children}</div></Shell>;
  return <><ViewAs /><main className="b-root" data-testid={testid}><BrandNav fixed election={electionDay(Date.now())} />{children}<BrandFoot inline /><StageMotion /></main></>;
}
