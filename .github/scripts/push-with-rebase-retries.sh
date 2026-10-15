#!/usr/bin/env bash
set -euo pipefail

target_branch=${1:?Usage: push-with-rebase-retries.sh <branch> [attempts]}
max_attempts=${2:-3}

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  if git push origin "HEAD:${target_branch}"; then
    exit 0
  fi
  git fetch origin "$target_branch"
  git rebase "origin/${target_branch}"
done

exit 1
