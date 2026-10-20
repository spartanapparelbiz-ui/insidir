# AI cost control and load: how the spend is bounded, and what was measured

The target is under **$0.25 of AI cost per typical paying customer per month**. It is an engineering target, not a
promise, and it is enforced: the per-customer monthly allowance defaults to exactly $0.25.

## How cost is kept from growing with customers

| Work | Done | Shared by |
| --- | --- | --- |
| Reading a filing (Form 4 parse, validation, storage) | once per accession, by the import queue | every customer |
| Research events and alert matching | once per filing; matching is SQL over follows | every customer |
| Connections, Changes, Evidence, briefings, investigations (the factual answer) | deterministic SQL and rules, no model; responses cached 60 s per CIK | every customer |
| Financial facts (XBRL) | one SEC fetch per company per 15 minutes, cached | every customer |
| A filing summary | once per filing content version, prompt version and model (`ai_explanations`) | every customer |
| A research-event explanation | once per event, evidence, model, prompt version and normalised question (`explanation_cache`) | every customer asking it |
| An investigation synthesis | once per question plan and evidence hash | every customer asking the same question of the same evidence |

Only text that is new (a filing nobody has opened, a question nobody has asked of that evidence) reaches a model.

## Spending controls (src/ai-gateway.mjs, src/explanations.mjs)

- **One ledger.** Both AI paths (the gateway and the research-event explanations) are read together by every budget
  check, so neither has a budget the other cannot see.
- **Global budgets**: daily ($2) and monthly ($25) in dollars, hourly (40) and daily (300) in calls. Hard clamps stop
  a typo from opening the spend.
- **Per customer**: hourly (12), daily (40) and monthly (300) calls, and the **$0.25 monthly allowance**.
- **Per request**: input capped at 12,000 characters; output at 450 tokens (gateway) or 3,000 (event explanations);
  15 s timeout; at most one retry.
- **No overspend through retries or concurrency.** Before every attempt, the retry included, the budgets are checked
  with the most that attempt could cost (its input and output cap at list prices) reserved against them. Calls in
  flight count too, so parallel requests cannot all pass a check that only sees finished calls.
- **No overspend through escalation.** The deeper model is used only for comparisons, several companies, followed
  people or 15+ sources, and only while every applicable budget is under half used; otherwise the inexpensive model
  answers.
- **Investigation depth**: one deterministic answer per question (at most 4 companies, 400 lines each) and at most one
  synthesis; no model-driven loops.
- **When a limit is reached**, the request is refused with the limit's name. Cached explanations and every
  deterministic answer stay available. Refusals are counted per day and limit (`ai_budget_refusals`).
- **Alerts**: the ops page warns at 80% of the daily or monthly budget, reports when a budget is spent, and lists
  refusals (src/ops.mjs `spendAlerts`). `/v1/admin/costs` shows spend, tokens, cache hits and cost per subscriber.
- **No default expensive model.** Research-event explanations stay off until `INSIDIR_AI_MODEL` names a model.
- **Background work**: each job runs under a PostgreSQL advisory lock (one instance at a time) with a per-run budget
  (import queue 150 filings, profiles 200), so background work does not multiply with customers or instances.

## The simulation (scripts/cost-simulate.mjs)

It runs Insidir's own code (explanations, investigations, synthesis, briefings, research events, alert fan-out,
every limit) for N simulated customers against a disposable copy of a database holding **1,225 real Form 4 filings
imported from EDGAR** (472 tickers, 1,230 reporting owners, 4.65 days of filings). Only the AI provider is replaced:
token counts are measured from each real prompt (characters ÷ 4), output length is drawn from the request's cap, 2%
of calls fail with HTTP 502 to exercise retries, and costs are **estimates at list prices** (gateway: $0.10/$0.40 and
$0.40/$1.60 per million tokens; event explanations: $4/$20, the conservative defaults, since no model is chosen).
A month of activity per customer: 20 filing explanations, 4 event explanations and 1 question about an event, 12
research questions (60% about one followed company in six common phrasings, 20% comparing two, 20% personal), 30
briefings. Actions are spread over 456 one-hour slots (19 days, 1.6× a real month's pace) so time-based limits apply.

Results are in the release report and the PR; re-run with:

    DATABASE_URL=postgresql://…/insidir_sim node scripts/cost-simulate.mjs --scenario demand|uncapped|production --customers 100,1000,10000 --json out.json

The database name must contain "sim"; the script deletes its own simulated users when it finishes.

## Known limits of the measurement

- Token counts are measured from the prompts, but the provider is simulated, so dollar figures are estimates at list
  prices, not invoices. Production has AI switched off today, so its measured AI cost is $0.
- The data is 4.65 days of filings. A full month has more distinct filings to explain; shared cost grows with the
  number of distinct filings and questions, not with customers. Upper bound for filing summaries: every Form 4 of a
  month (about 15,000) explained once at the measured $0.000076 each is about $1.15 a month in total.
- Usage patterns are assumptions; heavier users reach the per-customer allowance and are refused new model text.
