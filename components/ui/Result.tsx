/* A result, plain text on the right: the amount in green or red (600), the status in grey 12px under it ("Won",
 * "Lost", "Open", "Purchase", "New"). No pill, no background. Colour only for gains and losses. In a column of figures
 * (`dash`), a missing amount is a grey "—" so every row keeps the same two lines. */
export function Result({ amount, tone = "none", status, className, dash = false }: { amount?: string | null; tone?: "won" | "lost" | "none"; status: string; className?: string; dash?: boolean }) {
  return (
    <span className={`res${className ? ` ${className}` : ""}`}>
      {amount ? <span className={`res__amt res__amt--${tone}`}>{amount}</span> : dash ? <span className="res__amt res__amt--nil" aria-hidden="true">—</span> : null}
      <span className={amount || dash ? "res__st" : "res__st res__st--only"}>{status}</span>
    </span>
  );
}
