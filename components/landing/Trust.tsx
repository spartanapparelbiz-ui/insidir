/* Trust, in plain words, each claim one we can stand behind in the code:
 *   TrustRow (under the hero): we never touch your money (Insidir only shows math; no deposits, no trading, no
 *   exchange keys); every deal we flag goes in Receipts (each new deal gets a receipt row, wins and misses, see
 *   lib/worker/store.ts); cancel anytime (Settings → Manage subscription, Whop's orders page);
 *   payments by Whop. Under it, the real scale line from the markets the scanner saw in the last few minutes
 *   (lib/scale.ts), hidden while the scanner is paused.
 *   MoneySection: subscriptions are the only income. Venue links carry no referral or affiliate tags
 *   (test/trust.test.ts fails if one appears). If that ever changes, this section must change and say so. */
import Link from "next/link";
import { scaleText, type Scale } from "@/lib/scale";

const ICON: Record<string, string> = {
  money: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 7l3-3h12l3 3",
  ledger: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  cancel: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6",
  lock: "M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3",
};
function Icon({ name }: { name: string }) {
  return (
    <svg className="trust__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICON[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The four claims; `link` turns the end of the line into a link to its proof. */
export const TRUST: ReadonlyArray<{ icon: string; text: string; link?: { href: string; label: string } }> = [
  { icon: "money", text: "We never touch your money" },
  { icon: "ledger", text: "Every deal we flag goes in", link: { href: "/receipts", label: "Receipts" } },
  { icon: "cancel", text: "Cancel anytime" },
  { icon: "lock", text: "Secure checkout" },
];

export function TrustRow({ scale }: { scale: Scale | null }) {
  return (
    <section className="trust" aria-label="Why you can trust Insidir">
      <ul className="trust__row">
        {TRUST.map(t => <li key={t.icon} className="trust__item"><Icon name={t.icon} /><span>{t.text}{t.link ? <> <Link href={t.link.href}>{t.link.label}</Link></> : null}</span></li>)}
      </ul>
      {scale ? (
        <p className="trust__scale" data-testid="scale-line"><span className="trust__dot" aria-hidden="true" />{scaleText(scale)}.</p>
      ) : null}
    </section>
  );
}

export const MONEY_LINE = "Only from subscriptions. We don't take a cut of your trades, and the apps don't pay us.";

export function MoneySection() {
  return (
    <section className="sec lp-money" data-section="money" aria-labelledby="money-h">
      <h2 id="money-h" className="sec__h">How Insidir makes money</h2>
      <p className="lp-money__line">{MONEY_LINE}</p>
      <p className="sec__p">The links to Kalshi and Polymarket are plain links, with no referral codes. We don&apos;t hold your money, place trades or sell your data. <Link href="/about">More about us</Link>.</p>
    </section>
  );
}
