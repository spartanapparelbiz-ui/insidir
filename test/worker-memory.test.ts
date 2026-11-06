/* The worker's memory line and clean-restart limit (lib/worker/memory.ts). SYNTHETIC samples. */
import { describe, expect, it } from "vitest";
import { jobGrowthLine, MB, memoryLine, memorySample, memoryStats, overLimit, RECYCLE_DEFAULT_MB, recycleLimitMb, type MemorySample } from "@/lib/worker/memory";

const sample = (rssMb: number, heapUsedMb = 300, heapTotalMb = 400): MemorySample =>
  ({ rss: rssMb * MB, heapUsed: heapUsedMb * MB, heapTotal: heapTotalMb * MB, external: 40 * MB, arrayBuffers: 25 * MB });

describe("worker memory", () => {
  it("reads process.memoryUsage's fields", () => {
    const s = memorySample(() => ({ rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 }));
    expect(s).toEqual({ rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 });
  });

  it("splits RSS into the heap and what's outside it, in whole MB", () => {
    expect(memoryStats(sample(612.4))).toEqual({ rssMb: 612, heapUsedMb: 300, heapTotalMb: 400, externalMb: 40, arrayBuffersMb: 25, outsideHeapMb: 212 });
    expect(memoryLine(sample(612), 5_400)).toBe("memory: rss 612 MB (heap 300/400 MB, outside the heap 212 MB: external 40 MB, buffers 25 MB), up 90 min");
  });

  it("restarts past the limit, 800 MB unless MEMORY_RECYCLE_MB says otherwise", () => {
    expect(recycleLimitMb({})).toBe(RECYCLE_DEFAULT_MB);
    expect(RECYCLE_DEFAULT_MB).toBe(800);
    expect(recycleLimitMb({ MEMORY_RECYCLE_MB: "700" })).toBe(700);
    expect(recycleLimitMb({ MEMORY_RECYCLE_MB: " " })).toBe(800);
    expect(recycleLimitMb({ MEMORY_RECYCLE_MB: "nonsense" })).toBe(800);
    expect(overLimit(sample(800), 800)).toBe(false);
    expect(overLimit(sample(801), 800)).toBe(true);
  });

  it("MEMORY_RECYCLE_MB=0 or off never restarts", () => {
    expect(recycleLimitMb({ MEMORY_RECYCLE_MB: "0" })).toBe(0);
    expect(recycleLimitMb({ MEMORY_RECYCLE_MB: "off" })).toBe(0);
    expect(overLimit(sample(5_000), 0)).toBe(false);
  });

  it("names a job whose run grew RSS by 20 MB or more, with the others running then", () => {
    expect(jobGrowthLine("sweep", 100 * MB, 119 * MB, ["sweep"])).toBeNull();
    expect(jobGrowthLine("sweep", 100 * MB, 412 * MB, ["moves", "sweep", "smart"])).toBe("memory: sweep +312 MB (rss 412 MB; also running: moves, smart)");
    expect(jobGrowthLine("smart", 400 * MB, 425 * MB, ["smart"])).toBe("memory: smart +25 MB (rss 425 MB)");
  });
});
