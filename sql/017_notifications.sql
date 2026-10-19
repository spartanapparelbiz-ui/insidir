-- Alerts on research events for the companies a member watches and the people they follow (src/notifications.mjs).
-- Matching uses only the watchlist and followed people: never holdings, notes or anything about the member's finances.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  email_alerts TEXT NOT NULL DEFAULT 'off' CHECK (email_alerts IN ('off','immediate','daily')),
  event_types TEXT[] NOT NULL DEFAULT ARRAY['insider_purchase','insider_sale','multi_insider_purchase','form4_amendment','company_disclosure'],
  digest_hour_utc INTEGER NOT NULL DEFAULT 13 CHECK (digest_hour_utc BETWEEN 0 AND 23),
  consent_version TEXT,
  consented_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Every change to alert-email consent (opt-in with the words shown, opt-out, unsubscribe link). Kept after account
-- deletion with the user id cleared, as the record of what was agreed.
CREATE TABLE IF NOT EXISTS email_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_hash CHAR(64) NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('opt_in','change','opt_out','unsubscribe_link','unsubscribe_one_click','provider_unsubscribe')),
  setting TEXT NOT NULL,
  consent_version TEXT,
  consent_text TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_consents_user_idx ON email_consents(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES research_events(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('watchlist','followed_person')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  email_status TEXT CHECK (email_status IN ('queued','skipped_no_access','skipped_unverified','skipped_off','skipped_suppressed')),
  UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_email_idx ON notifications(created_at) WHERE emailed_at IS NULL;
-- Watched since when: an alert is only for events filed after the member started watching (minus a day).
CREATE INDEX IF NOT EXISTS watchlist_ticker_idx ON watchlist(ticker);
CREATE INDEX IF NOT EXISTS followed_people_owner_idx ON followed_people(LTRIM(owner_cik,'0'));
