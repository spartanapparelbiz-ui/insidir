-- Insidir sends no email. Alert emails and digests are switched off for every member, and anything still waiting in
-- the outbox is cancelled with its address and body erased, so nothing queued before this can ever be sent.
UPDATE notification_preferences SET email_alerts='off', updated_at=now() WHERE email_alerts<>'off';
UPDATE email_outbox SET status='cancelled', to_email=NULL, text_body=NULL, html_body=NULL, locked_until=NULL
  WHERE status IN ('queued','sending');
