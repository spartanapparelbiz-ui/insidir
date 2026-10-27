/* Example data for the component gallery (/dev/components) only: never imported by a real page. Every value here
 * is made up to show a component's states, and the gallery says so at the top. */
import type { DealCardData } from "@/components/sig/DealCard";
import type { LedgerItem } from "@/components/receipts/LedgerTable";
import type { CalcInput } from "@/lib/calculator";
import type { FeedRow } from "@/lib/feed";
import type { KeptPoint } from "@/lib/kept";
import type { ShareCardData } from "@/lib/share-card";

export const NOW = Date.UTC(2026, 9, 26, 15, 0, 0);
const MIN = 60_000;

const RULE_A = "If the New York Jets win the game scheduled for Nov 9, 2026 against the Buffalo Bills, this market resolves to Yes. If the game is postponed past Nov 16, it resolves to No.";
const RULE_B = "This market resolves to Yes if the New York Jets win their Nov 9, 2026 game against the Buffalo Bills. If the game is canceled or postponed, it resolves to No.";

export const CARD: DealCardData = {
  id: "example-1", title: "Will the Jets win on Nov 9?", when: "Sun, Nov 9", play: "Buy YES on Kalshi at 48¢ and NO on Polymarket US at 46¢.",
  legs: [{ label: "YES on Kalshi", cents: 48 }, { label: "NO on Polymarket US", cents: 46 }], feesCents: 1.4,
  safety: "green", rules: [{ venue: "Kalshi", text: RULE_A }, { venue: "Polymarket US", text: RULE_B }],
  keep: 4.6, keepAt: 100, worksUpTo: 842.5, closeTime: NOW + 14 * 24 * 60 * MIN, foundAt: NOW - 3 * MIN - 12_000, lastSeenAt: NOW - 2_000, state: "live",
};
export const CARD_FREE: DealCardData = { ...CARD, id: "example-2", keep: null, worksUpTo: null, rules: null, foundAt: NOW - 33 * MIN };
export const CARD_STALE: DealCardData = { ...CARD, id: "example-3", state: "stale", lastSeenAt: NOW - 3 * MIN, safety: "yellow" };
export const CARD_CLOSED: DealCardData = { ...CARD, id: "example-4", state: "closed", closedAt: NOW - 1 * MIN, foundAt: NOW - 5 * MIN - 8_000, safety: "green" };

export const CALC: CalcInput = {
  legs: [
    { label: "YES on Kalshi", venue: "kalshi", side: "yes", avgPrice: 0.48, fee: { venue: "kalshi", multiplier: 1 } },
    { label: "NO on Polymarket US", venue: "polymarket_us", side: "no", avgPrice: 0.46, fee: { venue: "polymarket_us", rate: 0 } },
  ],
  payoutPerSet: 1, maxSets: 900,
};
export const WALK_LEGS = [
  { venueName: "Kalshi", side: "yes" as const, priceCents: 48, url: "https://kalshi.com" },
  { venueName: "Polymarket US", side: "no" as const, priceCents: 46, url: "https://polymarket.us" },
];

const row = (over: Partial<FeedRow>): FeedRow => ({
  id: "example-row", kind: "cross_arb", title: "Will the Jets win on Nov 9?", play: "Buy YES on Kalshi at 48¢ + NO on Polymarket US at 46¢",
  legs: [
    { venue: "kalshi", venueName: "Kalshi", side: "yes", label: "YES on Kalshi", priceCents: 48, url: "https://kalshi.com" },
    { venue: "polymarket_us", venueName: "Polymarket US", side: "no", label: "NO on Polymarket US", priceCents: 46, url: "https://polymarket.us" },
  ],
  roi: 0.0489, safety: "green", safetyNotes: [], categories: ["sports"], foundAt: NOW - 3 * MIN, closeTime: NOW + 14 * 24 * 60 * MIN, days: 14,
  profit: 38.75, cost: 792, fees: 11.25, sets: 842, profitPerDay: 2.77, gapCents: 6, locked: false, lastSeenAt: NOW - 2_000, stale: false, ...over,
});
export const ROWS: FeedRow[] = [
  row({}),
  row({ id: "example-row-2", title: "Fed cuts rates in December?", categories: ["economics"], safety: "yellow", roi: 0.031, profit: 12.4, foundAt: NOW - 11 * MIN }),
  row({ id: "example-row-3", title: "Bitcoin above $120K on Nov 30?", categories: ["crypto"], locked: true, profit: null, cost: null, fees: null, sets: null, profitPerDay: null, gapCents: null, stale: true, foundAt: NOW - 40 * MIN }),
];

export const KEPT: KeptPoint[] = [
  { stake: 100, kept: 31.2, count: 14, staked: 1400 }, { stake: 250, kept: 74.9, count: 14, staked: 3420 },
  { stake: 500, kept: 131.6, count: 14, staked: 6180 }, { stake: 1000, kept: 188.3, count: 14, staked: 9010 },
  { stake: 2500, kept: 241.7, count: 14, staked: 11900 }, { stake: 5000, kept: 262.1, count: 14, staked: 12850 },
];

const leg = (venueName: string, side: string, result: string): LedgerItem["legs"][number] => ({
  venue: venueName === "Kalshi" ? "kalshi" : "polymarket_us", venueName, side, label: `${side} on ${venueName}`, contracts: "842", avg: "48.0¢", worst: "48.0¢", cost: "$404.16", fee: "$6.20", result, url: "https://kalshi.com",
});
export const LEDGER: LedgerItem[] = [
  { id: 1, rid: "R-01042", foundAt: "Oct 25, 21:46", title: "Will the Jets win on Nov 9?", safety: "green", prices: "48¢ + 46¢", size: "$842.50", profit: "+$24.10", outcome: "Settled the same way", outcomeKind: "won", check: "Passed", legs: [leg("Kalshi", "YES", "Yes"), leg("Polymarket US", "NO", "No")] },
  { id: 2, rid: "R-01039", foundAt: "Oct 24, 09:12", title: "Fed cuts rates in December?", safety: "yellow", prices: "61¢ + 36¢", size: "$310.00", profit: "−$186.00", outcome: "Settled differently", outcomeKind: "differently", check: "Failed", legs: [leg("Kalshi", "YES", "No"), leg("Polymarket US", "NO", "Yes")] },
  { id: 3, rid: "R-01051", foundAt: "Oct 26, 14:20", title: "Bitcoin above $120K on Nov 30?", safety: "green", prices: "22¢ + 75¢", size: null, profit: null, outcome: "Open", outcomeKind: "open", check: "Pending", legs: [leg("Kalshi", "YES", "Open"), leg("Polymarket US", "NO", "Open")] },
];

export const SHARE: ShareCardData = {
  title: "Will the Jets win on Nov 9?", legs: [{ venueName: "Kalshi", side: "yes", priceCents: 48 }, { venueName: "Polymarket US", side: "no", priceCents: 46 }],
  keep: 24.1, keepAt: 500, lifeMs: 4 * MIN + 8_000, settled: "same",
};
