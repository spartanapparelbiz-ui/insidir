/* People for market imagery: official congressional portraits (public domain) from github.com/unitedstates/images,
 * vendored into public/people/ so nothing is hotlinked. Finds every current member of Congress named in an open market
 * (terminal.moves titles and outcomes, terminal.markets titles, last 30 days), downloads their 450×550 portrait once,
 * and writes public/people/people.json (bioguide, name, party, state, chamber). Anyone not in that set is drawn as a
 * monogram (components/sky/Art.tsx). Run where the database is: `npx tsx scripts/people-sync.ts` (DATABASE_URL), or
 * pass names: `npx tsx scripts/people-sync.ts --names "Haley Stevens,John Cornyn"`. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { matchPeople, type Legislator, type PersonRow } from "../lib/sky/people-match";

const OUT = join(process.cwd(), "public/people");
const LEGISLATORS = "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json";
const PORTRAIT = (id: string) => `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/${id}.jpg`;

async function texts(): Promise<string[]> {
  const i = process.argv.indexOf("--names");
  if (i > 0) return (process.argv[i + 1] ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL, or pass --names");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query(`select distinct x from (
        select market_title as x from terminal.moves where result is null and at > now() - interval '30 days'
        union select event_title from terminal.moves where result is null and at > now() - interval '30 days'
        union select outcome from terminal.moves where result is null and at > now() - interval '30 days'
        union select data->>'title' from terminal.markets where data->>'result' is null) t where x is not null`);
    return r.rows.map(x => String(x.x));
  } finally { await c.end(); }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const legislators = (await (await fetch(LEGISLATORS)).json()) as Legislator[];
  const found = matchPeople(await texts(), legislators);
  const file = join(OUT, "people.json");
  const have: PersonRow[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const byId = new Map(have.map(p => [p.bioguide, p]));
  for (const p of found) {
    const jpg = join(OUT, `${p.bioguide}.jpg`);
    if (!existsSync(jpg)) {
      const res = await fetch(PORTRAIT(p.bioguide));
      if (!res.ok) { console.log(`no portrait for ${p.name} (${p.bioguide}): ${res.status}; drawn as a monogram`); continue; }
      writeFileSync(jpg, Buffer.from(await res.arrayBuffer()));
      console.log(`portrait: ${p.name} (${p.bioguide})`);
    }
    byId.set(p.bioguide, p);
  }
  const rows = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${rows.length} people in public/people/people.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
