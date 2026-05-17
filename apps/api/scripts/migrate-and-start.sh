#!/bin/sh
# migrate-and-start.sh — container entrypoint for the omnibus image.
#
# m3.x-app-bootstrap-and-vps-deploy slice §1.9 + ADR-MIGRATE-THEN-START-SCRIPT.
#
# 1. Run pending TypeORM migrations against DATABASE_URL. Fails fast if
#    any migration throws (non-zero exit aborts the container).
# 2. exec node dist/main so PID 1 is the Node process — required for
#    SIGTERM to reach NestJS for graceful shutdown.
#
# The script lives in apps/api/scripts/ in the repo and is COPYed into
# /app/api/scripts/ inside the image (see Dockerfile stage 2).

set -eu

cd "$(dirname "$0")/.."  # /app/api

echo ">> migrate-and-start: applying TypeORM migrations…"
node ./dist/cli/migrate.js

if [ "${DEMO_MODE:-false}" = "true" ]; then
  echo ">> migrate-and-start: DEMO_MODE=true — running seed-demo…"
  node ./dist/cli/seed-demo.js
else
  echo ">> migrate-and-start: DEMO_MODE not set — skipping seed."
fi

echo ">> migrate-and-start: starting NestJS…"
exec node ./dist/main
