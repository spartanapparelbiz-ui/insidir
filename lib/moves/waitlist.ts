/* The waitlist for Coming soon features (docs/V2.md §2): any feature key from lib/features.ts. When a feature becomes
 * ready, its waitlist is emailed "[Feature] is live on Insidir." in the same deploy. */
import { FEATURES, type Feature } from "@/lib/features";

export const isFeature = (v: string): v is Feature => Object.hasOwn(FEATURES, v);
export const validEmail = (v: string): boolean => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** The "it's live" email for a feature's waitlist. */
export function liveEmail(f: Feature, appUrl: string): { subject: string; lines: Array<{ text: string }>; cta: { label: string; url: string } } {
  const name = FEATURES[f];
  return {
    subject: `${name} is live on Insidir.`,
    lines: [{ text: `You asked for a heads-up. ${name} is ready to use now.` }],
    cta: { label: "Open Insidir", url: `${appUrl}/feed?from=waitlist` },
  };
}
