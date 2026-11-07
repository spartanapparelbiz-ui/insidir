/* Display formats. */
import { dollars } from "@/lib/money";
export const pct = (v: number, digits = 1): string => (v * 100).toFixed(digits) + "%";
/** Money in the one format (lib/money.ts), with cents under $100. */
export function usd(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 100 ? dollars(v) : `${s}$${a.toFixed(2)}`;
}
export function days(d: number): string {
  if (d < 1) return Math.max(1, Math.round(d * 24)) + "h";
  return Math.round(d) + "d";
}

