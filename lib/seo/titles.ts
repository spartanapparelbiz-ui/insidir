/* Page titles and descriptions for search, unique per entity and built from its own latest numbers. Pure (tested). */
import { dollars } from "@/lib/money";
import { roleOf } from "@/lib/moves/headline";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const day = (d: Date | number | string) => DAY.format(new Date(d));
/** "CEO", "CFO", "Director", "10% owner", "Officer", "Insider". */
export const roleShort = (role: string) => { const r = roleOf(role).replace(/^(its|a|an) /, ""); return r === "president" || r === "chair" ? r.charAt(0).toUpperCase() + r.slice(1) : r.length <= 3 ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1); };

export interface Buy { owner: string; role: string; value: number; filedAt: Date | number | string }

export function companyTitle(company: string, ticker: string, last: Buy | null): { title: string; description: string } {
  if (!last) return { title: `${company} (${ticker}) insider trading: every Form 4 buy and sale`, description: `Every insider purchase and sale at ${company} (${ticker}) reported to the SEC on Form 4: who traded, how much, the price and the filing.` };
  return {
    title: `${company} (${ticker}) insider buying: ${roleShort(last.role)} ${last.owner} bought ${dollars(last.value)} on ${day(last.filedAt)}`,
    description: `${last.owner} (${roleShort(last.role)}) bought ${dollars(last.value)} of ${company} stock, filed ${day(last.filedAt)}. Every insider purchase and sale at ${ticker} from SEC Form 4, with the price since each filing.`,
  };
}

export function insiderTitle(name: string, company: string | null, ticker: string | null, role: string | null, last: Buy | null): { title: string; description: string } {
  const where = [role ? roleShort(role) : null, company].filter(Boolean).join(", ");
  if (!last) return { title: `${name}${where ? ` (${where})` : ""} insider trades`, description: `Every open-market buy and sale ${name} has reported to the SEC on Form 4, with the price and the filing.` };
  return {
    title: `${name}${where ? ` (${where})` : ""} insider trades: bought ${dollars(last.value)}${ticker ? ` of ${ticker}` : ""} on ${day(last.filedAt)}`,
    description: `${name} bought ${dollars(last.value)}${company ? ` of ${company}` : ""} stock, filed ${day(last.filedAt)}. Every Form 4 purchase and sale they've reported, with the price since each.`,
  };
}

export function trackerTitle(name: string, line: string, r: { won: number; lost: number; net: number; staked?: number } | null, minSettled: number): { title: string; description: string } {
  const n = r ? r.won + r.lost : 0;
  if (!r || n < minSettled || !r.staked) return { title: `${name}: live tracker of large positions`, description: `${name}: ${line} Every position, opened and settled in public, with its record.` };
  const roi = (r.net / r.staked) * 100;
  return { title: `${name}: followable ROI ${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}% on ${n.toLocaleString("en-US")} settled`, description: `${name}: ${line} Record ${r.won}–${r.lost}; $100 on every position at the price Insidir showed would be ${roi >= 0 ? "up" : "down"} ${Math.abs(roi).toFixed(1)}%. Past results, not a promise.` };
}

export function traderTitle(name: string, rec: { resolved: number; won: number; lost: number } | null, min: number): { title: string; description: string } {
  if (!rec || rec.resolved < min) return { title: `${name}: large positions on Polymarket`, description: `Every large position Insidir has seen from ${name} on Polymarket, settled from the public record.` };
  return { title: `${name}: verified record ${rec.won}–${rec.lost} on Polymarket`, description: `${name}'s verified Polymarket record: ${rec.won} won, ${rec.lost} lost across ${rec.resolved} settled markets, with every large position and its result.` };
}
