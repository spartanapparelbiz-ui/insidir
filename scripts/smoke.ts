/* Every route answers 200, for a visitor and for a member (scripts/routes.ts). Visitors on members-only pages may be
 * sent to /login or /start, and that page must answer 200. Run against a running site:
 *   SMOKE_BASE=http://localhost:3100 SMOKE_SESSION=<a member's session token> npx tsx scripts/smoke.ts
 * Without SMOKE_SESSION only the visitor pass runs. Exit code 1 on any failure. */
import { entityRoutes, MEMBER, PUBLIC } from "./routes";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3100";
const SESSION = process.env.SMOKE_SESSION;

async function hit(path: string, cookie?: string): Promise<{ path: string; status: number; landed: string }> {
  const r = await fetch(new URL(path, BASE), { headers: cookie ? { cookie: `insidir_session=${cookie}` } : {}, redirect: "follow" }).catch(() => null);
  return { path, status: r?.status ?? 0, landed: r ? new URL(r.url).pathname : "" };
}

async function pass(who: "visitor" | "member", cookie?: string): Promise<string[]> {
  const entities = await entityRoutes(BASE, cookie ? { cookie: `insidir_session=${cookie}` } : {});
  const routes = [...PUBLIC, ...MEMBER, ...entities];
  const bad: string[] = [];
  for (const p of routes) {
    const r = await hit(p, cookie);
    const ok = r.status === 200 && (who === "member" ? !/^\/(login|start)$/.test(r.landed) || /^\/(login|start)/.test(p) : true);
    console.log(`${ok ? "ok  " : "FAIL"} ${who.padEnd(7)} ${r.status} ${p}${r.landed && r.landed !== p.split("?")[0] ? ` → ${r.landed}` : ""}`);
    if (!ok) bad.push(`${who} ${p}: ${r.status} → ${r.landed}`);
  }
  return bad;
}

void (async () => {
  const bad = [...(await pass("visitor")), ...(SESSION ? await pass("member", SESSION) : [])];
  if (!SESSION) console.log("(member pass skipped: set SMOKE_SESSION)");
  if (bad.length) { console.error(`\n${bad.length} failed:\n${bad.join("\n")}`); process.exit(1); }
  console.log("\nEvery route answered 200.");
})();
