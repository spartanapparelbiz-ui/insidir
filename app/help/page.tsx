/* Help (/help): how to reach a person (they answer within 24 hours), the quick fixes people ask for most, then every
 * question (lib/brand/copy.ts FAQ_ALL, the same list as /faq). */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { Faq } from "@/components/brand/Faq";
import { FAQ_ALL } from "@/lib/brand/copy";
import { COMPANY } from "@/lib/copy";

export const metadata: Metadata = { title: "Help", description: "Reach a person at Insidir, fix the common things yourself, and every question answered." };

export default function HelpPage() {
  return (
    <TrustPage path="/help" title="Help" lead="Write to us and a person answers within 24 hours.">
      <h2>Contact</h2>
      <p><a href={`mailto:${COMPANY.email}`} data-testid="help-email">{COMPANY.email}</a>. Tell us what you were doing and what you saw; a screenshot helps. {COMPANY.name}, {COMPANY.place}.</p>

      <h2>Do it yourself</h2>
      <ul>
        <li><strong>Cancel or change your card</strong>: <Link href="/settings#billing">Settings → Billing</Link>: cancel there in one step, or change your card.</li>
        <li><strong>Can&apos;t sign in</strong>: sign in with the same email you paid with, on <Link href="/login">Sign in</Link>.</li>
        <li><strong>Turn signals on or off</strong>: <Link href="/settings">Settings</Link>.</li>
        <li><strong>Delete your account</strong>: <Link href="/settings#delete">Settings → Delete account</Link>.</li>
        <li><strong>A number looks wrong</strong>: every card links its source. Compare <Link href="/status">Status</Link>, then tell us.</li>
        <li><strong>Report a security issue</strong>: see <Link href="/security">Security</Link>.</li>
      </ul>

      <h2>Questions</h2>
      <Faq items={FAQ_ALL} />
    </TrustPage>
  );
}
