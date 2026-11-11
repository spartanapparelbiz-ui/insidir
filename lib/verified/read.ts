/* Reads a wallet's public record for the Verified checks (lib/verified/checks.ts), from Polymarket's public Data API
 * (v2) and Polygon (a public RPC: its USDC cash). No keys, no logins. Server only.
 *   closed positions   GET /v2/positions?status=CLOSED, newest first, 500 a page, back 90 days (MAX_PAGES at most)
 *   biggest win        the same, sorted by realized profit, 1 row
 *   open positions     GET /v2/positions?status=OPEN; their value now, GET /v2/value
 *   all-time profit    GET /v2/leaderboard?timePeriod=ALL&user=
 *   cash               USDC.e and USDC balanceOf on Polygon */
import { categoryOf } from "@/lib/brand/categories";
import { MIN_PNL, MIN_SETTLED, MONTH_MS, MONTHS, type ClosedPos, type OpenPos, type WalletRead } from "./checks";

const DATA = "https://data-api.polymarket.com";
const RPC = "https://polygon-bor-rpc.publicnode.com";
const USDC = ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"];
export const MAX_PAGES = 20;
type J = Record<string, unknown>;

async function get(url: string, tries = 3): Promise<J> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "insidir.com", Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (r.ok) return await r.json() as J;
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} from ${url.replace(/\?.*/, "")}`);
    } catch (e) { if (i >= tries - 1) throw e; }
    if (i >= tries - 1) throw new Error(`no answer from ${url.replace(/\?.*/, "")}`);
    await new Promise(ok => setTimeout(ok, 1000 * 2 ** i));
  }
}
const qs = (o: Record<string, string | number | undefined>) => "?" + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
const rows = (j: J): J[] => (Array.isArray(j.data) ? j.data as J[] : []);
const cursor = (j: J): string | undefined => { const p = j.pagination as { has_more?: boolean; next_cursor?: string } | undefined; return p?.has_more && p.next_cursor ? p.next_cursor : undefined; };
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function closed(x: J): ClosedPos {
  const slug = x.event_slug ? String(x.event_slug) : null, title = String(x.title ?? "");
  return {
    marketId: String(x.condition_id), outcomeIndex: num(x.outcome_index), pnl: num(x.realized_pnl), moneyIn: num(x.avg_price) * num(x.total_size), start: num(x.first_entry_at) * 1000,
    at: num(x.last_event_at) * 1000, title, outcome: x.outcome ? String(x.outcome) : null,
    category: categoryOf({ title, url: slug ? `https://polymarket.com/event/${slug}` : null }),
  };
}

/** The $1M+ wallets on Polymarket's all-time leaderboard, best first (for a scan outside the worker). */
export async function millionaireWallets(): Promise<Array<{ wallet: string; pnl: number; name: string | null }>> {
  const out: Array<{ wallet: string; pnl: number; name: string | null }> = [];
  let c: string | undefined;
  for (let i = 0; i < 40; i++) {
    const j = await get(`${DATA}/v2/leaderboard${qs({ timePeriod: "ALL", orderBy: "PNL", limit: 50, cursor: c })}`);
    const page = rows(j);
    for (const r of page) if (num(r.pnl) >= MIN_PNL) out.push({ wallet: String(r.user_id).toLowerCase(), pnl: num(r.pnl), name: r.user_name ? String(r.user_name) : null });
    c = cursor(j);
    if (!c || !page.length || num(page.at(-1)!.pnl) < MIN_PNL) break;
  }
  return out;
}

async function cash(wallet: string): Promise<number | null> {
  try {
    let total = 0;
    for (const token of USDC) {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: "0x70a08231" + wallet.slice(2).toLowerCase().padStart(64, "0") }, "latest"] }) });
      const j = await r.json() as { result?: string };
      if (!j.result) return null;
      total += Number(BigInt(j.result)) / 1e6;
    }
    return total;
  } catch { return null; }
}

/** One wallet's record for the checks. `pnl` and `name` come from the leaderboard (or the watchlist). */
export async function readWallet(wallet: string, pnl: number, name: string | null, now: number): Promise<WalletRead> {
  const since = now - MONTHS * MONTH_MS;
  const recent: ClosedPos[] = [];
  let c: string | undefined, windowComplete = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const j = await get(`${DATA}/v2/positions${qs({ user: wallet, status: "CLOSED", limit: 500, sortBy: "TIMESTAMP", sortDirection: "DESC", cursor: c })}`);
    const page = rows(j).map(closed);
    recent.push(...page.filter(p => p.at > since));
    c = cursor(j);
    if (!c || !page.length || page.at(-1)!.at <= since) { windowComplete = true; break; }
  }
  // Settled: the window often has 50+; otherwise count the whole history up to MIN_SETTLED.
  let settled = recent.length;
  if (settled < MIN_SETTLED) settled = rows(await get(`${DATA}/v2/positions${qs({ user: wallet, status: "CLOSED", limit: MIN_SETTLED, sortBy: "TIMESTAMP", sortDirection: "DESC" })}`)).length;
  const [best, openJ, value, usd] = await Promise.all([
    get(`${DATA}/v2/positions${qs({ user: wallet, status: "CLOSED", limit: 1, sortBy: "REALIZED_PNL", sortDirection: "DESC" })}`),
    get(`${DATA}/v2/positions${qs({ user: wallet, status: "OPEN", limit: 500 })}`),
    get(`${DATA}/v2/value${qs({ user: wallet })}`).catch(() => null),
    cash(wallet),
  ]);
  const open: OpenPos[] = rows(openJ).map(x => ({ marketId: String(x.condition_id), outcomeIndex: num(x.outcome_index), value: num(x.current_value), moneyIn: num(x.avg_price) * num(x.current_size || x.total_size), start: num(x.first_entry_at) * 1000 }));
  const v = value?.data as { value?: unknown } | undefined;
  return { wallet, name, pnl, settled, recent, windowComplete, open, biggestWin: Math.max(0, num(rows(best)[0]?.realized_pnl)),
    openValue: v && v.value !== undefined ? num(v.value) : null, cash: usd };
}
