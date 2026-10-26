/* Starts the mock Whop and the mock push service, and seeds the e2e database. Returns the teardown. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { closeDb } from "@/lib/db";
import { APP_URL, E2E_DB, OUT, PUSH_PORT, WHOP, WHOP_PORT } from "./env";
import { Pool } from "pg";
import { startMockWhop } from "./mock-whop";
import { E2E_USERS, seed } from "./seed";

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  process.env.DATABASE_URL = E2E_DB;
  await seed();
  await closeDb();
  const whop = await startMockWhop({ port: WHOP_PORT, appUrl: APP_URL, webhookSecret: WHOP.secret, plans: WHOP.plans });
  for (const u of Object.values(E2E_USERS)) {
    if (u.plan === "free") continue;
    await fetch(`http://localhost:${WHOP_PORT}/__membership`, { method: "POST", body: JSON.stringify({ user_id: u.id, product_id: WHOP.products[u.plan] }) });
  }
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
  // Plays the worker's part while tests run: deals stay re-confirmed and the scanner looks live, unless a test
  // pauses it (a heartbeat row named "e2e:pause") to check the failure states.
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  const keep = async () => {
    const paused = await pool.query("select 1 from terminal.worker_heartbeats where job = 'e2e:pause'");
    if (paused.rowCount) return;
    await pool.query("update terminal.worker_heartbeats set last_run_at = now(), ok = true, error = null where job like 'scan:%'");
    await pool.query("update terminal.opportunities set last_seen_at = now() where active");
  };
  const timer = setInterval(() => void keep().catch(() => undefined), 15_000);
  return async () => { clearInterval(timer); await pool.end(); whop.close(); push.close(); };
}
