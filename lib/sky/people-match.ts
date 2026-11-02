/* Which members of Congress a market names (pure): their official full name, or first (or nickname) + last name, as
 * whole words. Used by scripts/people-sync.ts to vendor portraits, and at render time over public/people/people.json. */

export interface Legislator {
  id: { bioguide: string };
  name: { first: string; last: string; nickname?: string; official_full?: string };
  terms: Array<{ type: "sen" | "rep"; state: string; party: string }>;
}
export interface PersonRow { bioguide: string; name: string; last: string; first: string; party: "D" | "R" | "I"; state: string; chamber: "sen" | "rep" }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const party = (p: string): PersonRow["party"] => (/^dem/i.test(p) ? "D" : /^rep/i.test(p) ? "R" : "I");

/** Every legislator named in any of the texts. */
export function matchPeople(texts: readonly string[], legislators: readonly Legislator[]): PersonRow[] {
  const hay = texts.join("\n");
  const out: PersonRow[] = [];
  for (const l of legislators) {
    const t = l.terms[l.terms.length - 1]!;
    const names = [l.name.official_full, `${l.name.first} ${l.name.last}`, l.name.nickname ? `${l.name.nickname} ${l.name.last}` : null].filter((x): x is string => Boolean(x));
    if (names.some(n => new RegExp(`(^|[^A-Za-z])${esc(n)}($|[^A-Za-z])`, "i").test(hay))) {
      out.push({ bioguide: l.id.bioguide, name: l.name.official_full ?? `${l.name.first} ${l.name.last}`, first: l.name.nickname ?? l.name.first, last: l.name.last, party: party(t.party), state: t.state, chamber: t.type });
    }
  }
  return out;
}

/** The vendored people (public/people/people.json) a text names, in the order they appear. */
export function peopleIn(text: string, people: readonly PersonRow[]): PersonRow[] {
  const at = (p: PersonRow) => {
    for (const n of [p.name, `${p.first} ${p.last}`]) { const m = new RegExp(`(^|[^A-Za-z])${esc(n)}($|[^A-Za-z])`, "i").exec(text); if (m) return m.index; }
    const m = new RegExp(`(^|[^A-Za-z])${esc(p.last)}($|[^A-Za-z])`).exec(text);
    return m ? m.index : -1;
  };
  return people.map(p => [p, at(p)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([p]) => p);
}
