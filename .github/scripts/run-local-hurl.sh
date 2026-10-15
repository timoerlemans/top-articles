#!/usr/bin/env bash
set -euo pipefail

port=${HURL_PORT:-4173}
base_url=${HURL_BASE_URL:-http://127.0.0.1:${port}}

command -v hurl >/dev/null || {
  echo "hurl is required; install the pinned version from .github/quality/tool-versions.env" >&2
  exit 127
}
command -v curl >/dev/null || {
  echo "curl is required to wait for the local static server" >&2
  exit 127
}

npm run compile
python3 -m http.server "$port" --bind 127.0.0.1 >/tmp/top-articles-http-server.log 2>&1 &
server_pid=$!

# shellcheck disable=SC2329 # invoked indirectly by EXIT trap
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in {1..30}; do
  if curl --silent --fail --max-time 1 "$base_url/" >/dev/null; then
    exec hurl --test --variable "base_url=$base_url" quality/hurl/site.hurl
  fi
  sleep 1
done

echo "The local static server did not become ready at $base_url" >&2
exit 1
