/* A brand page's frame: members get the app shell (sidebar, pill bar), visitors the nav over black stages. On these
 * pages (b-root--page, app/brand.css) every stage is as tall as its content and only the first carries a photo. */
import { electionDay } from "@/lib/brand/pulse";
import type { ReactNode } from "react";
import { BrandFoot, BrandNav } from "../Nav";
import { StageMotion } from "../StageMotion";
import { Shell, type Tab } from "./Shell";
import { ViewAs } from "@/components/ViewAs";

export function Frame({ member, current, children, testid }: { member: boolean; current: Tab; children: ReactNode; testid: string }) {
  if (member) return <Shell current={current}><div data-testid={testid}>{children}</div></Shell>;
  return <><ViewAs /><main className="b-root b-root--page" data-testid={testid}><BrandNav fixed election={electionDay(Date.now())} />{children}<BrandFoot inline /><StageMotion /></main></>;
}
