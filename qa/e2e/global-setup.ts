/* Starts the mock Whop and the mock push service, and seeds the e2e database. Returns the teardown. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { closeDb } from "@/lib/db";
import { createServer as createHttp } from "node:http";
import { OPENROUTER_PORT, APP_URL, E2E_DB, OUT, PUSH_PORT, WHOP, WHOP_PORT } from "./env";
import { SLIPS } from "../../scripts/slips/fixtures";
import { Pool } from "pg";
import { startMockWhop } from "./mock-whop";
import { seed } from "./seed";

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  process.env.DATABASE_URL = E2E_DB;
  await seed();
  await closeDb();
  const whop = await startMockWhop({ port: WHOP_PORT, appUrl: APP_URL, webhookSecret: WHOP.secret, plans: WHOP.plans });
  // A stand-in push service (what FCM / Apple would be): records each delivery the worker makes.
  const pushes: Array<{ path: string; headers: Record<string, unknown>; body: string; at: number }> = [];
  const pushFile = join(OUT, "pushes.json");
  writeFileSync(pushFile, "[]");
  const push = createServer({ key: readFileSync(join(OUT, "push-key.pem")), cert: readFileSync(join(OUT, "push-cert.pem")) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", c => chunks.push(c as Buffer));
    req.on("end", () => {
      pushes.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("base64"), at: Date.now() });
      writeFileSync(pushFile, JSON.stringify(pushes, null, 2));
      res.writeHead(201); res.end();
    });
  });
  await new Promise<void>(ok => push.listen(PUSH_PORT, ok));
  // A stand-in OpenRouter (chat completions): every slip reads as the DraftKings 3-leg parlay (scripts/slips/fixtures.ts,
  // the reading the real model gives). Each request is recorded for the tests.
  const asked: unknown[] = [];
  const openrouter = createHttp((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", c => chunks.push(c as Buffer));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { model?: string; response_format?: { type?: string }; messages?: Array<{ content: string | Array<{ type: string; image_url?: { url?: string } }> }> };
      // Text-only requests (analyst notes, Research) get a 503: the browser specs check the planner and template paths
      // (the model paths are unit-tested with their own stand-ins).
      const first = body.messages?.[0]?.content;
      if (!Array.isArray(first)) { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "e2e: text requests are not served" } })); return; }
      const image = first.find(c => c.type === "image_url")?.image_url?.url ?? "";
      asked.push({ path: req.url, model: body.model, format: body.response_format?.type ?? null, image: /^data:([^;]+);base64,/.exec(image)?.[1] ?? null,
        auth: req.headers.authorization, referer: req.headers["http-referer"], title: req.headers["x-title"] });
      writeFileSync(join(OUT, "openrouter.json"), JSON.stringify(asked, null, 2));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "gen-e2e", object: "chat.completion", model: body.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(SLIPS[0]!.expect), refusal: null } }],
        usage: { prompt_tokens: 1500, completion_tokens: 400, total_tokens: 1900, cost: 0.0105 } }));
    });
  });
  await new Promise<void>(ok => openrouter.listen(OPENROUTER_PORT, ok));
  // Plays the worker's part while tests run: deals stay re-confirmed and the scanner looks live, unless a test
  // pauses it (a heartbeat row named "e2e:pause") to check the failure states.
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  const keep = async () => {
    const paused = await pool.query("select 1 from terminal.worker_heartbeats where job = 'e2e:pause'");
    if (paused.rowCount) return;
    await pool.query("update terminal.worker_heartbeats set last_run_at = now(), ok = true, error = null where job like 'scan:%'");
    // The feed's sources (lib/moves/feed.ts TAB_SOURCES): "Catching up" after 5 minutes without a good update.
    await pool.query("update terminal.worker_heartbeats set last_run_at = now(), last_ok_at = now(), ok = true, error = null where job like 'moves:%' or job = 'stocks:form4'");
    await pool.query("update terminal.opportunities set last_seen_at = now() where active");
  };
  const timer = setInterval(() => void keep().catch(() => undefined), 15_000);
  return async () => { clearInterval(timer); await pool.end(); whop.close(); push.close(); openrouter.close(); };
}
