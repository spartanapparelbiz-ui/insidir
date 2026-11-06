import { afterEach, describe, expect, it } from "vitest";
import { clearMemo, memo, MEMO_MAX } from "@/lib/memo";

describe("memo stays bounded", () => {
  afterEach(() => clearMemo());

  it("never holds more than MEMO_MAX keys, even when none have expired", async () => {
    const calls: string[] = [];
    for (let i = 0; i < MEMO_MAX + 50; i++) await memo(`k:${i}`, 3_600_000, async () => { calls.push(`k:${i}`); return i; });
    // The newest key is still cached; the oldest was dropped and is computed again.
    await memo(`k:${MEMO_MAX + 49}`, 3_600_000, async () => { calls.push("again-newest"); return 0; });
    await memo("k:0", 3_600_000, async () => { calls.push("again-oldest"); return 0; });
    expect(calls).not.toContain("again-newest");
    expect(calls).toContain("again-oldest");
  });

  it("still serves a cached value inside its ttl", async () => {
    let n = 0;
    await memo("a", 60_000, async () => ++n);
    expect(await memo("a", 60_000, async () => ++n)).toBe(1);
  });
});
