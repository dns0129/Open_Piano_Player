"""Check iOS resources and public configuration consistency without claiming to compile Swift."""
import json
import plistlib
import re
import struct
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "Qinban/Info.plist").open("rb") as file:
    info = plistlib.load(file)
with (root / "Qinban/PrivacyInfo.xcprivacy").open("rb") as file:
    privacy = plistlib.load(file)
assert info["QinbanServerOrigin"] == "https://$(QINBAN_SERVER_HOST)"
assert info["QinbanSandboxOrigin"] == "https://$(QINBAN_SANDBOX_HOST)"
assert not info.get("NSAppTransportSecurity", {}).get("NSAllowsArbitraryLoads")
assert "NSMicrophoneUsageDescription" not in info
assert set(info["QinbanProducts"]) == {"light", "standard", "professional", "topup"}
assert privacy["NSPrivacyTracking"] is False
assert privacy["NSPrivacyCollectedDataTypes"], "Do not falsely declare no account or uploaded data collection"
assert privacy["NSPrivacyAccessedAPITypes"] == []
assert all(not item["NSPrivacyCollectedDataTypeTracking"] for item in privacy["NSPrivacyCollectedDataTypes"])

settings = dict(re.findall(r"^(QINBAN_PRODUCT_[A-Z]+)\s*=\s*([A-Za-z0-9._-]+)$", (root / "Configuration/App.xcconfig").read_text(), re.M))
fixture = json.loads((root / "StoreKit/Qinban.storekit").read_text())
subscriptions = fixture["subscriptionGroups"][0]["subscriptions"]
assert len(subscriptions) == 3
assert {item["recurringSubscriptionPeriod"] for item in subscriptions} == {"P1M"}
assert all(not item["familyShareable"] for item in subscriptions)
ids = {item["productID"] for item in subscriptions}
ids.add(fixture["products"][0]["productID"])
assert ids == set(settings.values()) and len(ids) == 4
assert fixture["products"][0]["type"] == "Consumable"

image = root / "Qinban/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
data = image.read_bytes()
assert data[:8] == b"\x89PNG\r\n\x1a\n"
assert struct.unpack(">II", data[16:24]) == (1024, 1024)
assert data[25] == 2, "App Store icon must be opaque RGB"
asset = json.loads((image.parent / "Contents.json").read_text())
assert asset["images"][0]["filename"] == image.name
for relative in (
    "Qinban/AppConfiguration.swift", "Qinban/QinbanApp.swift",
    "Qinban/WebAppModel.swift", "Qinban/QinbanStore.swift",
    "Qinban/NativeBridge.js", "QinbanTests/BridgeSecurityTests.swift",
    "project.yml", "README.md", "generate.sh", "check.sh", "validate-release.sh",
):
    assert (root / relative).is_file(), relative
print("iOS plist, privacy, StoreKit fixture, configuration and icon checks passed. Swift compilation and device tests were not performed.")
