#!/usr/bin/env bash
# Captures the landing and the member dashboard at 390 and 1440 px against production-shaped data: a fresh
# terminal_capture_e2e database, the e2e server (qa/e2e/serve.ts) on top of it, the capture seed, four Reads made
# through the real /api/read, then qa/capture/shots.mjs. Needs a built e2e app (E2E_BUILD_ONLY=1 ./qa/e2e/run.sh).
# Run: ./qa/capture/run.sh [outDir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
OUT="${1:-qa/screenshots/skyline}"
DB=postgresql://insidir:insidir@localhost:5432/terminal_capture_e2e
for p in $(pgrep -f "tsx qa/e2e/serv[e]") $(pgrep -f "^next-server"); do kill "$p" || true; done
for _ in $(seq 1 30); do curl -sf localhost:3100/api/health >/dev/null || break; sleep 1; done
psql postgresql://insidir:insidir@localhost:5432/postgres -qc "drop database if exists terminal_capture_e2e" -c "create database terminal_capture_e2e owner insidir"
DATABASE_URL=$DB npx tsx lib/db/migrate.ts
set -a; . qa/e2e/.out/env.sh; set +a
export DATABASE_URL=$DB
E2E_APP_DIR="${E2E_APP_DIR:-${TMPDIR:-/tmp}/insidir-e2e-app}" E2E_DATABASE_URL=$DB nohup npx tsx qa/e2e/serve.ts > qa/e2e/.out/capture-serve.log 2>&1 &
for _ in $(seq 1 90); do curl -sf localhost:3100/api/health >/dev/null && break; sleep 2; done
npx tsx qa/capture/seed.ts
for q in "Chargers vs. Rams" "Senate control 2026" "Chiefs vs. Broncos" "Celtics vs. Magic"; do
  curl -sf -o /dev/null -b "insidir_session=e2e-pro-session-token-0000000000000000" -F "text=$q" localhost:3100/api/read
done
node qa/capture/shots.mjs "$OUT"
