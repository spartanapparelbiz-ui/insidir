# iPhone push alerts: manual checklist

Web push on iPhone works only for a site added to the Home Screen (iOS 16.4 or later), and only after a tap asks
for permission. None of this can run in a headless browser, so check it by hand on a real iPhone after each
deploy that touches `public/sw.js`, `components/app/PushButton.tsx`, `components/app/IosInstallGuide.tsx`,
`app/manifest.ts` or `lib/alerts/`.

You need: an iPhone on iOS 16.4+, Safari, a paid test account (Insidir or Pro), and the production site.

## Install

- [ ] Open insidir.com in **Safari** (not Instagram's in-app browser). The "Add Insidir to your Home Screen to get
      instant alerts" guide shows on the landing page and in Settings.
- [ ] In Instagram's in-app browser, the guide tells you to open the page in Safari first (push can't work there).
- [ ] Tap Share → **Add to Home Screen**. The icon is the white "i" mark on black, named "Insidir".
- [ ] Open Insidir from the Home Screen. It opens full screen (no Safari bar) on the Terminal, black status bar.
- [ ] The install guide no longer shows inside the installed app.

## Turn on alerts

- [ ] Sign in (Whop) inside the installed app. You land on the live Terminal.
- [ ] Settings → **Turn on push alerts**. iOS asks "Insidir Would Like to Send You Notifications". Tap Allow.
- [ ] The button changes to "Turn off push on this device".
- [ ] Nothing asked for permission before you tapped.

## Receive one

- [ ] Lock the phone. Within 60 seconds of a new deal (Pro: within seconds), a banner shows:
      "<ROI>% · <deal title>" and "YES on … at …¢ + NO on … at …¢. $… after fees on up to $…, if both sides fill
      and both markets settle the same way."
- [ ] To force one without waiting: in `/admin`, check a deal is live, or ask a teammate to run the worker against
      staging with a fresh deal.
- [ ] No banner ever says "guaranteed" or "risk-free".
- [ ] A US account never gets an alert for an international Polymarket deal.

## Open it

- [ ] Tapping the banner opens the installed app on that deal's page (not Safari).
- [ ] `/admin` → Funnel shows the "alert_opened" step count go up by one.

## Turn off

- [ ] Settings → **Turn off push on this device**. No more banners for new deals.
- [ ] iOS Settings → Notifications → Insidir → off: the app shows push as blocked, with how to turn it back on.

## Email backup

- [ ] With push off, a paid account with email alerts on gets an email for new deals (at most 6 an hour), with a
      working **Unsubscribe** link that needs one tap.
- [ ] Free accounts with "Daily summary" on get one email a day, after 13:00 UTC.
