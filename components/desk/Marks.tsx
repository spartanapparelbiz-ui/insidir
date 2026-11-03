/* The Desk's colour comes from data, not scenery: a wallet's orb, a market's team mark, a category tile.
 *   WalletOrb  a two-hue gradient from the address hash (hues spread, saturation and lightness kept moderate: premium,
 *              never neon), a gold ring for Millionaire, steel for Pro. Never a name or anything that identifies a person.
 *   TeamMark   the two teams of "X vs. Y" as a two-tone split disc with their abbreviations (public team colours, no
 *              logos); a D or R disc where a market clearly names a party; else a small tile for its category.
 * Safe in server and client components. */
import type { CSSProperties } from "react";
import { category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { partyOf, teamsOf } from "@/lib/brand/teams";
import type { Tier } from "@/lib/millionaires/watchlist";

/** FNV-1a over the address, then mixed: the same wallet always gets the same orb. */
export function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  // Murmur3's finalizer: addresses that differ only near the end still land far apart.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
/** Two hues 70–180° apart, saturation 52–68%, lightness 48–60%. */
export function orbColors(address: string): [string, string] {
  const h = hashOf(address.toLowerCase()), a = h % 360, gap = 70 + ((h >>> 9) % 110), s = 52 + ((h >>> 17) % 17), l = 48 + ((h >>> 24) % 13);
  return [`hsl(${a} ${s}% ${l}%)`, `hsl(${(a + gap) % 360} ${s + 4}% ${l - 8}%)`];
}

export function WalletOrb({ address, tier, size = 28 }: { address: string; tier: Tier | null; size?: number }) {
  const [a, b] = orbColors(address);
  return <span className={`d-orb ${tier ? `d-orb--${tier}` : ""}`} style={{ "--o1": a, "--o2": b, "--s": `${size}px` } as CSSProperties} aria-hidden="true" data-orb={`${a}|${b}`} />;
}

const ICON: Partial<Record<CategorySlug, string>> = {
  elections: "M4 17h12M6 17V9h8v8M8 9V6h4v3", politics: "M3 8h14M5 8v7m4-7v7m4-7v7m4-7v7M3 16h14M10 3l7 4H3z", markets: "M3 15l4-5 3 3 6-7",
  tech: "M5 5h10v8H5zM8 16h4M10 13v3", oil: "M10 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z", hurricane: "M10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6c3-3 9-3 12 2M16 14c-3 3-9 3-12-2",
  weather: "M6 13a3 3 0 0 1 0-6 4 4 0 0 1 7.5-1A3 3 0 0 1 14 13z", space: "M10 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z", world: "M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7",
  culture: "M5 15V6l10-2v9M5 15a2 2 0 1 1-2-2M15 13a2 2 0 1 1-2-2", racing: "M4 16V4m0 0h10l-2 3 2 3H4", golf: "M8 16V3l6 3-6 3", tennis: "M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14M5 5c3 3 3 7 0 10M15 5c-3 3-3 7 0 10",
  soccer: "M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14M10 7l3 2-1 4H8L7 9z",
};

export function TeamMark({ title, category, outcome, size = 30 }: { title: string; category: CategorySlug; outcome?: string | null; size?: number }) {
  const teams = teamsOf(title, category);
  const st = { "--s": `${size}px` } as CSSProperties;
  if (teams.length === 2) {
    const [a, b] = teams as [{ abbr: string; c1: string; c2: string }, { abbr: string; c1: string; c2: string }];
    return <span className="d-mark d-mark--teams" style={{ ...st, "--a": a.c1, "--b": b.c1 } as CSSProperties} title={`${a.abbr} vs ${b.abbr}`} aria-hidden="true"><b>{a.abbr}</b><b>{b.abbr}</b></span>;
  }
  if (teams.length === 1) return <span className="d-mark d-mark--team" style={{ ...st, "--a": teams[0]!.c1, "--b": teams[0]!.c2 } as CSSProperties} aria-hidden="true"><b>{teams[0]!.abbr}</b></span>;
  const party = category === "elections" || category === "politics" ? partyOf(`${title} ${outcome ?? ""}`) : null;
  if (party) return <span className={`d-mark d-mark--party d-mark--${party}`} style={st} aria-label={party === "d" ? "Democrats" : "Republicans"}><b>{party === "d" ? "D" : "R"}</b></span>;
  const icon = ICON[category];
  return (
    <span className="d-mark d-mark--cat" style={st} title={categoryInfo(category).name} aria-hidden="true">
      {icon ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg> : <b>{categoryInfo(category).name.slice(0, 1)}</b>}
    </span>
  );
}
