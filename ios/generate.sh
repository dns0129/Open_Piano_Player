#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "需要 XcodeGen。请在 Mac 上运行 brew install xcodegen，再重试。" >&2
  exit 2
fi
python3 configure-storekit.py
xcodegen generate --spec project.yml
