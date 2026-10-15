#!/usr/bin/env bash
set -euo pipefail

chain_file=${1:?Usage: resolve-parent-context.sh <maintenance-run.json>}
output_file=${GITHUB_OUTPUT:?GITHUB_OUTPUT must point to a writable output file}

final_sha=$(jq -er '.finalSha | select(test("^[0-9a-f]{40}$"))' "$chain_file")
branch=$(jq -er '.branch | select(type == "string" and length > 0)' "$chain_file")

printf 'final_sha=%s\n' "$final_sha" >> "$output_file"
printf 'branch=%s\n' "$branch" >> "$output_file"
