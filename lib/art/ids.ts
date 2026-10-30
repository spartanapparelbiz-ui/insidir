/* Entity ids for art, one per thing the product names, so the same tracker, person, company, fund, team, league or
 * country has the same artwork everywhere it appears:
 *   tracker:<slug>   person:<owner CIK> (an insider) or person:fig-<id> (a public figure, lib/art/places.ts)
 *   company:<TICKER> (or company:cik-<CIK> without one)   fund:<CIK>   team:<league>:<ABBR> (team:soccer:<club>)
 *   league:<id> (public/logos/manifest.json)   country:<iso2>
 * Client safe. */
import { monogram } from "@/lib/moves/avatar";
import type { ArtKind, ArtRef } from "./ref";

export const INK = "#0B0B12";
/** The light grey initials sit on (--grey-1 in app/tokens.css). */
export const GREY = "#F7F7F8";

export const kindOf = (id: string): ArtKind => id.slice(0, id.indexOf(":")) as ArtKind;

export const trackerArtId = (slug: string) => `tracker:${slug}`;
export const insiderArtId = (cik: string) => `person:${cik.replace(/^0+/, "")}`;
export const figureArtId = (fig: string) => `person:fig-${fig}`;
export const companyArtId = (ticker: string | null | undefined, cik?: string | null) =>
  ticker ? `company:${ticker.toUpperCase().replace(/\./g, "-")}` : `company:cik-${(cik ?? "").replace(/^0+/, "")}`;
export const fundArtId = (cik: string) => `fund:${cik.replace(/^0+/, "")}`;
export const teamArtId = (league: string, abbr: string) => `team:${league}:${abbr}`;
export const leagueArtId = (id: string) => `league:${id}`;
export const countryArtId = (iso2: string) => `country:${iso2.toLowerCase()}`;

/** A path segment for bucket keys: "company:BRK-B" → "company/brk-b". */
export const keyOf = (id: string) => id.toLowerCase().replace(/^([a-z]+):/, "$1/").replace(/[^a-z0-9/-]+/g, "-");

/** Initials, the last resort: the label's, two at most ("Jen Hsun Huang" → "JH", "NVIDIA" → "NV", "NYK" → "NYK"). */
export function initialsOf(label: string): string {
  const w = label.replace(/[(),.]/g, " ").split(/\s+/).filter(x => /^\p{L}/u.test(x) && !/^(jr|sr|ii|iii|iv|inc|corp|co|ltd|plc|llc|lp|the)$/i.test(x));
  if (w.length >= 2) return `${w[0]![0]}${w[w.length - 1]![0]}`.toUpperCase();
  return monogram(label);
}

/** The art an entity has before the job has made any: its initials, ink on light grey. */
export const initialsRef = (id: string, label: string, mono?: string): ArtRef => ({ id, t: "initials", c: GREY, m: mono ?? initialsOf(label), l: label });
