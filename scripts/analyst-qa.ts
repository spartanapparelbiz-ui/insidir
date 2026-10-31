/* The analyst layer's QA, against a real database and the real model (OPENROUTER_API_KEY, OPENROUTER_MODEL):
 *   notes     writes notes for the newest N positions (default 100) with the model, re-checks every one with the
 *             validator, and reports: how many passed first time, after the retry, fell back to the template, any
 *             unsupported number (must be 0), and the cost per note.
 *   research  runs the 50 planner questions from test/research.test.ts through the model and reports the tool the
 *             model chose against the planner's, the rows, refusals and the cost per query.
 * Writes nothing: notes are generated in memory, Research answers aren't logged.
 *   DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx scripts/analyst-qa.ts notes 100
 *   DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx scripts/analyst-qa.ts research */
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { moves as movesT } from "@/lib/db/schema";
import { factsFor } from "@/lib/analyst/facts";
import { writeNote } from "@/lib/analyst/note";
import { numbersIn, validateNote } from "@/lib/analyst/validate";
import { fromRow } from "@/lib/moves/store";
import { planFor } from "@/lib/research/plan";
import { research } from "@/lib/research/run";

const QUESTIONS = [
  "Open positions from trackers with positive followable ROI on tonight's NBA games", "CEO purchases over $1M in the last 7 days, by sector", "Largest open NFL positions this week",
  "Biggest NBA bets today", "Positions over $100K in the last 24 hours", "Open positions over $50K on politics", "Settled MLB positions this month", "Whale bets on soccer in the last 3 days",
  "Large positions on college football games today", "Largest positions on the Fed", "Open UFC positions", "Golf positions over $25K", "NHL positions from winning trackers",
  "Largest open positions from winning trackers", "Open positions on Bitcoin markets", "Biggest positions on prediction markets this week", "Tennis bets over 50k in the past week",
  "What does Whales ($100K+) hold now?", "Trackers with a positive followable ROI", "Best trackers by followable ROI", "Trackers on topics by followable ROI", "League trackers ranked by ROI",
  "Trackers by 30-day volume", "Which trackers have the most settled positions?", "Stock trackers", "Style trackers that made money", "Markets with the most large-position money this month",
  "Which markets have the most money on the Super Bowl", "Director purchases in the last 30 days", "Insider sales over $5M this month", "CFO purchases this week", "Insider purchases at $NVDA",
  "Form 4 purchases over $250K in the last 14 days", "Which bet should I take tonight?", "Who will win the Knicks game?", "Best bet on the NFL this weekend", "Predict the Fed decision",
  "Is it a good idea to follow googleplay?", "Who is behind wallet 0xabc?", "What's the real name of the top trader?", "What's the weather in Miami?", "Tell me a joke",
  "Largest Kalshi positions today", "Open positions over $200K", "NBA positions settled this week", "Soccer positions from winning trackers", "Largest positions on elections",
  "Trackers by followable ROI in sports", "Insider purchases over $500K this week", "Markets with the most money on the NBA",
];

async function notes(n: number) {
  const db = getDb(), now = Date.now();
  const rows = (await db.select().from(movesT).where(sql`hidden_at is null and (source <> 'sec' or detail->>'kind' = 'insider')`).orderBy(desc(movesT.at)).limit(n)).map(fromRow);
  let model = 0, template = 0, unsupported = 0, cost = 0;
  for (const m of rows) {
    const facts = await factsFor(db, m, now);
    if (!facts.facts.length) continue;
    const note = await writeNote(facts);
    const v = validateNote(note.text, facts);
    const allowed = new Set(facts.facts.flatMap(f => numbersIn(f.text)).flatMap(x => [x, x.replace(/^-/, "")]));
    const bad = numbersIn(note.text).filter(x => !allowed.has(x));
    unsupported += bad.length; cost += note.costUsd;
    if (note.origin === "model") model++; else template++;
    console.log(`${v.ok && !bad.length ? "ok  " : "FAIL"} ${note.origin.padEnd(8)} $${note.costUsd.toFixed(5)} ${m.id.slice(0, 40)} | ${note.text}${bad.length ? ` | unsupported: ${bad.join(", ")}` : ""}`);
  }
  console.log(`\n${rows.length} positions: ${model} model notes, ${template} template; unsupported numbers: ${unsupported}; cost $${cost.toFixed(4)} ($${(cost / Math.max(1, model + template)).toFixed(5)} per note)`);
  if (unsupported) process.exit(1);
}

async function queries() {
  const db = getDb(), now = Date.now();
  let cost = 0, agree = 0;
  for (const q of QUESTIONS) {
    const a = await research(db, q, { now, until: now - 30 * 60_000, live: false, useModel: true });
    const p = planFor(q);
    const tool = a.tables[0]?.tool ?? (a.origin === "refused" ? "refused" : "none");
    const want = "tool" in p ? p.tool : "refused";
    if (tool === want || (want === "refused" && tool === "none")) agree++;
    cost += a.costUsd;
    console.log(`${tool === want ? "same" : "diff"} ${a.origin.padEnd(7)} ${tool.padEnd(16)} rows=${a.tables.reduce((s, t) => s + t.rows.length, 0)} $${a.costUsd.toFixed(5)} | ${q} | ${a.text}`);
  }
  console.log(`\n${QUESTIONS.length} questions: the model chose the planner's tool ${agree} times; cost $${cost.toFixed(4)} ($${(cost / QUESTIONS.length).toFixed(5)} per query)`);
}

void (async () => {
  const [what, n] = process.argv.slice(2);
  if (what === "notes") await notes(Number(n) || 100);
  else if (what === "research") await queries();
  else { console.error("usage: analyst-qa.ts notes [N] | research"); process.exit(2); }
  process.exit(0);
})();
