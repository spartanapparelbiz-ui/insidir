/* The live stream (Server-Sent Events). Each connection gets the events its viewer may see, when they may see them
 * (lib/live/view.ts: the free plan's 30-minute delay, the region, redaction), plus the scanner's real status every
 * few seconds. The browser closes it while the tab is hidden (components/live/useLive.ts). */
import { feedViewer, getViewer } from "@/lib/auth/viewer";
import { entitlements } from "@/lib/plans";
import { hub, ViewerCursor } from "@/lib/live/hub";
import type { LiveEvent, LiveHello, LiveStatus } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 15_000;
const STATUS_EVERY_MS = 2_000;

export async function GET(req: Request) {
  const viewer = await getViewer();
  const fv = feedViewer(viewer);
  const h = hub();
  await h.ready();
  const enc = new TextEncoder();
  const cursor = new ViewerCursor(fv);
  let close = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (chunk: string) => { if (open) { try { controller.enqueue(enc.encode(chunk)); } catch { open = false; } } };
      const event = (name: string, data: unknown, id?: number) => send(`${id !== undefined ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      const now = Date.now();
      const hello: LiveHello = { serverNow: now, delayMs: entitlements(viewer.plan).feedDelayMinutes * 60_000, plan: viewer.plan };
      send("retry: 5000\n\n");
      event("hello", hello);
      event("status", { ...h.status, serverNow: now } satisfies LiveStatus);
      const backlog: LiveEvent[] = cursor.backlog(h.buffer, now);
      event("backlog", backlog);

      let lastStatus = now;
      let lastPing = now;
      const unsubscribe = h.subscribe(() => {
        const t = Date.now();
        for (const e of cursor.next(h.buffer, t)) event(e.type, e, e.id);
        if (t - lastStatus >= STATUS_EVERY_MS) { lastStatus = t; event("status", { ...h.status, serverNow: t } satisfies LiveStatus); }
        if (t - lastPing >= PING_MS) { lastPing = t; send(": ping\n\n"); }
      });
      close = () => {
        if (!open) return;
        open = false;
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", () => close());
    },
    cancel() { close(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
