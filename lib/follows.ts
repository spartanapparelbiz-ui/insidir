/* What a member can follow, and their Following feed.
 *   trader   a Polymarket wallet (0x…, lower-case)
 *   market   a Polymarket condition id or a Kalshi ticker
 *   insider  an SEC reporting owner's CIK (Form 4)
 *   company  an issuer's CIK (every insider at it); its page is /insider-trading/<ticker>
 *   fund     a 13F filer's CIK
 *   tracker  a tracker's slug (lib/trackers.ts): its moves in Following, and alerts when live
 * CIKs are kept without leading zeros. The Following feed puts, newest first, the moves of followed traders and
 * markets with each new filing by a followed insider, at a followed company, or by a followed fund. No politicians:
 * Congress trades are not a source and can't be followed. */
import { dollars } from "@/lib/money";
import type { FollowKind } from "@/lib/db/schema";
import { personName, roleOf } from "@/lib/profiles/name";
import { quarterChanges } from "@/lib/profiles/sec";
import { isTrackerSlug } from "@/lib/trackers";

export const FOLLOW_KINDS: readonly FollowKind[] = ["tracker", "trader", "market", "insider", "company", "fund"];
export const SEC_KINDS: readonly FollowKind[] = ["insider", "company", "fund"];

/** A follow request's kind and target, normalised; null when it isn't one. */
export function parseFollow(kind: unknown, target: unknown): { kind: FollowKind; target: string } | null {
  if (typeof kind !== "string" || !(FOLLOW_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof target !== "string" || !target.trim() || target.length > 200) return null;
  const k = kind as FollowKind, t = target.trim();
  if (k === "trader") return /^0x[0-9a-fA-F]{40}$/.test(t) ? { kind: k, target: t.toLowerCase() } : null;
  if (k === "tracker") return isTrackerSlug(t) ? { kind: k, target: t } : null;
  if (k === "market") return { kind: k, target: t.toLowerCase().startsWith("0x") ? t.toLowerCase() : t };
  return /^\d{1,10}$/.test(t) && Number(t) > 0 ? { kind: k, target: String(Number(t)) } : null;
}

/** Onboarding's "Who to follow" from SEC filings (app/api/onboarding/traders). */
export interface StockPick { kind: "insider" | "company" | "fund"; target: string; name: string; line: string }

/** "Follow insider", "Follow company", "Follow fund", "Follow market", "Follow". */
export const followLabel = (kind: FollowKind): string => (kind === "trader" || kind === "tracker" ? "Follow" : `Follow ${kind}`);

/* ---------- the Following feed's SEC entries ---------- */

export interface TradeIn { accession: string; ownerCik: string; ownerName: string; role: string; issuerCik: string; company: string; ticker: string | null;
  code: "P" | "S"; shares: number; value: number; tradeDate: string | null; filedAt: Date; url: string }

export interface FilingItem {
  key: string;
  kind: "insider" | "fund";
  at: number;
  /** "Jane Fixture, CEO of E2E Fixture Devices, bought $1,401,811 of EXDV." */
  sentence: string;
  /** Why it's in this member's feed: "You follow Jane Fixture", "You follow E2E Fixture Devices". */
  because: string;
  /** The person's or fund's page, and the company's. */
  href: string;
  companyHref: string | null;
  url: string;
  code?: "P" | "S";
}


const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const calDate = (d: string): string => DAY.format(new Date(`${d}T12:00:00Z`));

/** One entry per Form 4, reporting owner and side (a filing's lines summed), for trades by followed insiders or at
 *  followed companies. */
export function tradeItems(trades: readonly TradeIn[], follows: { insiders: ReadonlySet<string>; companies: ReadonlySet<string> },
  hrefs: { insider: (cik: string, name: string) => string; company: (ticker: string) => string }): FilingItem[] {
  const groups = new Map<string, TradeIn & { total: number }>();
  for (const t of trades) {
    if (!follows.insiders.has(t.ownerCik) && !follows.companies.has(t.issuerCik)) continue;
    const k = `${t.accession}:${t.ownerCik}:${t.code}`;
    const g = groups.get(k);
    if (g) g.total += t.value; else groups.set(k, { ...t, total: t.value });
  }
  return [...groups.values()].map(g => {
    const who = personName(g.ownerName);
    const role = g.role ? `, ${roleOf(g.role)} of ${g.company},` : "";
    return {
      key: `f4:${g.accession}:${g.ownerCik}:${g.code}`, kind: "insider" as const, at: g.filedAt.getTime(), code: g.code,
      sentence: `${who}${role} ${g.code === "P" ? "bought" : "sold"} ${dollars(g.total)} of ${g.ticker ?? g.company}.`,
      because: follows.insiders.has(g.ownerCik) ? `You follow ${who}` : `You follow ${g.company}`,
      href: hrefs.insider(g.ownerCik, g.ownerName), companyHref: g.ticker ? hrefs.company(g.ticker) : null, url: g.url,
    };
  }).sort((a, b) => b.at - a.at);
}

export interface FundFilingIn { fundCik: string; fund: string; accession: string; period: string | null; filedOn: string; url: string;
  holdings: Array<{ cusip: string; company: string; shares: number; value: number }>; prev: Array<{ cusip: string; company: string; shares: number; value: number }> | null }

/** A followed fund's new 13F: its biggest add and how many new positions, against the quarter before when we hold it. */
export function fundItem(f: FundFilingIn, href: string): FilingItem {
  let detail = "";
  if (f.prev) {
    const { adds } = quarterChanges(f.prev, f.holdings, 100);
    const fresh = adds.filter(a => a.kind === "new").length;
    const top = adds[0];
    detail = [top ? ` Largest addition: ${top.company} (${dollars(top.value)}).` : "", fresh ? ` ${fresh} new ${fresh === 1 ? "position" : "positions"}.` : ""].join("");
  }
  const q = f.period ? ` for the quarter ending ${calDate(f.period)}` : "";
  return { key: `13f:${f.accession}`, kind: "fund", at: Date.parse(`${f.filedOn}T21:00:00Z`), sentence: `${f.fund} filed its 13F${q}.${detail}`,
    because: `You follow ${f.fund}`, href, companyHref: null, url: f.url };
}
