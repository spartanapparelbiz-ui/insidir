-- Insidir Autopilot (src/notifications.mjs, src/api.mjs). Additive only: existing follows keep alerting on every
-- event ('all'), which is what they did before this migration; the Follow button sets 'important' for new follows.
--   important  alert right away for purchases, clustered purchases, sales of $1,000,000 or more as filed, and
--              company disclosures
--   all        alert right away for every new event
--   daily      collected and delivered together once a day (13:00 UTC)
--   weekly     collected and delivered together once a week (Monday 13:00 UTC)
--   off        no alerts; still followed, still in the briefing
-- paused_at set: no alerts until resumed (the mode is kept).
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS alert_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE followed_people ADD COLUMN IF NOT EXISTS alert_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE followed_people ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='watchlist_alert_mode_check') THEN
    ALTER TABLE watchlist ADD CONSTRAINT watchlist_alert_mode_check CHECK (alert_mode IN ('important','all','daily','weekly','off'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followed_people_alert_mode_check') THEN
    ALTER TABLE followed_people ADD CONSTRAINT followed_people_alert_mode_check CHECK (alert_mode IN ('important','all','daily','weekly','off'));
  END IF;
END $$;
-- When an in-app alert becomes visible and how it is delivered: right away, or with the daily or weekly batch.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT 'immediate';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_delivery_check') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_delivery_check CHECK (delivery IN ('immediate','daily','weekly'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notifications_available_idx ON notifications (user_id, available_at DESC);
