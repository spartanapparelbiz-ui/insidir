/* Reads the ten test slips (test/fixtures/slips, scripts/slips/fixtures.ts) with the real model and compares each
 * reading with what the slip says: the book, how many legs, and each leg's kind of market, line, side and price.
 * Needs ANTHROPIC_API_KEY; each run costs a few cents.
 *   npx tsx scripts/check-slips.ts */
import { readFileSync } from "node:fs";
import { readSlip, type Slip } from "@/lib/check/extract";
import { SLIPS } from "./slips/fixtures";

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9.+-]/g, "");
let spent = 0, pass = 0;
const spend = { month: async () => 0, add: async (usd: number) => { spent += usd; } };

for (const f of SLIPS) {
  const data = readFileSync(`test/fixtures/slips/${f.file}`).toString("base64");
  let got: Slip;
  try { got = await readSlip({ data, mediaType: "image/png" }, spend); } catch (e) { console.log(`✘ ${f.file}: ${(e as Error).message}`); continue; }
  const problems: string[] = [];
  if (norm(got.book) !== norm(f.expect.book)) problems.push(`book ${got.book} ≠ ${f.expect.book}`);
  if (got.legs.length !== f.expect.legs.length) problems.push(`${got.legs.length} legs ≠ ${f.expect.legs.length}`);
  f.expect.legs.forEach((w, i) => {
    const g = got.legs[i];
    if (!g) return;
    if (g.market_type !== w.market_type && !(w.market_type === "futures" && g.market_type === "yes_no")) problems.push(`leg ${i + 1} type ${g.market_type} ≠ ${w.market_type}`);
    if (w.line !== null && Math.abs(Math.abs(g.line ?? NaN) - Math.abs(w.line)) > 0.01) problems.push(`leg ${i + 1} line ${g.line} ≠ ${w.line}`);
    if (w.over_under !== g.over_under) problems.push(`leg ${i + 1} ${g.over_under} ≠ ${w.over_under}`);
    if (norm(g.odds) !== norm(w.odds)) problems.push(`leg ${i + 1} price ${g.odds} ≠ ${w.odds}`);
    if (!norm(g.selection).includes(norm(w.selection).slice(0, 6))) problems.push(`leg ${i + 1} pick ${g.selection} ≠ ${w.selection}`);
  });
  if (problems.length) console.log(`✘ ${f.file}: ${problems.join("; ")}`); else { pass++; console.log(`✓ ${f.file}`); }
}
console.log(`${pass} of ${SLIPS.length} slips read right · $${spent.toFixed(3)}`);
process.exit(pass === SLIPS.length ? 0 : 1);
