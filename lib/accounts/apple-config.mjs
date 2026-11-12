// @ts-check
import { readFile } from "node:fs/promises";
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";
import { SUBSCRIPTION_PRODUCTS } from "./subscription-catalog.mjs";

export const APPLE_BILLING_VERSION = "2026-11-12-app-store-v1";

/**
 * Runtime secrets are read only on the server. Xcode/LocalTesting environments
 * are deliberately forbidden: Apple's verifier skips signatures in those modes.
 * Sandbox must use a separate local validation database, never production.
 * @param {{env?: NodeJS.ProcessEnv, profile?: string}} [options]
 */
export async function loadAppleBillingConfiguration({
  env = process.env,
  profile = "local",
} = {}) {
  const names = [
    "BUNDLE_ID",
    "APP_ID",
    "ENVIRONMENT",
    "ROOT_CERT_FILES",
    "KEY_ID",
    "ISSUER_ID",
    "PRIVATE_KEY_FILE",
    "PRODUCT_LIGHT",
    "PRODUCT_STANDARD",
    "PRODUCT_PROFESSIONAL",
    "PRODUCT_TOPUP",
  ];
  if (!names.some((name) => env["QINBAN_APPLE_" + name]))
    return { available: false, environment: null, products: [] };
  const required = names.filter((name) => name !== "APP_ID");
  const missing = required.filter((name) => !env["QINBAN_APPLE_" + name]);
  if (missing.length)
    throw Error("Incomplete App Store configuration: " + missing.join(", "));
  const environment = env.QINBAN_APPLE_ENVIRONMENT;
  if (
    environment !== Environment.PRODUCTION &&
    environment !== Environment.SANDBOX
  )
    throw Error("App Store environment must be Production or Sandbox");
  if (profile === "production" && environment !== Environment.PRODUCTION)
    throw Error(
      "Sandbox App Store transactions cannot fund a production database",
    );
  if (profile === "staging" && environment !== Environment.SANDBOX)
    throw Error("Staging must use the Sandbox App Store environment");
  const appAppleId = Number(env.QINBAN_APPLE_APP_ID);
  if (
    environment === Environment.PRODUCTION &&
    (!Number.isSafeInteger(appAppleId) || appAppleId <= 0)
  )
    throw Error("Production requires a positive numeric QINBAN_APPLE_APP_ID");
  const bundleId = env.QINBAN_APPLE_BUNDLE_ID || "";
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId || ""))
    throw Error("Invalid App Store bundle identifier");
  let paths;
  try {
    paths = JSON.parse(env.QINBAN_APPLE_ROOT_CERT_FILES || "");
  } catch {
    throw Error(
      "QINBAN_APPLE_ROOT_CERT_FILES must be a JSON array of DER certificate paths",
    );
  }
  if (
    !Array.isArray(paths) ||
    paths.length < 1 ||
    paths.length > 5 ||
    paths.some((p) => typeof p !== "string" || !p)
  )
    throw Error("Configure Apple root certificates from Apple's PKI site");
  const products = SUBSCRIPTION_PRODUCTS.map((p) => ({
    id: p.id,
    appleProductId: env["QINBAN_APPLE_PRODUCT_" + p.id.toUpperCase()],
    name: p.name,
    kind: p.kind === "monthly" ? "subscription" : "consumable",
    points: p.points,
    period: p.kind === "monthly" ? "P1M" : null,
  }));
  if (
    products.some(
      (p) => !/^[A-Za-z0-9._-]{1,255}$/.test(p.appleProductId || ""),
    ) ||
    new Set(products.map((p) => p.appleProductId)).size !== products.length
  )
    throw Error("App Store product IDs must be valid and distinct");
  const roots = await Promise.all(paths.map((p) => readFile(p))),
    privateKey = await readFile(
      env.QINBAN_APPLE_PRIVATE_KEY_FILE || "",
      "utf8",
    );
  // Online certificate revocation checks stay enabled in both accepted environments.
  const verifier = new SignedDataVerifier(
    roots,
    true,
    environment,
    bundleId,
    environment === Environment.PRODUCTION ? appAppleId : undefined,
  );
  const api = new AppStoreServerAPIClient(
    privateKey,
    env.QINBAN_APPLE_KEY_ID || "",
    env.QINBAN_APPLE_ISSUER_ID || "",
    bundleId,
    environment,
  );
  return {
    available: true,
    environment,
    bundleId,
    appAppleId,
    products,
    verifier,
    api,
  };
}
