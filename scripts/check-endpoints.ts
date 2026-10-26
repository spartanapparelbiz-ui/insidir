/* Live shape check for every venue endpoint the clients read (`npm run check:endpoints`). It calls each one and
 * checks that the fields our parsers rely on are there with the right types. Exits 1 and prints every mismatch if
 * a venue renamed or removed a field, so the worker never quietly reads garbage.
 *
 * A field spec is "path:type". `a[]` means "the first element of array a"; `x|y` means either path may hold it
 * (venues have shipped both shapes). Types: string, number, boolean, array, object, numeric (number or numeric
 * string), any. Polymarket US is unverified: it is reported but only fails the run when POLYMARKET_US_ENABLED=1. */
import { baseUrls, USER_AGENT } from "@/lib/exchanges/http";
import { US_ENDPOINTS } from "@/lib/exchanges/polymarket-us";

type Kind = "string" | "number" | "boolean" | "array" | "object" | "numeric" | "any";
interface Check { name: string; method?: "GET" | "POST"; url: () => string; body?: () => unknown; fields: string[]; optional?: boolean }

const ctx: { kalshiTicker?: string; tokenId?: string } = {};

function at(v: unknown, path: string): unknown {
  let cur: unknown = v;
  for (const part of path.split(".")) {
    const arr = part.endsWith("[]");
    const key = arr ? part.slice(0, -2) : part;
    if (key) cur = cur && typeof cur === "object" && !Array.isArray(cur) ? (cur as Record<string, unknown>)[key] : undefined;
    if (arr) cur = Array.isArray(cur) ? cur[0] : undefined;
  }
  return cur;
}
function is(v: unknown, kind: Kind): boolean {
  switch (kind) {
    case "any": return v !== undefined;
    case "array": return Array.isArray(v);
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "numeric": return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
    default: return typeof v === kind;
  }
}
/** The mismatches for one response. */
export function shapeErrors(json: unknown, fields: readonly string[]): string[] {
  const errs: string[] = [];
  for (const f of fields) {
    const [paths, kind] = f.split(":") as [string, Kind];
    const options = paths.split("|");
    if (!options.some(p => is(at(json, p), kind))) {
      errs.push(`${paths} should be ${kind}, got ${options.map(p => JSON.stringify(at(json, p))?.slice(0, 60) ?? "missing").join(" / ")}`);
    }
  }
  return errs;
}

