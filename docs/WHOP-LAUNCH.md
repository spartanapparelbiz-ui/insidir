# Whop: sandbox to production

Everything Whop-related reads one switch, `WHOP_ENV` (`lib/whop/config.ts`). Anything except exactly `production` is
the sandbox. Each environment has its own complete set of variables, so the live set can sit in Railway next to the
sandbox set, and going live is one variable.

| | Sandbox | Production |
|---|---|---|
| Dashboard | sandbox.whop.com | whop.com |
| API (SDK `WhopEnvironment`) | sandbox-api.whop.com/api/v1 | api.whop.com/api/v1 |
| OAuth | sandbox-api.whop.com/oauth | api.whop.com/oauth |
| Variables | `WHOP_SANDBOX_*` | `WHOP_*` |
| Checkout on /pricing | redirect to a checkout configuration | embedded Checkout element |

Nothing in this repo creates a production product, plan, charge, affiliate setting or marketplace listing on its own.
The scripts refuse production unless the owner sets their `…_ALLOW_PRODUCTION=1` flag.

> **Deploying this code sets production to sandbox until `WHOP_ENV=production` is set.** Today's live service has
> `WHOP_*` variables and no `WHOP_ENV`, so after this deploy it would sign people in against the sandbox and grant
> no paid access. Either set `WHOP_ENV=production` in the same deploy (only after the checklist below), or deploy to a
> staging service first.

## 1. Before anything goes live

- [ ] Run `DATABASE_URL=<Railway Postgres URL> npx tsx scripts/legacy-billing-check.ts` (read-only). The old stock
      product billed through Stripe and its accounts are still in the `public` schema of the same database. If it
      lists anyone, or Stripe → Subscriptions shows any `active`, `trialing` or `past_due` subscription, **stop**:
      those people are still being charged $39/month for a product that no longer exists. Decide what to do with them
      (cancel, refund, or invite them to Whop) before launch. Add `INSIDIR_STRIPE_SECRET_KEY=sk_live_…` to the
      command to have it ask Stripe too.
- [ ] Check the current production Whop account for existing members (Dashboard → Members). They keep their access:
      access is checked by their Whop user id and the product, and existing accounts keep their ids (migration 0001).

## 2. Sandbox (do this first)

