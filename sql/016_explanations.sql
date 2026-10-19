-- Source-backed explanations (src/explanations.mjs). Accepted explanations are cached per event, evidence and prompt
-- version; every model call is logged with its token use, cost and outcome so spending limits hold across instances.
CREATE TABLE IF NOT EXISTS explanation_cache (
  cache_key CHAR(64) PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES research_events(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  explanation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS explanation_cache_event_idx ON explanation_cache(event_id);
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_id BIGINT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted','rejected','refused','error','question_refused')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_idx ON ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_log_user_idx ON ai_usage_log(user_id, created_at);