const { kalshi: k, gamma: g, clob: c, data: d, polymarketUs: us } = baseUrls();
export const CHECKS: Check[] = [
  {
    name: "Kalshi GET /markets?status=open", url: () => `${k}/markets?status=open&limit=20&mve_filter=exclude`,
    fields: ["markets:array", "markets[].ticker:string", "markets[].event_ticker:string", "markets[].title:string", "markets[].status:string",
      "markets[].expected_expiration_time|markets[].close_time:string", "markets[].yes_sub_title:string", "markets[].rules_primary:string", "cursor:any"],
  },
  { name: "Kalshi GET /events?status=open", url: () => `${k}/events?status=open&limit=20`, fields: ["events:array", "events[].event_ticker:string", "events[].series_ticker:string", "events[].title:string", "events[].mutually_exclusive:boolean"] },
  { name: "Kalshi GET /series", url: () => `${k}/series`, fields: ["series:array", "series[].ticker:string", "series[].fee_type:string", "series[].fee_multiplier:numeric"] },
  {
    name: "Kalshi GET /markets/{ticker}/orderbook", url: () => `${k}/markets/${encodeURIComponent(ctx.kalshiTicker ?? "")}/orderbook`,
    fields: ["orderbook_fp|orderbook:object", "orderbook_fp.yes_dollars|orderbook.yes_dollars|orderbook.yes|orderbook_fp.no_dollars|orderbook.no_dollars|orderbook.no:array"],
  },
  {
    name: "Polymarket Gamma GET /markets", url: () => `${g}/markets?closed=false&active=true&limit=20&order=volume24hr&ascending=false`,
    fields: ["[].id:string", "[].question:string", "[].conditionId:string", "[].clobTokenIds:string", "[].outcomes:string", "[].endDate:string", "[].active:boolean", "[].closed:boolean"],
  },
  { name: "Polymarket Gamma GET /events/keyset", url: () => `${g}/events/keyset?closed=false&active=true&limit=20`, fields: ["events:array", "next_cursor:string", "events[].id:string", "events[].title:string", "events[].markets:array", "events[].markets[].conditionId:string"] },
  {
    name: "Polymarket CLOB POST /books", method: "POST", url: () => `${c}/books`, body: () => [{ token_id: ctx.tokenId ?? "" }],
    fields: ["[].asset_id:string", "[].bids:array", "[].asks:array", "[].hash:string"],
  },
  { name: "Polymarket CLOB GET /book", url: () => `${c}/book?token_id=${ctx.tokenId ?? ""}`, fields: ["asset_id:string", "bids:array", "asks:array"] },
  { name: "Polymarket CLOB GET /price", url: () => `${c}/price?token_id=${ctx.tokenId ?? ""}&side=buy`, fields: ["price:numeric"] },
  { name: "Polymarket CLOB GET /midpoint", url: () => `${c}/midpoint?token_id=${ctx.tokenId ?? ""}`, fields: ["mid:numeric"] },
  {
    name: "Polymarket Data GET /trades (whales)", url: () => `${d}/trades?filterType=CASH&filterAmount=10000&limit=20`,
    fields: ["[].proxyWallet:string", "[].side:string", "[].asset:string", "[].conditionId:string", "[].size:numeric", "[].price:numeric", "[].timestamp:numeric", "[].title:string"],
  },
  { name: "Polymarket US GET /v1/markets (unverified)", url: () => `${us}${US_ENDPOINTS.markets}?limit=5`, fields: ["markets|data:array"], optional: process.env.POLYMARKET_US_ENABLED !== "1" },
];

async function run(check: Check): Promise<{ ok: boolean; status: number | null; errs: string[]; json: unknown }> {
  try {
    const res = await fetch(check.url(), {
      method: check.method ?? "GET",
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...(check.body ? { "content-type": "application/json" } : {}) },
      body: check.body ? JSON.stringify(check.body()) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { return { ok: false, status: res.status, errs: [`not JSON: ${text.slice(0, 80)}`], json: null }; }
    if (!res.ok) return { ok: false, status: res.status, errs: [`HTTP ${res.status}`], json };
    const errs = shapeErrors(json, check.fields);
    return { ok: errs.length === 0, status: res.status, errs, json };
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
    return { ok: false, status: null, errs: [(e instanceof Error ? e.message : String(e)) + cause], json: null };
  }
}

async function main(): Promise<void> {
  let failed = 0;
  for (const check of CHECKS) {
    const r = await run(check);
    // Feed ids from list calls into the per-market calls.
    if (check.name.startsWith("Kalshi GET /markets?")) ctx.kalshiTicker = String(at(r.json, "markets[].ticker") ?? "");
    if (check.name.startsWith("Polymarket Gamma GET /markets")) {
      try { ctx.tokenId = (JSON.parse(String(at(r.json, "[].clobTokenIds") ?? "[]")) as string[])[0]; } catch { /* reported by the shape check */ }
    }
    const label = r.ok ? "PASS" : check.optional ? "WARN" : "FAIL";
    if (!r.ok && !check.optional) failed++;
    console.log(`${label}  ${check.name}${r.status ? ` [${r.status}]` : ""}`);
    for (const e of r.errs) console.log(`      ${e}`);
  }
  console.log(failed ? `\n${failed} endpoint(s) failed. Fix the parser in lib/exchanges before running the worker.` : "\nAll endpoints match the shapes the parsers expect.");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith("check-endpoints.ts")) void main();
