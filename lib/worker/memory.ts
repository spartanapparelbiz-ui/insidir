/* The worker's memory (worker/index.ts "memory" job): one log line a minute, and a clean restart before the
 * container's limit.
 *
 * Railway kills the worker without warning when the container passes its memory limit (1 GB), in the middle of
 * whatever job is writing. Instead, once the worker's own RSS passes MEMORY_RECYCLE_MB (default 800), it stops its
 * jobs, lets the running ones finish, closes the database and exits 0; the service's restart policy (ALWAYS) starts
 * it again in seconds. MEMORY_RECYCLE_MB=0 turns the restart off; the log line stays.
 *
 * The line splits RSS into the JavaScript heap and memory outside it (Buffers, native), so a leak can be told apart
 * from heap growth by reading the deploy logs ("memory: rss ..."). */

export const MB = 1024 * 1024;
export const RECYCLE_DEFAULT_MB = 800;

export interface MemorySample {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export function memorySample(read: () => NodeJS.MemoryUsage = () => process.memoryUsage()): MemorySample {
  const m = read();
  return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, arrayBuffers: m.arrayBuffers };
}

const mb = (bytes: number) => Math.round(bytes / MB);

/** Whole megabytes, for the log and the heartbeat. */
export function memoryStats(s: MemorySample): Record<string, number> {
  return { rssMb: mb(s.rss), heapUsedMb: mb(s.heapUsed), heapTotalMb: mb(s.heapTotal), externalMb: mb(s.external), arrayBuffersMb: mb(s.arrayBuffers), outsideHeapMb: mb(s.rss - s.heapTotal) };
}

export function memoryLine(s: MemorySample, uptimeSec: number): string {
  const m = memoryStats(s);
  return `memory: rss ${m.rssMb} MB (heap ${m.heapUsedMb}/${m.heapTotalMb} MB, outside the heap ${m.outsideHeapMb} MB: external ${m.externalMb} MB, buffers ${m.arrayBuffersMb} MB), up ${Math.round(uptimeSec / 60)} min`;
}

/** MEMORY_RECYCLE_MB, or the default; 0 (or "off") turns the clean restart off. */
export function recycleLimitMb(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MEMORY_RECYCLE_MB?.trim();
  if (raw === undefined || raw === "") return RECYCLE_DEFAULT_MB;
  if (raw.toLowerCase() === "off") return 0;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : RECYCLE_DEFAULT_MB;
}

export function overLimit(s: MemorySample, limitMb: number): boolean {
  return limitMb > 0 && s.rss > limitMb * MB;
}
