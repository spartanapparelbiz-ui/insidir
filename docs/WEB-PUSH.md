# Insidir Web Push

Insidir supports opt-in browser push alerts for new public SEC Form 4 disclosures involving people or companies that a member follows. These are imported public filings, not real-time trades, and never investment recommendations.

## Live setup
1. Generate one stable VAPID key pair using the pinned web-push package. Command: npx web-push generate-vapid-keys.
2. Store INSIDIR_VAPID_PUBLIC_KEY, INSIDIR_VAPID_PRIVATE_KEY, and INSIDIR_VAPID_SUBJECT=mailto:hello@aethric.llc in the insidir-engine Railway service. Never commit the private key or rotate it casually.
3. Deploy main to Railway. The existing migration routine creates push_preferences, push_subscriptions and push_deliveries.
4. Sign in at https://insidir.com. Visit Dashboard or Alerts and select Enable notifications in the branded invitation; browser permission appears after that click. Account → Phone alerts has the same enable action, per-device disable, preferences and a test.
5. On iPhone, first use Share → Add to Home Screen, launch Insidir from that icon, and then enable phone notifications. Android browsers can subscribe without installing the site.
6. Test the notification, then follow a reporting person or watch a company. When a NEW SEC Form 4 is imported and matches a follow that existed before import, Insidir enqueues a single push per device/accession. Only filings published in the last 3 days are queued. The worker runs once per minute while the service runs.
7. Check that tapping the notification opens the real source-linked filing page and the branded notification icon is shown.

## Routes
GET /v1/me/push/status returns configuration, public key, subscribed device count, and preferences. POST /v1/me/push/subscribe registers a browser subscription. DELETE /v1/me/push/subscription unregisters one device. POST /v1/me/push/preferences updates toggles. POST /v1/me/push/test sends a bounded test (2 per hour).

The database stores encrypted-payload keys and browser endpoint credentials, private to each user. Deleting an account deletes subscriptions and queued pushes. Dead endpoints (404, 410) are removed; failed sends retry at most five times. No native OS prompt is triggered until a user's click.

## Limits
Browser notification permission can be denied, notification delivery can be blocked by device or Focus settings, and SEC imports can be delayed or unavailable. A test accepted by the push provider does not prove display on a user's lock screen. Do not promise instant or guaranteed delivery. Use the same VAPID key pair for all redeploys.