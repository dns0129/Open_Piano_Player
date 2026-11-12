import { esc, date, layout, createPage, currentSignInHref } from "./shared.js";
import { nativeBridge, createApplePurchases } from "../ios/native.js";
import "./subscription.css";

const root = document.querySelector("#subscription-app");
const state = {
  catalog: null,
  products: [],
  account: null,
  wallet: null,
  selected: null,
  accepted: false,
  needsSync: false,
  busy: false,
  error: "",
  message: "",
};
const page = createPage(() => {
  Object.assign(state, {
    account: null,
    wallet: null,
    selected: null,
    accepted: false,
    needsSync: false,
  });
  render();
});
const { client } = page;
let bridge;
let purchases;
const $ = (s) => root.querySelector(s);
const statusLabels = {
  active: "订阅生效中",
  expired: "订阅已到期",
  revoked: "权益已撤销",
  grace_period: "续费宽限期",
  grace: "续费宽限期",
  billing_retry: "等待 Apple 完成续费",
  gracePeriod: "续费宽限期",
  billingRetry: "等待 Apple 完成续费",
};

async function reloadAccount(generation = client.epoch) {
  const [account, wallet] = await Promise.all([
    client.json("/app-store/account", { expectedEpoch: generation }),
    client.json("/subscriptions", { expectedEpoch: generation }),
  ]);
  client.checkEpoch(generation);
  state.account = account;
  state.wallet = wallet;
}
async function run(action) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  state.message = "";
  render();
  try {
    await action();
  } catch (error) {
    state.error = error.message;
    if (error.pendingPurchase) {
      state.needsSync = true;
      state.selected = null;
      state.accepted = false;
      state.message =
        "Apple 购买已完成，权益仍待同步。请使用“重新同步权益”，不要再次购买。";
    }
  } finally {
    state.busy = false;
    render();
  }
}
async function load() {
  state.catalog = await client.json("/app-store/catalog");
  await client.initialize();
  if (client.session) await reloadAccount();
  bridge = nativeBridge();
  purchases = createApplePurchases({ client, bridge });
  if (!state.catalog.available) return;
  const result = await bridge.getProducts({
    productIds: state.catalog.products.map((p) => p.appleProductId),
  });
  // Only display products explicitly allowed by both the server and StoreKit.
  state.products = state.catalog.products.flatMap((p) => {
    const store = result.products.find((s) => s.id === p.appleProductId);
    const expected = p.kind === "subscription" ? "autoRenewable" : "consumable";
    const period = store?.subscriptionPeriod;
    if (
      !store ||
      store.type !== expected ||
      (p.kind === "subscription" &&
        (period?.value !== 1 || period?.unit !== "month"))
    )
      return [];
    return [{ ...p, store }];
  });
  if (state.products.length !== state.catalog.products.length)
    state.error =
      "部分商品暂时不可用，请稍后重试。可购买项目以 Apple 返回的商品为准。";
  if (client.session) {
    const pending = await purchases.syncTransactions();
    if (pending.synced) await reloadAccount();
    if (pending.failures.length) state.error = pending.failures.join(" ");
  }
}
function balance() {
  if (!state.wallet) return "";
  const subscription = state.account?.subscription;
  const name = state.catalog?.products.find(
    (p) => p.id === subscription?.productId,
  )?.name;
  return `<section class="subscription-balance" aria-label="我的积分"><div class="commerce-card"><span>当前可用</span><strong>${state.wallet.remaining}</strong>积分</div><div class="commerce-card"><span>识谱处理中</span><strong>${state.wallet.held}</strong>冻结积分</div><div class="commerce-card"><span>Apple 订阅</span><strong>${esc(name || "尚未订阅")}</strong>${subscription ? `${esc(statusLabels[subscription.status] || subscription.status)}<br>本期至 ${date(subscription.expiresAt)}${subscription.autoRenew === false ? "<br>已关闭续订，本期权益保留至到期" : ""}` : "可按需购买订阅或积分包"}</div></section>`;
}
function plans() {
  const opening = `<section class="subscription-intro"><div class="commerce-eyebrow">QINBAN · APP STORE</div><h1>让每一份想练的谱，都有开始。</h1><p>每条完整左右手谱行 5 积分。保存、编辑、播放和练习不消耗识谱积分，识谱前会展示本次需要的积分。</p><p class="commerce-muted">Apple 订阅按月自动续期，每次成功续订发放对应积分。通过 Apple 购买获得的积分不设到期日；订阅有效期与积分余额分别记录。</p></section>`;
  if (!state.catalog.available)
    return (
      opening +
      `<section class="commerce-card commerce-notice"><h2>Apple 购买暂未开放</h2><p>现有账号和曲库仍可使用。商品开放后，可在这里查看 Apple 显示的价格并购买。</p></section>`
    );
  return (
    opening +
    `<div class="subscription-plans">${state.products.map((p) => `<article class="commerce-card subscription-plan ${p.id === "standard" ? "recommended" : ""}"><span class="commerce-tag">${p.kind === "subscription" ? "按月订阅" : "一次购买"}</span><h2>${esc(p.store.displayName)}</h2><p class="subscription-price">${esc(p.store.displayPrice)}<small>${p.kind === "subscription" ? " / 月" : ""}</small></p><p><strong>${p.points.toLocaleString()} 积分${p.kind === "subscription" ? "／每次续订" : ""}</strong><br>可识别 ${p.points / 5} 条完整谱行</p><p class="commerce-muted">${p.kind === "subscription" ? "自动续期，可在 Apple 订阅管理中取消" : "非订阅，积分不设到期日"}</p>${client.session ? `<button data-apple-plan="${esc(p.appleProductId)}" ${state.busy || state.needsSync ? "disabled" : ""}>选择${esc(p.name)}</button>` : `<a class="commerce-button" href="${currentSignInHref()}">登录后购买</a>`}</article>`).join("")}</div>`
  );
}
function checkout() {
  const product = state.products.find(
    (p) => p.appleProductId === state.selected,
  );
  if (!product || !client.session) return "";
  const recurring = product.kind === "subscription";
  return `<section class="commerce-card subscription-checkout" id="apple-checkout"><h2>确认购买 · ${esc(product.store.displayName)}</h2><p>${esc(product.store.displayPrice)}${recurring ? "／月" : ""} · ${product.points} 积分</p>${recurring ? "<p>订阅会自动续期并由 Apple 账户扣费。可在系统订阅管理中更换或取消；取消续订后仍可使用已付费周期内的订阅权益。升级、降级的生效时间与费用以 Apple 确认页为准。</p>" : "<p>这是一次性积分包，不会自动续费。通过 Apple 购买的积分不设到期日。</p>"}<p>本次购买绑定当前琴伴账号 <strong>${esc(client.session.user.email)}</strong>，请确认账号正确。</p><label><input id="apple-consent" type="checkbox" ${state.accepted ? "checked" : ""}>我已阅读<a href="/terms.html">用户协议</a>、<a href="/privacy.html">隐私政策</a>及上述付款说明。</label><p><button data-apple-buy class="primary" ${!state.accepted || state.busy ? "disabled" : ""}>通过 Apple 购买 · ${esc(product.store.displayPrice)}</button></p></section>`;
}
function history() {
  if (!state.wallet) return "";
  const grants = state.wallet.grants.filter(
    (g) =>
      !["expired", "revoked"].includes(g.state) && g.remaining + g.held > 0,
  );
  return `<section class="commerce-card"><h2>积分余额明细</h2>${grants.map((g) => `<article class="commerce-task-row"><div><strong>${g.kind === "apple" ? "Apple 购买" : g.kind === "trial" ? "注册赠送" : "已有积分"} · ${g.remaining} 积分</strong><small>${g.state === "scheduled" ? date(g.startsAt) + " 生效 · " : ""}${g.expiresAt ? date(g.expiresAt) + " 到期" : "不设到期日"}</small></div></article>`).join("") || "<p>暂无可用积分。</p>"}</section>`;
}
function render() {
  root.innerHTML = layout({
    active: "subscription",
    session: client.session,
    ...state,
    body: state.catalog
      ? balance() +
        plans() +
        checkout() +
        `<section class="commerce-card"><h2>管理已购买的权益</h2><div class="commerce-actions"><button data-apple-restore ${!client.session || !purchases || state.busy ? "disabled" : ""}>恢复购买</button><button data-apple-sync ${!client.session || !purchases || state.busy ? "disabled" : ""}>重新同步权益</button><button data-apple-manage ${!bridge || state.busy ? "disabled" : ""}>管理 Apple 订阅</button></div><p class="commerce-muted">恢复购买可能需要 Apple 验证。请登录购买时的琴伴账号。已经到账的积分包会随琴伴账号同步，不会因重复恢复而再次发放。</p><p class="commerce-muted">注销琴伴账号不会自动取消 Apple 订阅；请通过管理入口处理续费。退款申请由 Apple 处理，确认后会同步调整权益。</p></section>` +
        history() +
        `<section class="commerce-card"><h2>识谱与付款说明</h2><p>开始识谱时冻结积分，仅结算完成且通过基础检查的谱行。失败或未开始的部分会释放积分。AI 结果需对照原谱核对，基础检查不代表逐音准确。</p><p><a href="/terms.html">用户协议</a> · <a href="/privacy.html">隐私政策</a> · <a href="/#support">帮助与反馈</a></p></section>`
      : '<p role="status">正在读取 Apple 商品…</p>',
  });
  root.querySelectorAll("[data-apple-plan]").forEach((button) => {
    button.onclick = () => {
      state.selected = button.dataset.applePlan;
      state.accepted = false;
      render();
      $("#apple-checkout")?.scrollIntoView({ behavior: "smooth" });
    };
  });
  $("#apple-consent")?.addEventListener("change", (event) => {
    state.accepted = event.target.checked;
    render();
  });
  $("[data-apple-buy]")?.addEventListener("click", () => {
    if (!state.accepted || !state.selected || !purchases) return;
    void run(async () => {
      const result = await purchases.purchase(state.selected);
      if (result.status === "success") {
        state.selected = null;
        state.accepted = false;
        state.needsSync = true;
        try {
          await reloadAccount();
        } catch (error) {
          error.pendingPurchase = true;
          throw error;
        }
        state.needsSync = false;
        state.message = "购买已确认，权益与积分已同步。";
      } else {
        state.selected = null;
        state.accepted = false;
        state.message =
          result.status === "pending"
            ? "购买正在等待 Apple 批准，完成后会自动同步，请勿重复付款。"
            : "已取消本次购买。";
      }
    });
  });
  $("[data-apple-restore]")?.addEventListener(
    "click",
    () =>
      void run(async () => {
        const result = await purchases.syncTransactions({ restore: true });
        await reloadAccount();
        if (!result.failures.length) state.needsSync = false;
        if (result.failures.length) state.error = result.failures.join(" ");
        state.message = result.synced
          ? "已核对并恢复购买权益。"
          : "已检查购买记录，当前琴伴账号的余额已刷新。";
      }),
  );
  $("[data-apple-sync]")?.addEventListener(
    "click",
    () =>
      void run(async () => {
        const result = await purchases.syncTransactions();
        await client.json("/app-store/sync", { method: "POST", body: {} });
        await reloadAccount();
        if (!result.failures.length) state.needsSync = false;
        if (result.failures.length) state.error = result.failures.join(" ");
        state.message = "已重新查询购买状态。";
      }),
  );
  $("[data-apple-manage]")?.addEventListener(
    "click",
    () => void run(() => bridge.manageSubscriptions()),
  );
}

window.addEventListener("qinban:transaction", (event) => {
  if (!client.session || !purchases) return; // StoreKit keeps it pending for the next sign-in.
  const generation = client.epoch;
  void purchases
    .submit(event.detail, generation)
    .then(async () => {
      await reloadAccount(generation);
      state.needsSync = false;
      state.message = "新的 Apple 购买权益已到账。";
      render();
    })
    .catch((error) => {
      if (generation !== client.epoch) return;
      state.error = error.message;
      render();
    });
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void run(load);
});
void run(load);
