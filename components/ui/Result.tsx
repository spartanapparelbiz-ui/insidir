/* A result, plain text on the right: the amount in green or red (600), the status in grey 12px under it ("Won",
 * "Lost", "Pending", "Purchase", "New"). No pill, no background. Colour only for gains and losses. */
export function Result({ amount, tone = "none", status, className }: { amount?: string | null; tone?: "won" | "lost" | "none"; status: string; className?: string }) {
  return (
    <span className={`res${className ? ` ${className}` : ""}`}>
      {amount ? <span className={`res__amt res__amt--${tone}`}>{amount}</span> : null}
      <span className={amount ? "res__st" : "res__st res__st--only"}>{status}</span>
    </span>
  );
}
