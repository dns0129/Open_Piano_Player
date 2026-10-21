#!/bin/bash
set -e
cd "$(dirname "$0")"
QINBAN_ACCOUNT_NODE=""
for candidate in "$(command -v node || true)" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node; do
  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22 || (a===22&&b>=19)?0:1)' 2>/dev/null; then
    QINBAN_ACCOUNT_NODE="$candidate"
    break
  fi
done
if [ -z "$QINBAN_ACCOUNT_NODE" ]; then
  echo "账号版需要 Node.js 22.19 或更新版本。"
  exit 1
fi
export PATH="$(dirname "$QINBAN_ACCOUNT_NODE"):$PATH"
if ! "$QINBAN_ACCOUNT_NODE" -e 'require.resolve("@electric-sql/pglite");require.resolve("sharp");require.resolve("nodemailer")' >/dev/null 2>&1; then
  npm ci --ignore-scripts --cache=.local/npm-cache
fi
echo "正在构建账号版…"
"$QINBAN_ACCOUNT_NODE" scripts/prepare-assets.mjs
VITE_HOSTED_SITE=1 "$QINBAN_ACCOUNT_NODE" node_modules/vite/bin/vite.js build --outDir dist-hosted
exec "$QINBAN_ACCOUNT_NODE" scripts/accounts.mjs start
