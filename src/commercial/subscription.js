import { isIOSApp } from "../ios/native.js";

// Fail closed in the App Store build: a missing bridge must not reveal web checkout.
if (isIOSApp()) void import("./subscription-ios.js");
else void import("./subscription-web.js");
