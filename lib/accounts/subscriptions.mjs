import { fail, id, iso, missing, uuid } from "./common.mjs";
import {
  BILLING_VERSION,
  POINTS_PER_REGION,
  SUBSCRIPTION_PRODUCTS,
  TRIAL_POINTS,
  subscriptionEnd,
  billingDayOf,
} from "./subscription-catalog.mjs";
import { createPointWallet } from "./point-wallet.mjs";
import { safePaymentUrl } from "./payment-gateways.mjs";

export function createSubscriptions({
  db,
  gateways = {},
  now = () => Date.now(),
}) {
  const wallet = createPointWallet({ db, now }),
    date = () => new Date(now()).toISOString();
  function orderView(r) {
    return {
      orderId: r.id,
      orderNo: r.order_no,
      product: r.product,
      provider: r.provider,
      priceFen: r.price_fen,
      state:
        r.state === "pending" && new Date(r.expires_at).getTime() <= now()
          ? "expired"
          : r.state,
      createdAt: iso(r.created_at),
      expiresAt: iso(r.expires_at),
      paidAt: r.paid_at ? iso(r.paid_at) : null,
      checkoutUrl: r.checkout_url,
    };
  }
  async function order(owner, oid) {
    if (!uuid(oid)) throw missing();
    const r = (
      await db.control((tx) =>
        tx.query(
          "SELECT * FROM qinban_control.payment_orders WHERE owner_id=$1 AND id=$2",
          [owner, oid],
        ),
      )
    ).rows[0];
    if (!r) throw missing();
    return r;
  }
  async function accept(provider, payment) {
    if (!payment) return;
    if (
      !payment.transactionId ||
      typeof payment.transactionId !== "string" ||
      payment.transactionId.length > 128 ||
      payment.currency !== "CNY"
    )
      throw fail("PAYMENT_MISMATCH", "支付信息不匹配。", 400);
    return db.control(async (tx) => {
      // Lock account before order, consistently with checkout and all wallet mutations.
      const found = (
        await tx.query(
          "SELECT * FROM qinban_control.payment_orders WHERE order_no=$1",
          [payment.orderNo],
        )
      ).rows[0];
      if (!found) throw missing();
      await wallet.lock(tx, found.owner_id);
      const r = (
        await tx.query(
          "SELECT * FROM qinban_control.payment_orders WHERE id=$1 FOR UPDATE",
          [found.id],
        )
      ).rows[0];
      if (r.provider !== provider || r.price_fen !== payment.amountFen)
        throw fail("PAYMENT_MISMATCH", "支付金额或渠道不匹配。", 400);
      if (r.state === "paid") {
        if (r.transaction_id !== payment.transactionId)
          throw fail("PAYMENT_MISMATCH", "支付流水不匹配。", 400);
        return orderView(r);
      }
      const duplicate = (
        await tx.query(
          "SELECT id FROM qinban_control.payment_orders WHERE provider=$1 AND transaction_id=$2",
          [provider, payment.transactionId],
        )
      ).rows[0];
      if (duplicate) throw fail("PAYMENT_MISMATCH", "支付流水已被使用。", 400);
      const product = r.product;
      let startsAt = date(),
        expiresAt,
        billingDay = null;
      if (product.kind === "monthly") {
        const previous = (
          await tx.query(
            "SELECT expires_at,billing_day FROM qinban_control.point_grants WHERE owner_id=$1 AND kind='monthly' AND expires_at>$2 ORDER BY expires_at DESC LIMIT 1",
            [r.owner_id, date()],
          )
        ).rows[0];
        if (previous) {
          startsAt = iso(previous.expires_at);
          billingDay = previous.billing_day;
        } else billingDay = billingDayOf(startsAt);
        expiresAt = subscriptionEnd(startsAt, billingDay);
      } else
        expiresAt = new Date(
          now() + product.validDays * 86400000,
        ).toISOString();
      await wallet.grant(tx, r.owner_id, {
        key: "order:" + r.id,
        kind: product.kind,
        amount: product.points,
        startsAt,
        expiresAt,
        productId: product.id,
        billingDay,
      });
      await tx.query(
        "UPDATE qinban_control.payment_orders SET state='paid',transaction_id=$1,paid_at=$2 WHERE id=$3",
        [payment.transactionId, date(), r.id],
      );
      return orderView({
        ...r,
        state: "paid",
        transaction_id: payment.transactionId,
        paid_at: date(),
      });
    });
  }
  async function checkout(owner, input, key) {
    const product = SUBSCRIPTION_PRODUCTS.find((p) => p.id === input.productId),
      provider = input.provider;
    if (!product || !["wechat", "alipay"].includes(provider))
      throw fail("INVALID_PRODUCT", "请选择有效的套餐和支付方式。");
    if (typeof key !== "string" || key.length < 16 || key.length > 128)
      throw fail("IDEMPOTENCY_REQUIRED", "操作需要唯一标识。", 428);
    if (!gateways[provider]?.ready)
      throw fail(
        "PAYMENT_UNAVAILABLE",
        "此支付渠道尚未配置，暂不能购买。",
        503,
      );
    const saved = await db.control(async (tx) => {
      await wallet.lock(tx, owner);
      const old = (
        await tx.query(
          "SELECT * FROM qinban_control.payment_orders WHERE owner_id=$1 AND idempotency_key=$2",
          [owner, key],
        )
      ).rows[0];
      if (old) {
        if (old.product.id !== product.id || old.provider !== provider)
          throw fail(
            "IDEMPOTENCY_CONFLICT",
            "订单操作已变化，请重新选择。",
            409,
          );
        return old;
      }
      const count = Number(
        (
          await tx.query(
            "SELECT COUNT(*) AS n FROM qinban_control.payment_orders WHERE owner_id=$1 AND state='pending' AND expires_at>$2",
            [owner, date()],
          )
        ).rows[0].n,
      );
      if (count >= 3)
        throw fail("ORDER_LIMIT", "已有待支付订单，请先查看现有订单。", 429);
      const oid = id(),
        number = oid.replaceAll("-", ""),
        expires = new Date(now() + 30 * 60000).toISOString();
      return (
        await tx.query(
          "INSERT INTO qinban_control.payment_orders(id,order_no,owner_id,idempotency_key,product,provider,price_fen,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            oid,
            number,
            owner,
            key,
            JSON.stringify({ ...product, version: BILLING_VERSION }),
            provider,
            product.priceFen,
            date(),
            expires,
          ],
        )
      ).rows[0];
    });
    if (
      saved.state === "paid" ||
      saved.checkout_url ||
      new Date(saved.expires_at).getTime() <= now()
    )
      return orderView(saved);
    const claimed = (
      await db.control((tx) =>
        tx.query(
          "UPDATE qinban_control.payment_orders SET checked_at=$1 WHERE id=$2 AND state='pending' AND checkout_url IS NULL AND (checked_at IS NULL OR checked_at<$3) RETURNING id",
          [date(), saved.id, new Date(now() - 30000).toISOString()],
        ),
      )
    ).rows.length;
    if (!claimed)
      throw fail("ORDER_BUSY", "支付二维码正在生成，请稍后重试此订单。", 409);
    try {
      const checkoutUrl = safePaymentUrl(
        await gateways[provider].checkout(orderView(saved)),
        provider,
      );
      await db.control((tx) =>
        tx.query(
          "UPDATE qinban_control.payment_orders SET checkout_url=$1 WHERE id=$2",
          [checkoutUrl, saved.id],
        ),
      );
      return orderView({ ...saved, checkout_url: checkoutUrl });
    } catch {
      await db.control((tx) =>
        tx.query(
          "UPDATE qinban_control.payment_orders SET checked_at=NULL WHERE id=$1",
          [saved.id],
        ),
      );
      throw fail(
        "PAYMENT_UNAVAILABLE",
        "支付二维码暂未生成，请重试；相同订单不会重复创建。",
        503,
      );
    }
  }
  async function refresh(owner, oid) {
    let r = await order(owner, oid);
    if (r.state !== "pending") return orderView(r);
    // Owner-scoped, persisted throttle. A failed query must never mark an order paid.
    const claimed = (
      await db.control((tx) =>
        tx.query(
          "UPDATE qinban_control.payment_orders SET checked_at=$1 WHERE id=$2 AND (checked_at IS NULL OR checked_at<$3) RETURNING id",
          [date(), r.id, new Date(now() - 10000).toISOString()],
        ),
      )
    ).rows.length;
    if (claimed && gateways[r.provider]?.ready) {
      try {
        await accept(
          r.provider,
          await gateways[r.provider].query(orderView(r)),
        );
      } catch {
        throw fail(
          "PAYMENT_QUERY_UNAVAILABLE",
          "暂未确认支付结果，请稍后刷新。请勿重复付款。",
          503,
        );
      }
      r = await order(owner, oid);
    }
    return orderView(r);
  }
  return {
    wallet,
    checkout,
    refresh,
    async resume(owner, oid) {
      const r = await order(owner, oid);
      return checkout(
        owner,
        { productId: r.product.id, provider: r.provider },
        r.idempotency_key,
      );
    },
    catalog() {
      return {
        version: BILLING_VERSION,
        currency: "CNY",
        trialPoints: TRIAL_POINTS,
        pointsPerRegion: POINTS_PER_REGION,
        autoRenew: false,
        products: SUBSCRIPTION_PRODUCTS,
        providers: ["wechat", "alipay"].map((p) => ({
          id: p,
          name: p === "wechat" ? "微信支付" : "支付宝",
          available: !!gateways[p]?.ready,
        })),
      };
    },
    async account(owner) {
      return {
        ...(await wallet.account(owner)),
        orders: (
          await db.control((tx) =>
            tx.query(
              "SELECT * FROM qinban_control.payment_orders WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50",
              [owner],
            ),
          )
        ).rows.map(orderView),
      };
    },
    async getOrder(owner, oid) {
      return orderView(await order(owner, oid));
    },
    async operatorOrders() {
      return {
        orders: (
          await db.control((tx) =>
            tx.query(
              "SELECT * FROM qinban_control.payment_orders ORDER BY created_at DESC LIMIT 100",
            ),
          )
        ).rows.map((r) => ({
          ...orderView(r),
          userId: r.owner_id,
          transactionId: r.transaction_id,
        })),
      };
    },
    async notification(provider, headers, raw) {
      if (!gateways[provider]?.ready)
        throw fail("PAYMENT_UNAVAILABLE", "支付渠道未启用。", 503);
      let payment;
      try {
        payment = await gateways[provider].notification(headers, raw);
      } catch {
        throw fail("PAYMENT_VERIFICATION", "支付通知验证失败。", 400);
      }
      return accept(provider, payment);
    },
  };
}
