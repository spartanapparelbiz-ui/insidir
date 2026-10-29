/* What reading slips has cost this month (terminal.llm_usage, month key "check:YYYY-MM"), for the cap in
 * lib/check/extract.ts. Server only. */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { llmUsage } from "@/lib/db/schema";
import type { SpendStore } from "./extract";

export function checkSpend(db: Db, now: number): SpendStore {
  const month = `check:${new Date(now).toISOString().slice(0, 7)}`;
  return {
    async month() { return (await db.select().from(llmUsage).where(eq(llmUsage.month, month)).limit(1))[0]?.usd ?? 0; },
    async add(usd) {
      await db.insert(llmUsage).values({ month, usd, calls: 1 })
        .onConflictDoUpdate({ target: llmUsage.month, set: { usd: sql`${llmUsage.usd} + ${usd}`, calls: sql`${llmUsage.calls} + 1` } });
    },
  };
}
