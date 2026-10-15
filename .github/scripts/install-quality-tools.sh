#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=../quality/tool-versions.env
# shellcheck disable=SC1091
source .github/quality/tool-versions.env

tools_root=$(realpath -m "${QUALITY_TOOLS_DIR:-.tmp/quality-tools}")
bin_dir="$tools_root/bin"
mkdir -p "$bin_dir"

install_shellcheck() {
  local archive="shellcheck-v${SHELLCHECK_VERSION}.linux.x86_64.tar.xz"
  curl --fail --silent --show-error --location \
    "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/${archive}" \
    | tar -xJ -C "$tools_root"
  cp "$tools_root/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "$bin_dir/shellcheck"
}

install_hurl() {
  local archive="hurl-${HURL_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
  curl --fail --silent --show-error --location \
    "https://github.com/Orange-OpenSource/hurl/releases/download/${HURL_VERSION}/${archive}" \
    | tar -xz -C "$tools_root"
  cp "$tools_root/hurl-${HURL_VERSION}-x86_64-unknown-linux-gnu/bin/hurl" "$bin_dir/hurl"
}

install_trivy() {
  local archive="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
  curl --fail --silent --show-error --location \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${archive}" \
    | tar -xz -C "$tools_root"
  cp "$tools_root/trivy" "$bin_dir/trivy"
}

install_lighthouse() {
  npm install --global --prefix "$tools_root/node" \
    "lighthouse@${LIGHTHOUSE_VERSION}" --no-audit --no-fund
  ln -sf "$tools_root/node/bin/lighthouse" "$bin_dir/lighthouse"
}

if (($# == 0)); then
  requested_tools=(shellcheck hurl trivy lighthouse)
else
  requested_tools=("$@")
fi

for tool in "${requested_tools[@]}"; do
  case "$tool" in
    shellcheck) install_shellcheck ;;
    hurl) install_hurl ;;
    trivy) install_trivy ;;
    lighthouse) install_lighthouse ;;
    *)
      echo "Unknown quality tool: $tool" >&2
      exit 2
      ;;
  esac
done

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$bin_dir" >> "$GITHUB_PATH"
fi
