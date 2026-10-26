/* A route that exists but isn't ready yet (docs/V2.md §2): the page says so and offers the waitlist, never an empty
 * or half-working page. */
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import type { Feature } from "@/lib/features";
import type { Plan } from "@/lib/types";
import { ComingSoon, SoonBadge } from "./ComingSoon";

export function ComingSoonPage({ feature, title, text, signedIn, plan, visual }: { feature: Feature; title: string; text: string; signedIn: boolean; plan: Plan; visual?: ReactNode }) {
  return (
    <>
      <SiteHeader signedIn={signedIn} plan={plan} />
      <main className="wrap soonpage">
        <p><SoonBadge /></p>
        <h1 className="soonpage__h">{title}</h1>
        <p className="soonpage__p">{text}</p>
        <ComingSoon feature={feature} className="btn btn--primary">Get a heads-up when it&apos;s live</ComingSoon>
        {visual ? <div className="soonpage__visual" aria-hidden="true">{visual}</div> : null}
      </main>
    </>
  );
}
