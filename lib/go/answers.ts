/* /go's answer choices (where they bet, how much). No imports: the client funnel uses them. Pure. */
export const WHERE = [["kalshi", "Kalshi"], ["polymarket", "Polymarket"], ["sportsbook", "A sportsbook"], ["watch", "I just watch"]] as const;
export const SIZES = [["lt25", "Under $25", 20], ["25-100", "$25–100", 50], ["100-500", "$100–500", 250], ["500+", "$500+", 500]] as const;
export type Where = (typeof WHERE)[number][0];
export type Size = (typeof SIZES)[number][0];
export const isWhere = (v: unknown): v is Where => WHERE.some(([k]) => k === v);
export const isSize = (v: unknown): v is Size => SIZES.some(([k]) => k === v);
/** Their normal bet, from the size answer. */
export const stakeFor = (s: Size | null): number => SIZES.find(([k]) => k === s)?.[2] ?? 100;
