import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { directiveFindings, guaranteeFindings } from "../src/compliance-guard.mjs";
// The engine's config is read once at import: point it at the test database before anything imports it.
if (process.env.INSIDIR_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.INSIDIR_TEST_DATABASE_URL;
const { MIRROR_LIMITS } = await import("../src/intelligence-features.mjs");

/* Insidir Intelligence: Briefing (Form 4 events for the watchlist and followed people), Investigate, and Mirror (the
 * reported record of followed people). Mirror must never claim to copy trades or place orders. Fixtures are
 * SYNTHETIC (fictional issuers and people), never presented as real transactions. */
const web = new URL("../web/", import.meta.url);

test("Mirror states what it is not, on the page and in the API", async () => {
  assert.deepEqual([MIRROR_LIMITS.copyTrading, MIRROR_LIMITS.orderPlacement, MIRROR_LIMITS.simulatedPortfolio], ["not_available", "not_available", "not_built"]);
  const html = await readFile(new URL("intelligence.html", web), "utf8"), js = await readFile(new URL("assets/js/intelligence.js", web), "utf8");
  for (const tab of ["Briefing", "Investigate", "Mirror"]) assert.match(html, new RegExp(`role="tab"[^>]*>(<span[^>]*>\\d+</span>)?${tab}<`), tab + " tab");
  assert.match(html, /does not copy, follow or replicate anyone's trades, and cannot place orders/);
  assert.match(html, /Not live\.<\/b> Form 4 is due two business days after a trade/);
  const text = html.replace(/<[^>]+>/g, " ") + " " + js;
  for (const claim of [/copy (their|his|her|these) trades/i, /mirror (their|the) portfolio/i, /trade alongside/i, /automatically (buy|sell|trade)/i, /real[- ]time (trades|positions)/i])
    assert.doesNotMatch(text, claim, String(claim));
  assert.deepEqual(directiveFindings(html.replace(/<[^>]+>/g, " ")), []);
  assert.deepEqual(guaranteeFindings(html.replace(/<[^>]+>/g, " ")), []);
  assert.doesNotMatch(js, /innerHTML/, "rows are built with textContent only");
  assert.match(js, /SOURCE_HOSTS=\["www\.sec\.gov"/, "source links only to the record hosts");
  assert.doesNotMatch(html, /style="/, "no inline colours: palette tokens only");
});

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
test("briefing and Mirror on PostgreSQL", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const { migrate, pool } = await import("../src/db.mjs");
  const { filingBriefing, mirrorRecord } = await import("../src/intelligence-features.mjs");
  await migrate();
  const q = (sql, p) => pool.query(sql, p);
  const tag = Math.floor(Math.random() * 1e6), ticker = "I" + String(tag).padStart(6, "0").slice(0, 5), other = "J" + String(tag).padStart(6, "0").slice(0, 5);
  const followed = String(970000000 + tag).padStart(10, "0"), stranger = String(960000000 + tag).padStart(10, "0");
  const user = (await q("INSERT INTO users(email,password_hash) VALUES($1,'x') RETURNING id", [`intel-${randomUUID()}@example.com`])).rows[0].id;
  assert.deepEqual((await mirrorRecord(user, q)).items, [], "no follows: an empty, truthful record");
  assert.equal((await mirrorRecord(user, q)).copyTrading, "not_available");

  const event = async (key, type, tk, owner, { filedDaysAgo = 2, lag = 2, status = "active" } = {}) => {
    const r = await q(`INSERT INTO sec_events(event_key,event_type,status,ticker,issuer_name,owner_cik,owner_name,transaction_date,filing_date,ingested_at,reporting_lag_days,accessions,source_urls,facts)
      VALUES($1,$2,$8,$3,'Synthetic Intelligence Issuer',$4,'Example Person',(now()-make_interval(days=>$5::int+$6::int))::date,now()-make_interval(days=>$5::int),now(),$6::int,ARRAY['000097000026000001'],ARRAY['https://www.sec.gov/Archives/edgar/data/1/000097000026000001/'],$7::jsonb)
      ON CONFLICT (event_key) DO NOTHING RETURNING id`, [`${key}:${tag}`, type, tk, owner, filedDaysAgo, lag, JSON.stringify({ owners: [{ cik: owner, name: "Example Person", roles: ["Director"] }], totalShares: "100", totalValue: "1000", priceLow: "10", priceHigh: "10" }), status]);
    if (owner) await q("INSERT INTO sec_event_people(event_id,owner_cik) VALUES($1,$2) ON CONFLICT DO NOTHING", [r.rows[0].id, owner]);
    return r.rows[0].id;
  };
  t.after(async () => { await q("DELETE FROM sec_events WHERE event_key LIKE $1", [`%:${tag}`]); await q("DELETE FROM users WHERE id=$1", [user]); await pool.end(); });
  await event("watched-buy", "insider_purchase", ticker, stranger, { filedDaysAgo: 1 });
  await event("followed-sale", "insider_sale", other, followed, { filedDaysAgo: 3, lag: 4 });
  await event("followed-old", "insider_purchase", other, followed, { filedDaysAgo: 40, lag: 1 });
  await event("followed-superseded", "insider_purchase", other, followed, { filedDaysAgo: 2, status: "superseded" });
  await event("unrelated", "insider_purchase", "ZZ" + tag, stranger, { filedDaysAgo: 1 });

  await q("INSERT INTO watchlist(user_id,ticker) VALUES($1,$2)", [user, ticker]);
  await q("INSERT INTO followed_people(user_id,owner_cik) VALUES($1,$2)", [user, followed.replace(/^0+/, "")]);

  const brief = await filingBriefing(user, q);
  assert.deepEqual(brief.items.map(e => e.ticker).sort(), [ticker, other].sort(), "watchlist and followed person, past 7 days, active only");
  assert.ok(brief.items.every(e => e.summary && e.sourceUrls[0].startsWith("https://www.sec.gov/")));
  assert.equal(brief.advice, false);

  const mirror = await mirrorRecord(user, q);
  assert.equal(mirror.following, 1);
  assert.deepEqual(mirror.items.map(e => e.eventType), ["insider_sale", "insider_purchase"], "180 days, followed person only, superseded excluded");
  assert.equal(mirror.items[0].reportingLagDays, 4);
  assert.deepEqual(mirror.people.map(p => [p.ownerCik, p.purchases, p.sales, p.avgLagDays]), [[followed, 1, 1, 2.5]]);
  assert.deepEqual([mirror.copyTrading, mirror.orderPlacement, mirror.executed, mirror.advice], ["not_available", "not_available", false, false]);
  for (const e of mirror.items) { assert.deepEqual(directiveFindings(e.summary), []); assert.deepEqual(guaranteeFindings(e.summary), []); }
});
