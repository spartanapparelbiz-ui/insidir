/* The raw ownership XML behind a Form 4, for the terminal's source drawer. Fetched from EDGAR only when a member opens
 * the drawer, through the same rate-limited, User-Agent-identified client as the poller, and kept in a small
 * per-instance LRU: filings never change, so each document is fetched at most once while it stays in the cache.
 * 8-Ks have no single machine-readable document; the drawer links to their EDGAR index instead. */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { secFilings } from "@/lib/db/schema";
import { ownershipCandidates } from "@/lib/stocks/form4";
import { SecClient } from "@/lib/stocks/sec";

const MAX_ENTRIES = 200;
const MAX_BYTES = 300_000;
const lru = new Map<string, Promise<Source | null>>();
let client: SecClient | null | undefined;

export interface Source { accession: string; url: string; xml: string }
export type SourceResult = Source | "not-found" | "no-xml" | "unavailable";

async function fetchXml(sec: SecClient, base: string, accession: string): Promise<Source | null> {
  const index = await sec.json(`${base}index.json`);
  for (const name of ownershipCandidates(index)) {
    const body = await sec.text(base + name);
    if (body.includes("ownershipDocument")) return { accession, url: base + name, xml: body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body };
  }
  return null;
}

export async function sourceFor(db: Db, accession: string): Promise<SourceResult> {
  if (!/^\d{18}$/.test(accession)) return "not-found";
  const [f] = await db.select({ form: secFilings.form, cik: secFilings.issuerCik }).from(secFilings).where(eq(secFilings.accession, accession));
  if (!f) return "not-found";
  if (f.form !== "4" && f.form !== "4/A") return "no-xml";
  if (client === undefined) client = SecClient.fromEnv();
  if (!client) return "unavailable";
  const hit = lru.get(accession);
  if (hit) { lru.delete(accession); lru.set(accession, hit); }
  const p = hit ?? fetchXml(client, `https://www.sec.gov/Archives/edgar/data/${Number(f.cik)}/${accession}/`, accession);
  if (!hit) {
    lru.set(accession, p);
    p.catch(() => lru.delete(accession));
    while (lru.size > MAX_ENTRIES) lru.delete(lru.keys().next().value!);
  }
  return (await p) ?? "no-xml";
}
