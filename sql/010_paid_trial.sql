-- The paid trial ($1 for 3 days, then the plan): set the first time an account's subscription is trialing,
-- never reset, so each account trials once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
