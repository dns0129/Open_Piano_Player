#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import os, re, sys
from urllib.parse import urlsplit

env = os.environ
# Simulator compilation validates the Release Swift branch without a real team.
# Every device Release build / Archive still requires the complete public settings.
if env.get("CONFIGURATION") != "Release" or env.get("PLATFORM_NAME") == "iphonesimulator":
    sys.exit(0)

errors = []
bundle = env.get("PRODUCT_BUNDLE_IDENTIFIER", "")
team = env.get("DEVELOPMENT_TEAM", "")
if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", bundle) or bundle.startswith(("com.example.", "com.yourcompany.")):
    errors.append("PRODUCT_BUNDLE_IDENTIFIER 必须是已登记的应用标识")
if not re.fullmatch(r"[A-Z0-9]{10}", team) or team == "YOURTEAMID":
    errors.append("DEVELOPMENT_TEAM 必须是实际开发者团队 ID")

hosts = []
for key in ("QINBAN_SERVER_HOST", "QINBAN_SANDBOX_HOST"):
    raw = env.get(key, "")
    try:
        parsed = urlsplit("https://" + raw)
        hostname = (parsed.hostname or "").lower()
        if (
            not hostname or parsed.username or parsed.password or parsed.path
            or parsed.query or parsed.fragment or "*" in hostname
            or hostname == "localhost"
            or hostname.endswith((".invalid", ".example", ".test", ".example.com", ".example.org", ".example.net"))
            or hostname in ("example.com", "example.org", "example.net")
            or parsed.port is not None and not 1 <= parsed.port <= 65535
        ):
            raise ValueError()
        hosts.append(hostname)
    except ValueError:
        errors.append(key + " 必须是实际 HTTPS 服务的主机名，可含端口但不可含路径")
if len(hosts) == 2 and hosts[0] == hosts[1]:
    errors.append("正式与沙盒服务必须使用不同主机名以隔离账号 Cookie")
products = []
for key in ("QINBAN_PRODUCT_LIGHT", "QINBAN_PRODUCT_STANDARD", "QINBAN_PRODUCT_PROFESSIONAL", "QINBAN_PRODUCT_TOPUP"):
    value = env.get(key, "")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,200}", value) or value.startswith(("com.example.", "com.yourcompany.")):
        errors.append(key + " 必须与 App Store Connect 和服务端商品映射一致")
    products.append(value)
if len(set(products)) != 4:
    errors.append("四个商品 ID 不可重复")
if errors:
    for error in errors:
        print("error: " + error, file=sys.stderr)
    sys.exit(1)
print("App Store public release configuration validated; service reachability and purchase testing remain separate checks.")
PY
