/* The delayed-data notice, above every live table a visitor sees (the board, the tape, a market's bets): the data is
 * BOARD_DELAY_MS late, and one button opens the $1 checkout (Whop, /go?step=checkout). Real numbers only: the delay is
 * the one the server applies, and the price is lib/plans.ts's. Safe in server and client components. */
import { BOARD_DELAY_MIN } from "@/lib/millionaires/pulse-shape";
import { PLANS, TRIAL } from "@/lib/plans";

export function DelayNotice({ where = "board" }: { where?: string }) {
  return (
    <div className="b-delaynote" role="note" data-testid="delay-notice">
      <p><span aria-hidden="true">⚠️ </span>You are viewing {BOARD_DELAY_MIN}-minute delayed data. Upgrade to Pro (${PLANS.insidir.price}/mo, ${TRIAL.fee} for your first {TRIAL.days} days) for the live feed and instant push alerts.</p>
      <a className="b-btn b-panel-pill b-delaynote__go" href="/go?step=checkout" data-checkout={`delay-${where}`} data-unlock={`delay-${where}`} data-testid="delay-upgrade">Go live for ${TRIAL.fee}</a>
    </div>
  );
}
