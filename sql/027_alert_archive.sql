-- Alerts inbox: archiving an alert (swipe on a phone, or the archive button) hides it from the inbox without deleting
-- it. Undo clears the column.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications(user_id, id DESC) WHERE archived_at IS NULL;
