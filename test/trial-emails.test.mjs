import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

/* The trial's emails: day 1 (set up), day 5 (this week's insider moves), and the charge reminder 24 hours before the
 * $39. Trials started on the old 3-day offer keep exactly the mail they had. */
// src/config.mjs reads DATABASE_URL once, when first imported: set it (to this suite's own schema) before any import.
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "trial_emails_test_" + process.pid;
if (PG_URL) process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA);
const { dayOneEmail, dayFiveEmail } = await import("../src/trial-emails.mjs");

test("day 1 names the three set-up steps with links", () => {
  const m = dayOneEmail({ site: "https://insidir.test" });
  assert.match(m.subject, /three things to set up/);
  const text = m.paragraphs.join("\n");
  assert.match(text, /https:\/\/insidir\.test\/watchlist\.html/);
  assert.match(text, /https:\/\/insidir\.test\/people\.html/);
  assert.match(text, /https:\/\/insidir\.test\/alerts\.html/);
});

test("day 5 lists each move with its SEC filing, labels 10b5-1 sales pre-scheduled, and handles a quiet week", () => {
  const moves = [
    { owner_name: "DOE JANE", transaction_code: "P", estimated_value: 2_400_000, ticker: "EXMP", transaction_date: "2026-10-20", rule_10b5_1: false, source_url: "https://www.sec.gov/Archives/edgar/data/1/a.xml" },
    { owner_name: "ROE RICHARD", transaction_code: "S", estimated_value: 850_000, ticker: "EXMP", transaction_date: "2026-10-21", rule_10b5_1: true, source_url: "https://www.sec.gov/Archives/edgar/data/1/b.xml" }];
  const m = dayFiveEmail({ site: "https://insidir.test", moves, watching: true });
  const text = m.paragraphs.join("\n");
  assert.match(text, /Doe Jane bought \$2\.4M of EXMP on 2026-10-20\. Filing: https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1\/a\.xml/);
  assert.match(text, /Roe Richard sold \$850K of EXMP \(pre-scheduled 10b5-1 plan\)/);
  assert.match(text, /Research, not investment advice\./);
  const quiet = dayFiveEmail({ site: "https://insidir.test", moves: [], watching: true });
  assert.match(quiet.paragraphs[0], /No insider at the companies on your watchlist/);
  const empty = dayFiveEmail({ site: "https://insidir.test", moves, watching: false });
  assert.match(empty.paragraphs[0], /Your watchlist is empty/);
  assert.equal(empty.action.url, "https://insidir.test/watchlist.html");
});


test("the trial worker on PostgreSQL: day 1 and day 5 once each, only for 7-day trials", { skip: !PG_URL && "set INSIDIR_TEST_DATABASE_URL" }, async () => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  const db = await import("../src/db.mjs");
  try {
    await db.migrate();
    const q = (sql, p) => db.query(sql, p);
    const ENV = { INSIDIR_PUBLIC_URL: "https://insidir.test" };
    const { queueTrialEmails } = await import("../src/trial-emails.mjs");
    const { queueTrialReminders } = await import("../src/billing-notices.mjs");
    const user = async (tag, startedHoursAgo, endsInHours, sub = "sub_" + tag) => (await q(`INSERT INTO users(email,password_hash,subscription_status,
      stripe_customer_id,stripe_subscription_id,trial_started_at,current_period_end)
      VALUES($1,'x','trialing',$2,$3,now()-make_interval(hours=>$4),now()+make_interval(hours=>$5)) RETURNING id`,
      [tag + "@insidir.test", "cus_" + tag, sub, startedHoursAgo, endsInHours])).rows[0].id;
    const mail = async (id, kind) => (await q("SELECT * FROM email_outbox WHERE user_id=$1 AND kind=$2", [id, kind])).rows;

    const fresh = await user("fresh", 2, 166);         // a 7-day trial, two hours in
    const tooSoon = await user("toosoon", 0, 168);     // just started: the acknowledgment is enough for now
    const legacy = await user("legacy", 2, 70);        // a 3-day trial from before the change
    const dayFive = await user("dayfive", 121, 47);    // a 7-day trial, five days in
    await q("INSERT INTO watchlist(user_id,ticker) VALUES($1,'EXMP')", [dayFive]);
    await q(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,source_url,ingest_status,published_at,rule_10b5_1)
      VALUES('0000000001-26-000001','1','99','EXAMPLE CORP','EXMP','4','https://www.sec.gov/Archives/edgar/data/99/a.xml','parsed',now(),false)`);
    await q(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,shares,price_per_share,estimated_value,source_url)
      VALUES('t1','0000000001-26-000001','99','EXMP','5','DOE JANE',current_date-1,'P','A','reported_purchase',10000,24,240000,'https://www.sec.gov/Archives/edgar/data/99/a.xml')`);

    const first = await queueTrialEmails(q, { env: ENV });
    const again = await queueTrialEmails(q, { env: ENV });
    assert.deepEqual(first, { day1: 1, day5: 1 });
    assert.deepEqual(again, { day1: 0, day5: 0 }, "each email once per subscription");
    assert.equal((await mail(fresh, "trial_day1")).length, 1);
    assert.equal((await mail(tooSoon, "trial_day1")).length, 0);
    assert.equal((await mail(legacy, "trial_day1")).length, 0, "a 3-day trial started before the change gets no new emails");
    const five = (await mail(dayFive, "trial_day5"))[0];
    assert.equal(five.category, "digest");
    assert.match(five.text_body, /Doe Jane bought \$240K of EXMP/);
    assert.match(five.text_body, /https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/99\/a\.xml/);

    // The charge reminder: only trials ending within 24 hours.
    await queueTrialReminders(q, { env: ENV });
    assert.equal((await mail(dayFive, "trial_reminder")).length, 0, "47 hours out: not yet");
    await q("UPDATE users SET current_period_end=now()+interval '23 hours' WHERE id=$1", [dayFive]);
    await queueTrialReminders(q, { env: ENV });
    const reminder = (await mail(dayFive, "trial_reminder"))[0];
    assert.match(reminder.text_body, /What you keep: your watchlist \(1 company\) and the 0 people you follow/);
    // A legacy trial that already had its reminder (from Stripe's trial_will_end) is not reminded again.
    await q("INSERT INTO email_outbox(user_id,to_email,recipient_hash,category,kind,dedupe_key,subject,text_body) VALUES($1,'legacy@insidir.test',repeat('a',64),'billing','trial_reminder','billing:trial_reminder:sub_legacy','s','t')", [legacy]);
    await q("UPDATE users SET current_period_end=now()+interval '10 hours' WHERE id=$1", [legacy]);
    await queueTrialReminders(q, { env: ENV });
    assert.equal((await mail(legacy, "trial_reminder")).length, 1);
  } finally {
    await db.pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});
