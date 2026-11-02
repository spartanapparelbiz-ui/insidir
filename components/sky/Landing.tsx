/* What the home page and the Read page share: the FAQ (also the page's FAQPage data) and a Read's source chips
 * ("Polymarket · 12 positions · Updated 2m ago"). The landing itself is components/open/Landing.tsx. */
import { ADVICE, TRIAL_LINE } from "@/lib/copy";
import type { Featured } from "@/lib/nx/featured";
import { PLANS, TRIAL } from "@/lib/plans";
import { ago } from "@/lib/sky/sky-pure";

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What is insidir?", a: "Paste any Polymarket or Kalshi market, or ask about one in plain words. In a few seconds you get a Read: where proven money sits on each side, the big bets of the last 24 hours, the best price on each venue, and one line on what the data shows." },
  { q: "What counts as proven money?", a: "Open positions from trackers with 30 or more settled positions and a positive all-time return, and from Polymarket wallets whose public record shows 30 or more closed markets and positive all-time profit. Losses count." },
  { q: "Where do the numbers come from?", a: "Polymarket's and Kalshi's public data. Every trade, position and price shown is read from them. Wallets appear by short address only; insidir never says who is behind one." },
  { q: "Does insidir place bets or hold my money?", a: "No. insidir only reads markets. When you want to act, Open takes you to Kalshi (in the US) or to the venue with the better price, and you bet there yourself." },
  { q: "What does it cost?", a: `${TRIAL_LINE}, then $${PLANS.insidir.price}/month, billed by Whop. Cancel anytime from your account; cancel inside the first ${TRIAL.days} days and $${TRIAL.fee} is all you pay.` },
  { q: "Is this advice?", a: `${ADVICE} A Read describes what the data shows. It never says what to bet, and past results don't promise future ones.` },
];

export function Sources({ f, now }: { f: Pick<Featured, "data" | "positions" | "at">; now: number }) {
  return (
    <p className="sk-chips skl-sources" data-testid="answer-sources">
      {f.data.polymarket ? <span className="sk-chip">Polymarket</span> : null}
      {f.data.kalshi ? <span className="sk-chip">Kalshi</span> : null}
      {f.positions ? <span className="sk-chip">{f.positions.toLocaleString("en-US")} {f.positions === 1 ? "position" : "positions"}</span> : null}
      <span className="sk-chip">Updated {ago(f.at, now)}</span>
    </p>
  );
}
