/* Disclosures (/disclosures): not advice; not a broker, exchange, sportsbook or adviser; no affiliation; past
 * results; eligibility for prediction markets and sports depends on where you live; problem gambling. */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY, DATA_COMPANY, GAMBLER, PAST } from "@/lib/copy";

export const metadata: Metadata = { title: "Disclosures", description: "Insidir is a data company: not advice, not a broker, exchange, sportsbook or investment adviser, and not affiliated with Polymarket, Kalshi or the SEC." };

export default function DisclosuresPage() {
  return (
    <TrustPage path="/disclosures" title="Disclosures" updated="October 31, 2026" lead={DATA_COMPANY}>
      <h2>Not advice</h2>
      <p>Insidir shows what happened: who put money on what, at what price, and how it ended. Nothing on Insidir is a recommendation to buy, sell or bet on anything, and nothing here is personalised to you. Decide for yourself, and only with money you can afford to lose.</p>

      <h2>What Insidir is not</h2>
      <ul>
        <li>Not a broker, exchange, sportsbook or investment adviser. We don&apos;t hold your money, place trades or bets for you, or take a cut of anything you do elsewhere.</li>
        <li>Not affiliated with, endorsed by or sponsored by Polymarket, Kalshi, the SEC or any league, team or company shown. Their names and logos identify them; they belong to their owners.</li>
      </ul>

      <h2>Past results</h2>
      <p>{PAST} Every performance figure on Insidir is computed from settled positions by the rules on <Link href="/methodology">Methodology</Link>, losses included. Followable returns assume you followed at the price Insidir showed plus one point; real fills can be worse. A tracker that made money before can lose money next.</p>

      <h2>Where you live matters</h2>
      <p>Whether you can use a prediction market or a sportsbook depends on where you live and your age. Polymarket and Kalshi each decide who can use them. If you tell us you&apos;re in the US, we only link to apps that work in the US. Check the rules where you are before you use any of them.</p>

      <h2>Problem gambling</h2>
      <p className="lp-about__lead">{GAMBLER}</p>
      <p>Free, confidential help is available 24 hours a day. Outside the US, look for your country&apos;s problem-gambling helpline.</p>

      <h2>Who we are</h2>
      <p>Insidir is built by {COMPANY.name}, {COMPANY.place}. Questions: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</p>
    </TrustPage>
  );
}
