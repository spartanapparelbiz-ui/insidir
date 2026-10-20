# Insidir creator partners — $10 per paid customer

This is a first-party referral ledger, not a creator-payout service. Public pricing (a 3-day trial for $1, then $39 a month) is unchanged by the program.

**Offer:** $10 one-time for each eligible new paying Insidir subscriber. No upfront money, no payments per view, and no automatic disbursement. Paid placements and affiliate disclosures are required by FTC rules.

## Operational flow

1. Contact creators personally. Do not activate codes until the creator explicitly agrees to the deal and disclosures.
2. Create an approved partner via `POST /v1/creators/admin/partners`, authenticated by `Authorization: Bearer <INSIDIR_CREATOR_ADMIN_TOKEN>`, JSON `{"instagramHandle":"creator","name":"Creator","code":"creator","approved":true}`. A pending partner may also be recorded using `"approved":false`, but pending links do not attribute signups.
3. Send the returned link: `https://insidir.com/signup.html?ref=creator`. The landing site also remembers `?ref=...` for 30 days on browsers where localStorage is available.
4. An *approved* code is linked to a *newly registered* user's account. A creator cannot self-refer using their contact email. Attribution cannot be retroactively added or overwritten by later links.
5. Stripe `invoice.paid` for the **first** $39 subscription payment causes a **pending** $10 ledger entry, but only after Stripe's actual active Insidir Price is independently verified. New subscribers start with a $1 3-day trial, so for most referrals the first $39 payment is the first renewal, 3 days after sign-up; the $1 trial invoice never creates a commission. Subsequent renewals and webhook retries do not create more commissions.
6. Review candidates via authenticated `GET /v1/creators/admin/commissions`. Do **not** pay until at least 30 days after payment AND verifying Stripe has no refund, dispute, fraud, canceled/failed initial payment, or self-referral. This API **does not** make payouts. Record paid/void states only after completing external reconciliation.

For auditing: `GET /v1/creators/admin/partners`.

## Security

- The `INSIDIR_CREATOR_ADMIN_TOKEN` must be randomly generated, at least 32 characters, kept only in Railway secrets, and never embedded in HTML, source control, or outreach documents. Admin routes reject every call if it is absent.
- Use only HTTPS and do not expose the token in browser requests.
- Creator codes cannot grant any paid access. Only Stripe billing controls the product paywall.
- The ledger only represents **provisional** commissions; it is not a current liability confirmation or a payout trigger.
- Refunds and disputes must be verified before the founder authorizes payouts. No payout mechanism is installed.
- No artificial creator endorsements or fake testimonials. Affiliates must disclose material relationships and complimentary access.

## Test checklist

- A new account via an approved referral creates one immutable attribution record.
- Disabled or invalid code is ignored, not a registration failure.
- A $39 paid first invoice for the exact Stripe Price logs one pending commission.
- Duplicate invoices, webhook retries, renewals, and unpaid invoices log zero additional payouts.
- Admin endpoints reject absent/wrong tokens and do not leak users or secrets.
- Check expiration, refund and dispute status manually before approving any payments.

The owner must define payout mechanics in a written agreement (including tax forms where required) before making disbursements.
