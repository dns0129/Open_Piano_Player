#!/bin/bash
set -e
cd "$(dirname "$0")"
QINBAN_NODE=""
for candidate in "$(command -v node || true)" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node; do
  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22 || (a===22&&b>=19)?0:1)' 2>/dev/null; then
    QINBAN_NODE="$candidate"
    break
  fi
done
if [ -z "$QINBAN_NODE" ]; then
  echo "琴伴需要 Node.js 22.19 或更新版本，请安装后重新启动。"
  read -r -p "按回车关闭…"
  exit 1
fi
export PATH="$(dirname "$QINBAN_NODE"):$PATH"
if [ ! -d node_modules ] || ! "$QINBAN_NODE" -e 'require.resolve("@spotify/basic-pitch");require.resolve("@tensorflow/tfjs-backend-wasm")' >/dev/null 2>&1; then
  echo "正在安装或补齐琴伴依赖…"
  npm install --ignore-scripts --registry=https://registry.npmjs.org --cache=.local/npm-cache
fi
echo "正在准备琴伴钢琴练习室…"
"$QINBAN_NODE" scripts/prepare-assets.mjs
"$QINBAN_NODE" node_modules/vite/bin/vite.js build
exec "$QINBAN_NODE" scripts/launch.mjs
