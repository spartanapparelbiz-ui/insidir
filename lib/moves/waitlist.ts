/* "Coming soon" (docs/V2.md §2): the features that aren't live yet, and the waitlist for each. A feature leaves this
 * list in the same deploy that makes it ready, and its waitlist is emailed "[Feature] is live on Insidir." */
export const COMING_SOON = {
  crypto: "Crypto tab",
  stocks: "Stocks tab",
} as const;
export type ComingSoonFeature = keyof typeof COMING_SOON;

export const isFeature = (v: string): v is ComingSoonFeature => Object.hasOwn(COMING_SOON, v);
export const validEmail = (v: string): boolean => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
