/* What a member said they want to follow (onboarding's first screen): tabs, the leagues on Sports and the topics on
 * Markets. Kept in their settings; the feed opens filtered to it ("Your picks"). Pure. */
import type { League, Tab } from "@/lib/moves/types";

export type Topic = "politics" | "economy" | "world";
export interface Picks { tabs: Array<Extract<Tab, "sports" | "markets" | "stocks">>; leagues: League[]; topics: Topic[] }

export const PICK_LEAGUES: League[] = ["NFL", "NBA", "MLB", "NHL", "college", "soccer", "UFC", "tennis", "golf"];
export const TOPICS: Array<{ key: Topic; label: string }> = [{ key: "politics", label: "Politics" }, { key: "economy", label: "Economy" }, { key: "world", label: "World" }];
/** The market categories (lib/exchanges/categories.ts) behind each topic. */
export const TOPIC_CATEGORIES: Record<Topic, string[]> = { politics: ["politics"], economy: ["economics", "finance"], world: ["geopolitics"] };

const pickTabs = new Set(["sports", "markets", "stocks"]);
export function parsePicks(raw: unknown): Picks | null {
  if (typeof raw !== "object" || !raw) return null;
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const p: Picks = {
    tabs: [...new Set(arr(r.tabs).filter(t => pickTabs.has(t)))] as Picks["tabs"],
    leagues: [...new Set(arr(r.leagues).filter(l => (PICK_LEAGUES as string[]).includes(l)))] as League[],
    topics: [...new Set(arr(r.topics).filter(t => TOPICS.some(x => x.key === t)))] as Topic[],
  };
  if (p.leagues.length && !p.tabs.includes("sports")) p.tabs.push("sports");
  if (p.topics.length && !p.tabs.includes("markets")) p.tabs.push("markets");
  return p.tabs.length ? p : null;
}

/** The categories for a set of topics (empty: every market). */
export const topicCategories = (topics: Topic[]): string[] => topics.flatMap(t => TOPIC_CATEGORIES[t]);
