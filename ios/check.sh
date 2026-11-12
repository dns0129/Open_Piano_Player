#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(uname -s)" != "Darwin" ]] || ! command -v xcodebuild >/dev/null 2>&1; then
  echo "原生 iOS 构建需要安装 Xcode 的 Mac；当前环境未执行 Swift 编译或模拟器测试。" >&2
  exit 2
fi
bash generate.sh
xcodebuild -project Qinban.xcodeproj -scheme Qinban -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Qinban.xcodeproj -scheme Qinban -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build-for-testing
if [[ "$*" == *"--test"* ]]; then
  qinban_simulator="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for k,vs in d["devices"].items() if "iOS" in k for v in vs if v.get("isAvailable") and "iPhone" in v["name"]]; print(ids[0] if ids else "")')"
  if [[ -z "$qinban_simulator" ]]; then
    echo "未找到可用 iPhone 模拟器；请在 Xcode 安装 iOS Simulator runtime。" >&2
    exit 2
  fi
  xcodebuild -project Qinban.xcodeproj -scheme Qinban -configuration Debug \
    -destination "id=$qinban_simulator" -derivedDataPath DerivedData \
    CODE_SIGNING_ALLOWED=NO test-without-building
fi
