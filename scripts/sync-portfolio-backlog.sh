#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-${CMS_REVALIDATE_SECRET:-}}"

if [[ -z "${SECRET}" ]]; then
  echo "Missing secret. Set CRON_SECRET (or CMS_REVALIDATE_SECRET) in your shell."
  exit 1
fi

curl -sS -X POST "${BASE_URL}/api/cron/cms-portfolio-backlog-sync" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  --data '{"write":true}'

echo
