#!/usr/bin/env bash
set -euo pipefail

output_file=${MAINTENANCE_RUN_FILE:?MAINTENANCE_RUN_FILE is required}
workflow=${WORKFLOW:?WORKFLOW is required}
run_id=${RUN_ID:?RUN_ID is required}
branch=${BRANCH:?BRANCH is required}
initial_sha=${INITIAL_SHA:?INITIAL_SHA is required}
final_sha=${FINAL_SHA:?FINAL_SHA is required}
status=${STATUS:?STATUS is required}
parent_run_id=${PARENT_RUN_ID:-}

[[ "$initial_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$final_sha" =~ ^[0-9a-f]{40}$ ]]

if [[ -n "$parent_run_id" ]]; then
  jq -n \
    --arg workflow "$workflow" \
    --arg runId "$run_id" \
    --arg parentRunId "$parent_run_id" \
    --arg branch "$branch" \
    --arg initialSha "$initial_sha" \
    --arg finalSha "$final_sha" \
    --arg status "$status" \
    '{version: 1, workflow: $workflow, runId: $runId, parentRunId: $parentRunId, branch: $branch, initialSha: $initialSha, finalSha: $finalSha, status: $status}' \
    > "$output_file"
else
  jq -n \
    --arg workflow "$workflow" \
    --arg runId "$run_id" \
    --arg branch "$branch" \
    --arg initialSha "$initial_sha" \
    --arg finalSha "$final_sha" \
    --arg status "$status" \
    '{version: 1, workflow: $workflow, runId: $runId, parentRunId: null, branch: $branch, initialSha: $initialSha, finalSha: $finalSha, status: $status}' \
    > "$output_file"
fi
