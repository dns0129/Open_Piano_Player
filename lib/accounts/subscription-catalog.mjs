// Prices are integer CNY fen; points and price versions are snapshotted on orders.
export const BILLING_VERSION = "2026-10-28-v1";
export const POINTS_PER_REGION = 5;
export const TRIAL_POINTS = 30;
export const SUBSCRIPTION_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "light",
    name: "轻享版",
    kind: "monthly",
    priceFen: 2900,
    points: 300,
  }),
  Object.freeze({
    id: "standard",
    name: "标准版",
    kind: "monthly",
    priceFen: 5900,
    points: 800,
    recommended: true,
  }),
  Object.freeze({
    id: "professional",
    name: "专业版",
    kind: "monthly",
    priceFen: 12900,
    points: 2000,
  }),
  Object.freeze({
    id: "topup",
    name: "补充积分包",
    kind: "topup",
    priceFen: 1900,
    points: 150,
    validDays: 180,
  }),
]);

// Hong Kong is UTC+8 without DST. Keep the original billing day across short months.
export function subscriptionEnd(start, billingDay) {
  const d = new Date(new Date(start).getTime() + 8 * 3600000);
  const year = d.getUTCFullYear(),
    month = d.getUTCMonth() + 1;
  const day = Math.min(
    billingDay ?? d.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ) -
      8 * 3600000,
  ).toISOString();
}

export const billingDayOf = (date) =>
  new Date(new Date(date).getTime() + 8 * 3600000).getUTCDate();
