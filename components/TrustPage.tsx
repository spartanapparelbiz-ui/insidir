/* The shell of every text page (About, Methodology, Our data, Status, Security, Disclosures, Terms, Privacy, Credits,
 * Changelog, Help, FAQ), in the homepage's system: the brand nav (members: their app shell), a black stage with the
 * title, an optional dated line ("Last updated October 31, 2026") and lead, the article on a glass panel, and Start for
 * $1 as the page's one primary button for visitors. Server component. */
import type { ReactNode } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { Lines, Panel, Pill, Stage } from "@/components/system";
import { Crumbs } from "@/components/system/Entity";
import { getViewer } from "@/lib/auth/viewer";
import { slotPhoto } from "@/lib/brand/images";
import { isPaid, TRIAL } from "@/lib/plans";
import { TRIAL_LINE } from "@/lib/copy";

export async function TrustPage({ path, title, updated, lead, children, cta = true }: {
  path: string; title: string; updated?: string; lead?: ReactNode; children: ReactNode; cta?: boolean;
}) {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  return (
    <Frame member={member} current="account" testid="text-page">
      <Stage bg={{ kind: "photo", photo: slotPhoto("space"), dark: 0.7, priority: true }} first testid="text-hero" labelledBy="t-h">
        <div className="b-head">
          <Crumbs trail={[["Insidir", "/"], [title, path]]} />
          <Lines as="h1" id="t-h" lines={[title]} size={title.length > 24 ? 48 : 64} />
          {updated ? <p className="b-small" data-m="lift">Last updated {updated}</p> : null}
          {lead ? <p className="b-sub" data-m="lift">{lead}</p> : null}
        </div>
        <Panel className="s-col s-col--wide s-prose" testid="text-body"><article>{children}</article></Panel>
        {cta && !member ? (
          <div className="b-center">
            <div className="b-ctas"><Pill href="/go" data-checkout="text" data-testid="text-start">Start for ${TRIAL.fee}</Pill></div>
            <p className="b-small">{TRIAL_LINE}, then $39 a month. Cancel anytime. Secure checkout.</p>
          </div>
        ) : null}
      </Stage>
    </Frame>
  );
}
