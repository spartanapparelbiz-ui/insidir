/* lib/market/art.ts artFor: closed markets keep their art and event (gamma omits them unless asked with closed=true),
 * and every id is read, ART_BATCH per request, not just the first batch. */
import { describe, expect, it } from "vitest";
import { ART_BATCH, artFor } from "@/lib/market/art";

const id = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const market = (n: number, closed: boolean) => ({ conditionId: id(n), closed, question: `Q${n}`, events: [{ title: "Florida Governor Election Winner", slug: "florida-governor-winner-2026" }] });

describe("artFor", () => {
  it("reads closed markets too, so a settled race keeps its event slug", async () => {
    const seen: string[] = [];
    // A gamma stand-in: open markets by default; closed ones only with closed=true (as the real API, Nov 4).
    const get = async <T,>(url: string): Promise<T | null> => {
      seen.push(url);
      const ids = [...url.matchAll(/condition_ids=(0x[0-9a-f]+)/g)].map(m => m[1]!);
      const closed = url.includes("closed=true");
      return ids.map(x => parseInt(x, 16)).filter(n => (n % 2 === 0) === closed).map(n => market(n, closed)) as T;
    };
    const ids = Array.from({ length: ART_BATCH + 5 }, (_, i) => id(i + 1000));
    const art = await artFor(ids, get);
    expect(art.size).toBe(ids.length);
    expect(art.get(id(1000))).toMatchObject({ closed: true, eventSlug: "florida-governor-winner-2026" });
    expect(art.get(id(1001))).toMatchObject({ closed: false, eventSlug: "florida-governor-winner-2026" });
    // Two batches, each asked open and closed.
    expect(seen).toHaveLength(4);
  });
});
