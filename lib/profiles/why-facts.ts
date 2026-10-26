/* The facts behind "why this matters" (lib/profiles/why.ts) for a page of moves, in a handful of batched queries.
 * `until` is the viewer's clock (a free viewer's is 30 minutes behind), so no line uses moves they can't see yet.
 * Server only. */
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves as movesTable } from "@/lib/db/schema";
import { hasRecord, isTopTrader } from "@/lib/moves/records";
import { recordsFor } from "@/lib/moves/store";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { historyCoverage } from "@/lib/stocks/history";
import { etDay, whyLine, type WhyFacts } from "./why";

const H = 3_600_000;
const cik = (c: string | null | undefined) => (c ? String(Number(c)) : "");

export async function whyLines(db: Db, list: readonly Move[], opts: { records: boolean; until: number; now: number }): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const facts = await whyFacts(db, list, opts);
  for (const m of list) out.set(m.id, whyLine(m, facts.get(m.id)!));
  return out;
}

export async function whyFacts(db: Db, list: readonly Move[], { records, until, now }: { records: boolean; until: number; now: number }): Promise<Map<string, WhyFacts>> {
  const today = etDay(now);
  const out = new Map<string, WhyFacts>(list.map(m => [m.id, { records, moveDay: etDay(m.at), today }]));
  const markets = list.filter(m => m.source !== "sec");
  const insiders = list.filter(m => m.detail?.kind === "insider");

  if (markets.length) {
    const from = Math.min(...markets.map(m => m.at)) - 24 * H;
    const sib = await db.select({ id: movesTable.id, marketId: movesTable.marketId, side: movesTable.outcomeSide, amount: movesTable.amount,
      avgPrice: movesTable.avgPrice, wallet: movesTable.wallet, at: movesTable.at }).from(movesTable)
      .where(and(inArray(movesTable.marketId, [...new Set(markets.map(m => m.marketId))]), gte(movesTable.at, new Date(from)), lte(movesTable.at, new Date(until))));
    const recs: Map<string, TraderRecord> = records ? await recordsFor(db, [...sib.map(s => s.wallet ?? ""), ...markets.map(m => m.wallet ?? "")]) : new Map();
    // Each wallet's earlier big moves (for "biggest bet ever").
    const wallets = [...new Set(markets.map(m => m.wallet).filter((w): w is string => Boolean(w)))];
    const prior = records && wallets.length ? await db.select({ wallet: movesTable.wallet, at: movesTable.at, amount: movesTable.amount, id: movesTable.id }).from(movesTable)
      .where(and(inArray(movesTable.wallet, wallets), gte(movesTable.amount, Math.min(...markets.map(m => m.amount))))) : [];
    for (const m of markets) {
      const f = out.get(m.id)!;
      const same = sib.filter(s => s.marketId === m.marketId && s.id !== m.id);
      const day = same.filter(s => etDay(s.at.getTime()) === f.moveDay);
      f.sameMarketDay = { others: day.length, max: Math.max(0, ...day.map(s => s.amount)) };
      const t = m.at;
      const side = same.filter(s => s.side === m.outcomeSide);
      const tops = new Set(side.filter(s => s.wallet && s.at.getTime() >= t - 24 * H && s.at.getTime() <= t && isTopTrader(recs.get(s.wallet))).map(s => s.wallet!));
      if (m.wallet && isTopTrader(recs.get(m.wallet))) tops.add(m.wallet);
      f.topTradersSameSide = tops.size;
      const hour = side.filter(s => s.at.getTime() >= t - H && s.at.getTime() < t).sort((a, b) => a.at.getTime() - b.at.getTime());
      f.priceHourAgo = hour[0]?.avgPrice ?? null;
      if (m.wallet) {
        const rec = recs.get(m.wallet);
        f.traderHasRecord = hasRecord(rec);
        const before = prior.filter(p => p.wallet === m.wallet && p.id !== m.id && p.at.getTime() < t).map(p => p.amount);
        f.traderBiggestBefore = rec?.biggestBet != null ? Math.max(rec.biggestBet, ...before) : null;
      }
    }
  }

  if (insiders.length) {
    const owners = [...new Set(insiders.map(m => m.detail?.kind === "insider" ? cik(m.detail.ownerCik) : "").filter(Boolean))];
    const issuers = [...new Set(insiders.map(m => m.detail?.kind === "insider" ? cik(m.detail.issuerCik) : "").filter(Boolean))];
    const [ownerCov, issuerCov] = await Promise.all([historyCoverage(db, "owner", owners), historyCoverage(db, "issuer", issuers)]);
    const ownerBuys = owners.length ? (await db.execute(sql`select owner_cik, accession, max(trade_date) as d from terminal.insider_trades
      where code = 'P' and owner_cik in (${sql.join(owners.map(o => sql`${o}`), sql`, `)}) group by owner_cik, accession`)).rows as Array<{ owner_cik: string; accession: string; d: string | null }> : [];
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthBuys = issuers.length ? (await db.execute(sql`select distinct issuer_cik, owner_cik from terminal.insider_trades
      where code = 'P' and trade_date >= ${monthStart} and issuer_cik in (${sql.join(issuers.map(o => sql`${o}`), sql`, `)})`)).rows as Array<{ issuer_cik: string; owner_cik: string }> : [];
    // Filing-level buy totals at each company (a jointly filed line is stored once per owner: counted once).
    const filings = issuers.length ? (await db.execute(sql`select issuer_cik, accession, sum(value)::float as total, max(trade_date) as d, min(filed_at) as filed_at
      from (select distinct on (accession, line) issuer_cik, accession, line, value, trade_date, filed_at from terminal.insider_trades
            where code = 'P' and issuer_cik in (${sql.join(issuers.map(o => sql`${o}`), sql`, `)})) x
      group by issuer_cik, accession`)).rows as Array<{ issuer_cik: string; accession: string; total: number; d: string | null; filed_at: string }> : [];
    for (const m of insiders) {
      const d = m.detail;
      if (d?.kind !== "insider") continue;
      const f = out.get(m.id)!;
      const on = d.tradeDate ?? new Date(d.filedAt).toISOString().slice(0, 10);
      const o = cik(d.ownerCik), i = cik(d.issuerCik);
      const earlier = ownerBuys.filter(b => b.owner_cik === o && b.accession !== d.accession && b.d && b.d < on).map(b => b.d!).sort();
      f.ownerPrevBuy = earlier.at(-1) ?? null;
      f.ownerCompleteSince = ownerCov.get(o) ?? null;
      f.insidersThisMonth = new Set(monthBuys.filter(b => b.issuer_cik === i).map(b => b.owner_cik)).size;
      const bigger = filings.filter(x => x.issuer_cik === i && x.accession !== d.accession && new Date(x.filed_at).getTime() < d.filedAt && x.total >= m.amount && x.d)
        .map(x => x.d!).sort();
      f.issuerBiggerOn = bigger.at(-1) ?? null;
      f.issuerCompleteSince = issuerCov.get(i) ?? null;
    }
  }
  return out;
}
