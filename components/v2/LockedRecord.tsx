/* A trader's record for someone without a plan: the labels, grey bars where the numbers go, and "members only".
 * No digits at all, real or placeholder: the numbers never leave the server for them. */
export function LockedRecord({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lockrec${compact ? " lockrec--compact" : ""}`} data-testid="locked-record">
      <p className="lockrec__labels">Win rate · All-time net P&L <span className="lockrec__tag">members only</span></p>
      <span className="lockrec__bars" aria-hidden="true"><span className="lockrec__bar" /><span className="lockrec__bar lockrec__bar--b" /></span>
    </div>
  );
}
