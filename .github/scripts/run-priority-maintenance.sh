#!/usr/bin/env bash
set -euo pipefail

plan_file=${1:?Usage: run-priority-maintenance.sh <plan-file> <report-file>}
report_file=${2:?Usage: run-priority-maintenance.sh <plan-file> <report-file>}
max_attempts=${MAX_ATTEMPTS:-5}

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  confirmations=$(jq -r '[.stages[] | select(.mutations == true and (.confirmationRequired // true) == true) | "\(.stage)=\(.planHash)"] | join(",")' "$plan_file")
  if [[ -n "$confirmations" ]]; then
    npm run readwise:priority-sync -- apply --through priority --plan "$plan_file" --confirm "$confirmations" --report "$report_file"
  else
    npm run readwise:priority-sync -- apply --through priority --plan "$plan_file" --report "$report_file"
  fi

  status=$(jq -r '.status' "$report_file")
  if [[ "$status" == "verified" ]]; then
    exit 0
  fi
  if [[ "$status" != "awaiting-confirmation" ]]; then
    echo "Maintenance stopte met status: $status" >&2
    exit 1
  fi
  echo "Maintenance werd opnieuw gepland na een upstream-mutatie (ronde $attempt)."
done

echo "Maintenance vereiste meer dan $max_attempts replanningrondes." >&2
exit 1
