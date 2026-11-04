/* Candidate portraits (scripts/people-sync.py): public/people/<file>-{512,192,96}.webp, each in lib/brand/people.json with
 * its source and license. Sources, in order: the official congressional portrait (unitedstates/images, public domain,
 * by bioguide ID); Polymarket's candidate image, verified by name and race; Wikimedia Commons (PD / CC BY / CC BY-SA).
 * Every portrait is face-cropped to the same head size and eye line. A face is shown only for the candidate it belongs
 * to: the same name AND the same state's race. Otherwise initials. Never drawn, traced or generated. Pure. */
import people from "./people.json";

export interface Person {
  name: string; party: "D" | "R" | "I" | null; office: string; race: string; state: string; bioguide: string | null;
  file: string | null; kind: "congress" | "polymarket" | "commons" | null; source: string | null; license: string | null; author: string | null; note?: string;
}
export const PEOPLE: readonly Person[] = people as Person[];
export const LICENSES_OK = /^(public domain|PD.*|CC0.*|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?|Polymarket candidate image)$/i;

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STATES: Record<string, string> = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY", "north-carolina": "NC", "north-dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode-island": "RI", "south-carolina": "SC", "south-dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west-virginia": "WV", wisconsin: "WI", wyoming: "WY" };

/** The state a race's event slug is about: "texas-senate-election-winner" → TX; "ca-13-house-election-winner" → CA. */
export function raceState(eventSlug: string | null | undefined): string | null {
  const s = eventSlug ?? "";
  const h = /^([a-z]{2})-\d+-house-election-winner/.exec(s);
  if (h && Object.values(STATES).includes(h[1]!.toUpperCase())) return h[1]!.toUpperCase();
  const m = /^([a-z-]+?)-(?:senate|governor)-(?:election-)?winner/.exec(s);
  return m ? STATES[m[1]!] ?? null : null;
}

const INDEX = new Map(PEOPLE.filter(p => p.file).map(p => [`${slug(p.name)}|${p.state}`, p]));

/** The verified portrait for a candidate in a race, by full name AND the race's state. Null otherwise. */
export function portraitOf(name: string | null | undefined, eventSlug: string | null | undefined): Person | null {
  const st = raceState(eventSlug);
  return name && st ? INDEX.get(`${slug(name)}|${st}`) ?? null : null;
}

/** The portrait file at a size: 96 for avatars up to 48px, 192 up to 96px, else 512. */
export const portraitSrc = (p: Person, size: number) => `/people/${p.file}-${size <= 48 ? 96 : size <= 96 ? 192 : 512}.webp`;

/** A portrait whose title names exactly one person on file by full name and their race's state ("Will Ken Paxton win the
 *  Texas Senate race?"). Null otherwise. */
export function portraitFor(title: string): Person | null {
  const t = slug(title);
  const hits = PEOPLE.filter(p => p.file && t.includes(slug(p.name)) && (t.includes(slug(Object.keys(STATES).find(k => STATES[k] === p.state) ?? "~")) || t.includes(`-${p.state.toLowerCase()}-`)));
  return hits.length === 1 ? hits[0]! : null;
}
