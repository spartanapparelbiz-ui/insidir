-- Creator links are activated only after an actual agreement. No automatic payouts.
CREATE TABLE IF NOT EXISTS creator_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK(code ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  instagram_handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_referrals (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_partners(id),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_referrals_creator_idx ON creator_referrals(creator_id);
CREATE TABLE IF NOT EXISTS creator_commissions (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES creator_partners(id),
  referred_user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 1000 CHECK(amount_cents=1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','void','needs_review')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  eligible_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '30 days')
);
CREATE INDEX IF NOT EXISTS creator_commissions_status_idx ON creator_commissions(status,eligible_at);
