/* Spot-checks Verify against the chain: for N positions in the record (terminal.record_log, DATABASE_URL), reads each of
 * its Polygon transactions from a public Polygon RPC (the same data Polygonscan shows) and checks the record's size,
 * entry price and side against what the wallet actually bought.
 *   On chain, independent of which Polymarket exchange matched it: what the wallet paid is the collateral it sent (ERC-20
 *   Transfer from the wallet: USDC.e or Polymarket's newer collateral token), and what it got is the outcome tokens the
 *   Conditional Tokens contract moved to it (ERC-1155 TransferSingle / TransferBatch to the wallet), both 6 decimals.
 *   The side: the token received must be the recorded outcome's token (Polymarket's CLOB market: tokens by outcome),
 *   and none of the other outcome's.
 * Passes when the shares match within 1%, the price within 1¢, the side exactly, and the dollars sent exceed size × price
 * by no more than Polymarket's fee (up to 4%).
 *   DATABASE_URL=… npx tsx qa/verify-onchain.ts [N=20] */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";

const RPC = process.env.POLYGON_RPC ?? "https://polygon-bor-rpc.publicnode.com";
const N = Number(process.argv[2] ?? 20);

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then(x => x.json()).catch(() => null) as { result?: T } | null;
    if (r?.result !== undefined) return r.result;
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  throw new Error(`${method} failed`);
}

/** ERC-20 Transfer, ERC-1155 TransferSingle; the Conditional Tokens contract; the collateral tokens Polymarket settles in. */
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const CTF = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const COLLATERAL = new Set(["0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb"]);
const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
const addr = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

async function main() {
  const db = getDb();
  const rows = (await db.execute(sql`select id, wallet, market_id, outcome, outcome_side, entry_price, size, tx_hashes, result from terminal.record_log
    where transaction_hash is not null and tier <> 'new' order by random() limit ${N}`)).rows as Array<{ id: string; wallet: string; market_id: string; outcome: string; outcome_side: string; entry_price: number; size: number; tx_hashes: string[]; result: string | null }>;
  let pass = 0;
  for (const r of rows) {
    const m = await fetch(`https://clob.polymarket.com/markets/${r.market_id}`).then(x => x.json()).catch(() => null) as { tokens?: Array<{ token_id: string; outcome: string }> } | null;
    const tokens = m?.tokens ?? [];
    const want = tokens[r.outcome_side === "no" ? 1 : 0]?.token_id, other = tokens[r.outcome_side === "no" ? 0 : 1]?.token_id;
    let usdc = 0n, paid = 0n, shares = 0n, wrongSide = 0n;
    for (const h of r.tx_hashes) {
      const rec = await rpc<{ logs: Array<{ address: string; topics: string[]; data: string }> } | null>("eth_getTransactionReceipt", [h]);
      for (const l of rec?.logs ?? []) {
        const c = l.address.toLowerCase();
        if (l.topics[0] === TRANSFER && l.topics.length === 3 && COLLATERAL.has(c) && addr(l.topics[1]!) === r.wallet) paid += word(l.data, 0);
        if (c === CTF && l.topics[0] === SINGLE && addr(l.topics[3]!) === r.wallet) {
          const id = word(l.data, 0).toString(), v = word(l.data, 1);
          if (id === want) shares += v; else if (id === other) wrongSide += v;
        }
      }
    }
    usdc = paid;
    // Shares are exact on chain; the dollars the wallet sent include Polymarket's trading fee on top of size × price.
    const chainShares = Number(shares) / 1e6, size = Number(usdc) / 1e6, recShares = r.size / r.entry_price;
    const fee = size ? size / r.size - 1 : NaN, price = chainShares ? r.size / chainShares : NaN;
    const okShares = Math.abs(chainShares - recShares) <= 0.01 * recShares, okPrice = Math.abs(price - r.entry_price) <= 0.01, okFee = fee >= -0.005 && fee <= 0.04, okSide = shares > 0n && wrongSide === 0n;
    const ok = okShares && okPrice && okFee && okSide;
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.outcome.slice(0, 16).padEnd(16)} side ${okSide ? "ok" : "MISMATCH"}  shares ${recShares.toFixed(0)} vs chain ${chainShares.toFixed(0)}  size $${r.size.toFixed(0)} (chain $${size.toFixed(0)} incl. ${(fee * 100).toFixed(1)}% fee)  price ${(r.entry_price * 100).toFixed(1)}¢ vs chain ${(price * 100).toFixed(1)}¢  ${r.tx_hashes.length} tx  ${r.result ?? "open"}  ${r.tx_hashes[0]}`);
  }
  console.log(`${pass} of ${rows.length} match the chain.`);
  await closeDb();
}

main().catch(e => { console.error(e); process.exit(1); });
