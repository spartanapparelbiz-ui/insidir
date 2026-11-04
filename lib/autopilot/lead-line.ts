/* The leading rule as one line of copy (lib/autopilot/lead.ts picks the rule). No imports: client pages use it. Pure. */
export interface Lead { key: string; name: string; settled: number; won: number; lost: number; net: number; roi: number; perBet: number; days: number }

/** "“Bets of $50K+”: +$412 on $25 a bet, 61 won of 118 settled on Kalshi in 180 days." Pure. */
export function leadLine(l: Lead): string {
  const net = `${l.net >= 0 ? "+" : "−"}$${Math.abs(Math.round(l.net)).toLocaleString("en-US")}`;
  return `“${l.name}”: ${net} on $${l.perBet} a bet, ${l.won} won of ${l.settled.toLocaleString("en-US")} settled on Kalshi in ${l.days} days, at the ask + 1¢.`;
}
