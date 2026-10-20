-- Cost controls (src/ai-gateway.mjs). A request refused by a spending limit is counted here, per day and limit,
-- so the cost report and ops page can show when customers were turned away and which limit did it. Additive only.
CREATE TABLE IF NOT EXISTS ai_budget_refusals (
  day DATE NOT NULL,
  budget TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, budget)
);
