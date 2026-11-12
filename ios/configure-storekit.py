"""Generate a local-only StoreKit fixture using public xcconfig product IDs."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent
settings = {}
for path in (root / "Configuration/App.xcconfig", root / "Configuration/Local.xcconfig"):
    if not path.exists():
        continue
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"\s*(QINBAN_PRODUCT_[A-Z]+)\s*=\s*([A-Za-z0-9._-]+)\s*", line)
        if match:
            settings[match[1]] = match[2]
document = json.loads((root / "StoreKit/Qinban.storekit").read_text())
document["products"][0]["productID"] = settings["QINBAN_PRODUCT_TOPUP"]
for key, subscription in zip(
    ("QINBAN_PRODUCT_LIGHT", "QINBAN_PRODUCT_STANDARD", "QINBAN_PRODUCT_PROFESSIONAL"),
    document["subscriptionGroups"][0]["subscriptions"],
):
    subscription["productID"] = settings[key]
destination = root / "StoreKit/Qinban.local.storekit"
destination.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
print("Prepared local StoreKit fixture. It is not an App Store Connect product configuration.")
