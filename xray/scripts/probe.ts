/* Live check against Polymarket's public APIs.
 *
 *   npm run probe                      confirm every endpoint's response shape, then X-ray three live markets:
 *                                      the biggest open politics market, the biggest open sports market and a
 *                                      recently resolved one
 *   npm run probe -- <link> [<link>]   X-ray these links instead
 *
 * Prints what each endpoint actually returned next to what the app expects, then each market's verdicts and
 * how long the X-ray took. Read-only; nothing is stored. */
import { getJson } from "../lib/http";
import { parseLink } from "../lib/link";
import { DATA, GAMMA } from "../lib/polymarket";
import { isObject, list, rows } from "../lib/parse";
import { resolveTarget } from "../lib/resolve";
import { buildXray } from "../lib/xray";

const kind = (v: unknown): string => (Array.isArray(v) ? `array(${v.length})` : v === null ? "null" : typeof v === "string" && /^\s*\[/.test(v) ? "json-string" : typeof v);
const shape = (o: unknown, keys: string[]): string =>
  isObject(o) ? keys.map(k => `${k}:${k in o ? kind(o[k]) : "MISSING"}`).join(" ") : `not an object (${kind(o)})`;

async function probeEndpoints(conditionId: string, eventSlug: string, marketSlug: string): Promise<void> {
  console.log("\n== Response shapes ==");
  const ev = await getJson(`${GAMMA}/events/slug/${eventSlug}`);
  console.log("events/slug       ", shape(ev, ["id", "slug", "title", "markets"]));
  const m = await getJson(`${GAMMA}/markets/slug/${marketSlug}`);
  console.log("markets/slug      ", shape(m, ["slug", "question", "groupItemTitle", "conditionId", "outcomes", "outcomePrices", "clobTokenIds", "closed", "volume", "endDate", "image"]));
  const holders = await getJson(`${DATA}/holders?market=${conditionId}&limit=20`);
  const g = Array.isArray(holders) ? holders[0] : null;
  console.log("holders           ", kind(holders), shape(g, ["token", "holders"]), "| holder:", shape(isObject(g) ? list(g.holders)[0] : null, ["proxyWallet", "name", "pseudonym", "displayUsernamePublic", "amount", "outcomeIndex"]));
  const start = Math.floor(Date.now() / 1000) - 7 * 86400;
  const trades = await getJson(`${DATA}/trades?market=${conditionId}&takerOnly=true&start=${start}&limit=5&filterType=CASH&filterAmount=5000`);
  const t = rows(trades)[0];
  console.log("trades            ", kind(trades), shape(t, ["proxyWallet", "side", "size", "price", "timestamp", "outcome", "outcomeIndex", "name", "pseudonym", "transactionHash"]));
  const allTrades = await getJson(`${DATA}/trades?market=${conditionId}&takerOnly=true&limit=5`);
  const old = rows(allTrades).filter(x => typeof x.timestamp === "number" && x.timestamp < start).length;
  console.log("trades start=     ", old ? `IGNORED? ${old} of 5 unfiltered rows predate start` : "ok");
  const wallet = isObject(t) && typeof t.proxyWallet === "string" ? t.proxyWallet : isObject(g) && isObject(list(g.holders)[0]) ? String((list(g.holders)[0] as Record<string, unknown>).proxyWallet) : null;
  if (!wallet) { console.log("(no wallet found to probe wallet endpoints)"); return; }
  const closed = await getJson(`${DATA}/closed-positions?user=${wallet}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`);
  console.log("closed-positions  ", kind(closed), shape(rows(closed)[0], ["realizedPnl", "conditionId", "title"]));
  const act = await getJson(`${DATA}/v2/activity?user=${wallet}&type=TRADE&sort_by=TIMESTAMP&sort_direction=ASC&limit=1&start=1`);
  console.log("v2/activity       ", shape(act, ["data", "pagination"]), "| row:", shape(rows(act)[0], ["timestamp", "type"]));
  const stats = await getJson(`${DATA}/v2/user-stats?user=${wallet}`);
  console.log("v2/user-stats     ", shape(stats, ["data"]), "| data:", shape(isObject(stats) ? stats.data : null, ["trades"]));
  const unknown = await getJson(`${DATA}/v2/user-stats?user=0x0000000000000000000000000000000000000001`);
  console.log("user-stats unknown", JSON.stringify(unknown)?.slice(0, 120));
}

async function topEvent(query: string): Promise<string | null> {
  const r = await getJson(`${GAMMA}/events?${query}`);
  const e = rows(r)[0];
  return e && typeof e.slug === "string" ? e.slug : null;
}

async function xrayLink(label: string, link: string): Promise<void> {
  const t = parseLink(link);
  if (!t) { console.log(`\n${label}: not a market link: ${link}`); return; }
  const t0 = Date.now();
  let r = await resolveTarget(t);
  if (r?.type === "list") {
    const first = r.markets[0];
    console.log(`\n${label}: ${r.event.title} has ${r.markets.length} markets; X-raying the biggest: ${first?.question}`);
    r = first ? { type: "market", market: first, event: r.event } : null;
  }
  if (!r || r.type !== "market") { console.log(`\n${label}: not found: ${link}`); return; }
  const x = await buildXray(r.market);
  const ms = Date.now() - t0;
  const m = x.market;
  console.log(`\n${label}: ${m.question}`);
  console.log(`  https://polymarket.com/event/${m.eventSlug ?? m.slug}${m.eventSlug && m.eventSlug !== m.slug ? "/" + m.slug : ""}`);
  console.log(`  odds    ${m.outcomes.map((o, i) => `${o} ${Math.round((m.prices[i] ?? 0) * 100)}¢`).join("  ")}${m.resolvedOutcome ? `  (Resolved: ${m.resolvedOutcome})` : ""}`);
  console.log(`  sharp   ${x.sharp.headline}${x.sharp.detail ? " — " + x.sharp.detail : ""}`);
  for (const w of (x.sharp.wallets ?? []).slice(0, 5)) console.log(`          ${w.name ?? w.wallet} ${m.outcomes[w.outcomeIndex]} ${Math.round(w.value)} ${w.record.wins}-${w.record.losses}`);
  console.log(`  insider ${x.insider.headline}`);
  for (const f of x.insider.flags ?? []) console.log(`          [${f.level}] ${f.name ?? f.wallet} ${m.outcomes[f.outcomeIndex]} $${Math.round(f.cash)}: ${f.reasons.join("; ")}`);
  console.log(`  flow    ${x.flow.headline}`);
  console.log(`  partial ${x.failedWallets} wallet(s) couldn't be checked · ${ms} ms`);
}

async function main(): Promise<void> {
  const links = process.argv.slice(2);
  if (links.length) {
    for (const [i, l] of links.entries()) await xrayLink(`Market ${i + 1}`, l);
  } else {
    const politics = await topEvent("tag_slug=politics&active=true&closed=false&order=volume24hr&ascending=false&limit=1");
    const sports = await topEvent("tag_slug=sports&active=true&closed=false&order=volume24hr&ascending=false&limit=1");
    const resolved = await topEvent("closed=true&order=endDate&ascending=false&limit=1&volume_num_min=100000");
    if (politics) {
      const r = await resolveTarget({ kind: "event", slug: politics, market: null });
      const m = r?.type === "market" ? r.market : r?.markets[0];
      if (m) await probeEndpoints(m.conditionId, politics, m.slug);
    }
    for (const [label, slug] of [["Politics", politics], ["Sports", sports], ["Resolved", resolved]] as const) {
      if (slug) await xrayLink(label, slug); else console.log(`\n${label}: no event found`);
    }
  }
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
