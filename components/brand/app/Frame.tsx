/* A brand page's frame: members get the app shell (sidebar, pill bar), visitors the nav over black stages. */
import type { ReactNode } from "react";
import { BrandFoot, BrandNav } from "../Nav";
import { StageMotion } from "../StageMotion";
import { Shell } from "./Shell";

export function Frame({ member, current, children, testid }: { member: boolean; current: "home" | "board" | "markets" | "following" | "library" | "account"; children: ReactNode; testid: string }) {
  if (member) return <Shell current={current}><div data-testid={testid}>{children}</div></Shell>;
  return <main className="b-root" data-testid={testid}><BrandNav fixed />{children}<BrandFoot inline /><StageMotion /></main>;
}
