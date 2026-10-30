/* The art job, on Railway (service "insidir-art", railway.art.json: hourly, so a new entity gets its art within the
 * hour): makes every missing artwork (lib/art/job.ts), then exits. ART_LIMIT caps how many it makes in one run,
 * ART_ONLY=company,person limits it to some kinds, ART_FORCE=1 remakes everything, ART_QA=1 also writes the QA sheet
 * and list (lib/art/qa.ts). Run: npm run art */
import { closeDb, getDb } from "@/lib/db";
import { artOnce } from "@/lib/art/job";
import type { ArtKind } from "@/lib/art/ref";

async function main(): Promise<void> {
  const env = process.env;
  const r = await artOnce(getDb(), {
    limit: env.ART_LIMIT ? Number(env.ART_LIMIT) : undefined,
    only: env.ART_ONLY ? (env.ART_ONLY.split(",") as ArtKind[]) : undefined,
    force: env.ART_FORCE === "1",
  });
  console.log(`art: made ${r.made}, failed ${r.failed}, already made ${r.skipped}; ${JSON.stringify(r.byTreatment)}`);
  if (env.ART_QA === "1") { const { artQa } = await import("@/lib/art/qa"); await artQa(getDb()); }
  await closeDb();
  process.exit(r.failed && !r.made ? 1 : 0);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
