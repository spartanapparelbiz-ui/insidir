/* Portraits of real people (candidates, officials): public/people/<file>.webp, each recorded in lib/brand/people.json
 * with its name, office, bioguide ID, source URL, license and author. Sources, in order: the unitedstates/images
 * project (official congressional portraits, public domain, by bioguide ID); Wikimedia Commons, PD / CC BY / CC BY-SA
 * only. A portrait sits only beside a market about that person, matched on full name AND office or race; anything
 * ambiguous gets initials in a neutral circle. Never drawn, traced or generated. */
import people from "./people.json";

export interface Person { name: string; office: string; bioguide: string | null; file: string; source: string; license: "public domain" | "CC BY" | "CC BY-SA" | string; author: string }
export const PEOPLE: readonly Person[] = people as Person[];
export const LICENSES_OK = /^(public domain|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?|PD.*)$/i;

/** The verified portrait for a market, when its title names exactly one person on file by full name AND their office's
 *  race (state and chamber or office). Null otherwise. */
export function portraitFor(title: string): Person | null {
  const hits = PEOPLE.filter(p => title.includes(p.name) && p.office.split(/\s*,\s*/).every(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title)));
  return hits.length === 1 ? hits[0]! : null;
}
