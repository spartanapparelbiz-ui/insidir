# Insidir X-ray

Paste any Polymarket link, or swap `polymarket.com` for `insidir.com` in the address bar, and see in about three seconds:

1. **Sharp money**: where the top holders with proven track records are positioned, for example "Sharp money: 78% NO".
2. **Insider patterns**: big buys from brand-new wallets in the last 7 days. They are flagged red when the buy was on a long shot.
3. **Last 24 hours**: the net money into each outcome.

It shows data only. It never tells anyone what to bet.

Next.js 15 (App Router, TypeScript, strict mode). Everything is rendered on the server from Polymarket's public APIs, with no API key.

## Run it locally

```bash
cd xray
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests and the orchestrator integration test (fetch is mocked)
npm run build      # production build, including type checking
npm run probe      # live check against Polymarket: see "Checking the live API" below
```

Node 20.9 or newer.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `PAYWALL` | off | Set it to `on` to lock the wallet-level detail for non-members. |
| `MEMBER_TOKEN` | none | The shared secret for the placeholder member check. |
| `WHOP_CHECKOUT_URL` | `https://whop.com/` | Where the "Unlock the full X-ray" button goes. |
| `ASSET_PREFIX` | none | This service's own public origin, for example `https://xray-production.up.railway.app`. Set it when insidir.com forwards only the page paths (see below). |
| `PORT` | 3000 | Set by Railway. |
| `POLYMARKET_GAMMA_URL`, `POLYMARKET_DATA_URL` | Polymarket's hosts | For local testing against a stub server only. Never set these in production. |

### Free and paid

With `PAYWALL=on`, a non-member sees:
- the market itself;
- the sharp money headline and split bar;
- how many insider patterns there are and the highest level;
- the 24h flow headline.

Wallet names, sizes, records and flag details are removed on the server (`lib/access.ts`, `redact()`) before the page renders or `/api/xray` answers. They are never sent to the browser and hidden there.

**The member check is a placeholder.** `/unlock?token=<MEMBER_TOKEN>&next=/event/...` sets an `insidir_member` cookie, and the server compares it with `MEMBER_TOKEN`. Before you charge anyone, replace `isMember()` in `lib/access.ts` with real Whop membership verification: check an active membership server-side and keep the result in a signed session cookie. Every caller goes through that one function.

## Routes

| Path | What it shows |
|---|---|
| `/` | The paste box. |
| `/go?u=<link>` | Reads the link and redirects to the matching page below. |
| `/event/<slug>` | The X-ray when the event has one open market. With several, a list of markets sorted by volume, each linking to `/event/<slug>/<market>`. |
| `/event/<slug>/<market>` | One market's X-ray. |
| `/market/<slug>` | One market's X-ray. |
| `/api/xray?u=<link>` | The X-ray as JSON, for the Chrome extension. It is redacted for non-members exactly like the pages. For an event with several markets, it returns the list instead. |
| `/unlock?token=…` | The placeholder member cookie. |

The link reader (`lib/link.ts`) accepts:
- full links, with or without `www`;
- locale prefixes such as `/es/event/...`;
- query strings and fragments;
- `/market/` links;
- our own domain;
- bare slugs.

## Deploy to Railway

1. In Railway, create a new service from this GitHub repository.
2. In the service settings, set **Root Directory** to `xray`. The repository root holds the main Insidir engine, which deploys as a separate service.
3. Railway detects Next.js. `railway.json` sets the start command (`npm start`, which listens on `$PORT`) and a health check on `/`.
4. Add the variables: `PAYWALL`, `MEMBER_TOKEN` and `WHOP_CHECKOUT_URL`, plus `ASSET_PREFIX` if you use the forwarding set-up below.
5. Deploy. Under Networking, generate a domain to try the service on its own Railway URL first.

The in-memory cache lives in one process. Run one replica, or move the cache to a shared store (see "Moving the cache").

## The domain swap on insidir.com

For `polymarket.com/event/x` → `insidir.com/event/x` to work, insidir.com must send these paths to this service:
- `/event/*` and `/market/*`;
- `/api/xray`;
- `/unlock`;
- `/go`, only when the request has a `u` query parameter.

The Insidir engine reads `/GO` as the ticker GO, so that path needs the `u` check.

Railway has no path routing between services on one domain, so the forwarding happens in one of two places:

- **In the Insidir engine.** This is the simplest option, because the engine already serves insidir.com. Add a forward at the top of its request handler in `src/server.mjs`, before the ticker pages:

  ```js
  const XRAY = process.env.XRAY_ORIGIN; // e.g. https://xray-production.up.railway.app
  const toXray = p => /^\/(event|market)\//.test(p) || p === "/api/xray" || p === "/unlock" || (p === "/go" && url.searchParams.has("u"));
  if (XRAY && toXray(url.pathname)) {
    const r = await fetch(XRAY + url.pathname + url.search, { headers: { cookie: req.headers.cookie || "", "user-agent": req.headers["user-agent"] || "" }, redirect: "manual" });
    res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k))));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  ```

  Set `ASSET_PREFIX` on the X-ray service to its own Railway URL, so `/_next/*` assets load from there and only the page paths go through the engine. Forward the `cookie` header both ways, so `/unlock` works on insidir.com.

- **At the edge.** If insidir.com is behind Cloudflare, a Worker route on `insidir.com/event/*`, `insidir.com/market/*` and the other paths above can forward to the X-ray service with the same rules.

## Tuning

Every threshold is a constant at the top of `lib/score.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `RECORD_POSITIONS` | 50 | Closed positions read per wallet. |
| `SHARP_MIN_DECIDED` | 10 | Minimum wins plus losses for a proven wallet. |
| `SHARP_MIN_WIN_RATE` | 0.55 | Minimum win rate for a proven wallet. |
| `SHARP_MIN_PROFIT_USD` | 1000 | Minimum summed realized profit for a proven wallet. |
| `VERDICT_MIN_WALLETS` | 2 | Proven wallets needed before making a call. |
| `VERDICT_MIN_USD` | 1000 | Dollars those wallets must hold before making a call. |
| `INSIDER_LOOKBACK_HOURS` | 168 | The insider pattern window. |
| `INSIDER_MIN_FILL_USD` | 5000 | Minimum fill size read. |
| `INSIDER_TOP_WALLETS` | 15 | Wallets checked for age. |
| `INSIDER_NEW_WALLET_HOURS` | 72 | A wallet this new at its first buy is flagged. |
| `INSIDER_LONG_SHOT_PRICE` | 0.20 | At or under this average price, the flag is "strong". |
| `INSIDER_FEW_MARKETS` | 3 | At or under this many markets, the "has only traded" reason is added. |
| `FLOW_HOURS` | 24 | The flow window. |
| `FLOW_TRADE_LIMIT` | 3000 | Trades read for the flow window. |
| `FLOW_QUIET_USD` | 1000 | Under this net, the flow reads "Quiet". |

The Method section on every page is written from these constants (`lib/method.ts`), so it changes with them.

Cache times are in `lib/cache.ts` (`TTL`):
- wallet records: 6 hours;
- wallet ages: 6 hours;
- full X-ray: 60 seconds;
- Gamma lookups: 60 seconds.

Wallet calls run at most 8 at a time (`lib/limit.ts`). HTTP timeouts and 429 handling are in `lib/http.ts`: an 8 second timeout, and one retry after `Retry-After`, capped at 3 seconds.

## Resolved markets

A resolved market shows "Resolved: {outcome}" and keeps its verdict, so the page works as a receipt. Two things change, because the final prices are 0 and 1:
- Sharp money compares shares held instead of dollar value.
- The 7-day and 24-hour windows end at the market's end date instead of now.

## Moving the cache

All caching goes through `cached()` and the `CacheStore` interface in `lib/cache.ts`. To move to Supabase:
1. Create a table: `key text primary key, value jsonb, expires_at timestamptz`.
2. Implement `CacheStore.get` and `set` against that table.
3. Call `setCacheStore()` once at start-up, for example from `instrumentation.ts`.

In-flight de-duplication stays in memory.

## Checking the live API

`npm run probe` calls every endpoint the app uses. It prints the response shape it got next to the one the app expects, then X-rays three live markets:
- the busiest open politics event;
- the busiest open sports event;
- a recently resolved one.

`npm run probe -- <link> <link>` X-rays specific links instead.

## Layout

```
app/          routes (pages, /go, /unlock, /api/xray)
components/   XrayView (the X-ray) and TargetPage (X-ray, market list or message)
lib/score.ts  scoring: pure functions, every threshold at the top
lib/xray.ts   the orchestrator: parallel fetches, partial data, 60 s cache
lib/polymarket.ts  API client and defensive readers
lib/link.ts   the link reader
lib/access.ts paywall and redaction (member check placeholder)
test/         vitest
scripts/probe.ts   the live API check
```

Information only. Not financial advice. Insidir is not affiliated with Polymarket. An insider pattern is not proof of insider trading.
