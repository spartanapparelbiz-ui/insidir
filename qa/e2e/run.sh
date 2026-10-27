#!/usr/bin/env bash
# End-to-end run: builds a copy of the repo (so the working tree's .next is never touched) with the e2e environment,
# then runs Playwright against it. Needs local Postgres with the e2e database (E2E_DATABASE_URL) migrated.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${E2E_APP_DIR:-${TMPDIR:-/tmp}/insidir-e2e-app}"
OUT="$ROOT/qa/e2e/.out"
mkdir -p "$OUT" "$APP" "$ROOT/qa/screenshots"

# Self-signed certificate for the stand-in push service (test only).
if [ ! -f "$OUT/push-cert.pem" ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -keyout "$OUT/push-key.pem" -out "$OUT/push-cert.pem" 2>/dev/null
fi

if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  find "$APP" -mindepth 1 -maxdepth 1 ! -name .next -exec rm -rf {} +
  tar -C "$ROOT" --exclude=./node_modules --exclude=./.next --exclude=./qa --exclude=./.git --exclude=./xray --exclude=./.cache -cf - . | tar -C "$APP" -xf -
  ln -sfn "$ROOT/node_modules" "$APP/node_modules"
  ( cd "$ROOT" && npx tsx -e 'import { SERVER_ENV } from "./qa/e2e/env"; for (const [k, v] of Object.entries(SERVER_ENV)) console.log(`export ${k}=${JSON.stringify(v)}`)' ) > "$OUT/env.sh"
  ( set -a; . "$OUT/env.sh"; cd "$APP" && npx next build >"$OUT/build.log" 2>&1 ) || { tail -40 "$OUT/build.log"; exit 1; }
fi

[ "${E2E_BUILD_ONLY:-0}" = "1" ] && exit 0

cd "$ROOT"
if [ -z "${PW_CHROMIUM:-}" ] && [ -x /opt/pw-browsers/chromium ]; then export PW_CHROMIUM=/opt/pw-browsers/chromium; fi
E2E_APP_DIR="$APP" npx playwright test -c qa/e2e/playwright.config.ts "$@"