1. Create an account at sandbox.whop.com, then Developer → API keys → an account API key. It needs what the calls in
   `lib/whop/` use: `users.checkAccess`, `memberships.list` / `cancel`, `checkoutConfigurations.create`, and for the
   setup script `products` / `variants`. Include `member:email:read` and `member:basic:read`: without them
   `payment.failed` arrives with no buyer email (Whop's docs). If a call answers 403, Whop's docs say the key is
   missing the permission that endpoint needs; add it in Developer → API keys.
2. Developer → OAuth app: redirect URI `https://YOUR_STAGING_DOMAIN/auth/callback`, scopes `openid profile email` only.
3. `WHOP_SANDBOX_API_KEY=… WHOP_SANDBOX_COMPANY_ID=biz_… npx tsx scripts/whop-setup.ts` creates Insidir ($39 / 30 days)
   and Insidir Pro ($99 / 30 days) and prints `WHOP_SANDBOX_PRODUCT_*` and `WHOP_SANDBOX_PLAN_*`.
4. Developer → Webhooks → Create: `https://YOUR_STAGING_DOMAIN/api/billing/webhook`, events `membership.activated`,
   `membership.updated`, `payment.failed`, `refund.created`, `dispute.created`, API version `v1`. Put the `ws_…`
   secret in `WHOP_SANDBOX_WEBHOOK_SECRET`.
5. Set `WHOP_ALERT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM` and the sandbox variables on the web **and** worker services.
6. Walk the flow by hand with the sandbox test cards: `4242 4242 4242 4242` pays, `4000 0000 0000 0002` is declined,
   `4000 0000 0000 0341` fails the next renewal (use it for the failed-payment email). Any future expiry, any CVC.
   Optional: `WHOP_EMBED_CHECKOUT=1` tries the embedded element against the sandbox. Whop's docs say Elements'
   sandbox isn't generally available yet; if the element can't load, /pricing offers the redirect checkout instead.

## 3. Flip `WHOP_ENV` to production: the checklist

Each item needs the owner. The first few create real things on Whop.

- [ ] Section 1 is done and nobody is still billed through Stripe (or you've decided what happens to them).
- [ ] **Products and plans.** Either reuse the live `WHOP_PRODUCT_*` / `WHOP_PLAN_*` already in Railway (check they are
      $39 and $99 every 30 days), or create them: `WHOP_ENV=production WHOP_SETUP_ALLOW_PRODUCTION=1 npx tsx scripts/whop-setup.ts`.
      They're created hidden; nothing is sold until checkout points at them.
- [ ] **API key** on whop.com → Developer, with the permissions the sandbox key ended up needing → `WHOP_API_KEY`; `WHOP_COMPANY_ID`.
- [ ] **OAuth app**: redirect URI `https://insidir.com/auth/callback` exactly, scopes `openid profile email` →
      `WHOP_CLIENT_ID` (and `WHOP_CLIENT_SECRET` if the app has one).
- [ ] **Webhook** to `https://insidir.com/api/billing/webhook`, the five events above, API version `v1` →
      `WHOP_WEBHOOK_SECRET`. Create it before this deploy goes out: the old `/api/whop/webhook` route is gone, so
      the old webhook only gets 404s from then on. Delete it once the new one answers 200 to a test event.
      No URL on insidir.com contains "whop" (test/routes.test.ts checks).
- [ ] `WHOP_ALERT_EMAIL` is your address, and `RESEND_API_KEY` / `EMAIL_FROM` send from a verified domain.
- [ ] All of the above are set on **both** Railway services (the worker checks access before paid alerts).
- [ ] Set `WHOP_ENV=production` on both services and redeploy. `WHOP_EMBED_CHECKOUT` can stay unset (on in production).
- [ ] Smoke test on insidir.com with your own account: Log in → Terminal is free and delayed → Unlock → the checkout
      appears on /pricing → pay with a real card → land on the Terminal with "You're in. Here's what's live right now."
      → Settings shows the plan, "Manage billing" opens whop.com/@me/settings/orders → Cancel subscription → refund
      yourself in the Whop dashboard.
- [ ] In whop.com → Developer → Webhooks → Deliveries, every delivery from the smoke test answered 200, and
      `select type, status, note from terminal.webhook_events order by received_at desc limit 20` shows them processed.
- [ ] Remove the sandbox variables later if you like; they're ignored while `WHOP_ENV=production`.

Rollback: unset `WHOP_ENV` (back to the sandbox, so no real charges) or fix the variables and redeploy. No data
migration is involved in either direction.

## 4. Growth on Whop (owner approval, production)

**Affiliates.** The product update API has no affiliate fields, so this is a dashboard step (docs: affiliates/promote-your-business):
Dashboard → Marketing → Affiliates → "Set the affiliate commission for a specific whop" → Global affiliate rate **30%**,
Member affiliate rate **50%** → confirm. Check that both pay on recurring payments, not only the first. Then set
`WHOP_AFFILIATES_ENABLED=1` (and `WHOP_AFFILIATE_MEMBER_PERCENT` / `WHOP_AFFILIATE_GLOBAL_PERCENT` if the rates differ)
so Settings shows "Refer and earn" with the member's link, `https://insidir.com/?a=<username>`. The `a` code is kept
for 30 days and passed to checkout as the affiliate code, so referred buyers stay on insidir.com.

**Marketplace listing.** `npx tsx scripts/whop-growth.ts` prints the headline, description and gallery it would use.
`--apply` uploads the gallery and sets the copy; `--submit` also calls `products.publish`, which sends each product to
Whop's review. Production needs `WHOP_GROWTH_ALLOW_PRODUCTION=1`. Publishing also needs a logo set in the dashboard.

> The images in `qa/screenshots/` come from the end-to-end tests and show seeded "E2E fixture" deals with made-up
> numbers. Don't submit them as the listing gallery: retake the same screens on production with real deals first,
> and replace the files (same names) before `--apply`.
