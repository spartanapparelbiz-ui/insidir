/* The only way in: "Continue", to Whop's sign-in (Google, Apple or email), with the line that says so under it.
 * A plain link (no JS needed): app/login/start does the rest. */
export function ContinueButton({ next, fresh = false }: { next: string; fresh?: boolean }) {
  const q = new URLSearchParams({ next, ...(fresh ? { fresh: "1" } : {}) });
  return (
    <div className="continue">
      <a className="btn btn--primary btn--big btn--block" href={`/login/start?${q}`} data-testid="continue">Continue</a>
      <p className="continue__by">Secure sign-in and payments by Whop.</p>
    </div>
  );
}
