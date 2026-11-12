import QRCode from "qrcode";
import { esc, date, layout, createPage, currentSignInHref } from "./shared.js";
import "./subscription.css";

const root = document.querySelector("#subscription-app");
const state = {
  catalog: null,
  account: null,
  selected: null,
  provider: "",
  accepted: false,
  key: crypto.randomUUID(),
  order: null,
  qr: "",
  busy: false,
  error: "",
  message: "",
};
let timer;
const page = createPage(() => {
  Object.assign(state, {
    account: null,
    selected: null,
    order: null,
    qr: "",
    accepted: false,
    key: crypto.randomUUID(),
  });
  clearTimeout(timer);
  render();
});
const { client } = page;
const $ = (s) => root.querySelector(s);
const yuan = (n) => "¥" + (n / 100).toFixed(2).replace(/\.00$/, "");
const labels = {
  pending: "待支付",
  expired: "二维码已过期",
  paid: "支付成功",
  trial: "注册赠送",
  monthly: "月订阅",
  topup: "补充积分",
  invite: "邀请奖励",
  legacy: "旧奖励转换",
  compensation: "运营补偿",
  reserve: "冻结积分",
  settle: "结算返还",
};
async function run(fn) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    await fn();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.busy = false;
    render();
    schedule();
  }
}
async function load() {
  state.catalog = await client.json("/subscriptions/catalog");
  await client.initialize();
  if (!client.session) return;
  state.account = await client.json("/subscriptions");
  const selected = new URL(location.href).searchParams.get("order");
  if (selected)
    await showOrder(
      await client.json(
        "/subscriptions/orders/" + encodeURIComponent(selected),
      ),
    );
}
async function showOrder(order) {
  state.order = order;
  state.qr = "";
  if (order.state === "pending" && order.checkoutUrl)
    state.qr =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        await QRCode.toString(order.checkoutUrl, {
          type: "svg",
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      );
  const url = new URL(location.href);
  url.searchParams.set("order", order.orderId);
  history.replaceState(null, "", url);
}
async function refresh() {
  if (!state.order) return;
  const order = await client.json(
    "/subscriptions/orders/" + state.order.orderId + "/refresh",
    { method: "POST", body: {} },
  );
  if (order.state !== state.order.state) await showOrder(order);
  if (order.state === "paid") {
    state.account = await client.json("/subscriptions");
    state.message =
      "支付成功，订阅权益与积分已入账。续订的下期积分在下个周期生效。";
  }
}
function schedule() {
  clearTimeout(timer);
  if (state.order?.state === "pending")
    timer = setTimeout(() => {
      if (!document.hidden && !state.busy) void run(refresh);
      else schedule();
    }, 12000);
}
function plans() {
  const c = state.catalog;
  return `<section class="subscription-intro"><div class="commerce-eyebrow">QINBAN MEMBERSHIP</div><h1>把识谱额度，留给想练的曲子。</h1><p>每条完整左右手谱行 ${c.pointsPerRegion} 积分。先看清消耗，再开始识别。所有套餐使用相同识别质量，保存、编辑和练习不消耗识谱积分。</p><p class="commerce-muted">首次登录赠送 ${c.trialPoints} 积分。月订阅按生效日计算周期，当期积分到期不累计。按月购买，到期手动续费，不自动扣款。</p></section><div class="subscription-plans">${c.products
    .filter((p) => p.kind === "monthly")
    .map(
      (p) =>
        `<article class="commerce-card subscription-plan ${p.recommended ? "recommended" : ""}"><span class="commerce-tag">${p.recommended ? "推荐 · 日常练琴" : p.id === "light" ? "偶尔识谱" : "更多曲谱"}</span><h2>${esc(p.name)}</h2><p class="subscription-price">${yuan(p.priceFen)}<small> / 月</small></p><p><strong>${p.points.toLocaleString()} 积分／月</strong><br>可识别 ${p.points / c.pointsPerRegion} 条完整谱行</p><p class="commerce-muted">约 ${Math.floor(p.points / c.pointsPerRegion / 5)} 页（按每页 5 行估算）</p>${client.session ? `<button data-plan="${p.id}" class="${p.recommended ? "primary" : ""}" ${state.busy ? "disabled" : ""}>选择${esc(p.name)}</button>` : `<a class="commerce-button ${p.recommended ? "primary" : ""}" href="${currentSignInHref("register")}">登录或注册后选择</a>`}</article>`,
    )
    .join(
      "",
    )}</div><section class="commerce-card"><h2>临时多识几份谱</h2><p>补充包 ${yuan(c.products.find((p) => p.id === "topup").priceFen)}／150 积分，支付后立即到账，有效期 180 天。优先消耗最早到期的积分。</p>${client.session ? '<button data-plan="topup">购买补充积分包</button>' : ""}</section>`;
}
function account() {
  const a = state.account;
  if (!a) return "";
  const current = state.catalog.products.find(
    (p) => p.id === a.subscription?.productId,
  );
  return `<section class="subscription-balance" aria-label="我的积分"><div class="commerce-card"><span>当前可用</span><strong>${a.remaining}</strong>积分</div><div class="commerce-card"><span>识谱处理中</span><strong>${a.held}</strong>冻结积分</div><div class="commerce-card"><span>当前订阅</span><strong>${esc(current?.name || "免费体验")}</strong>${a.subscription ? "本期至 " + date(a.subscription.expiresAt) : "选择套餐可增加识谱积分"}</div></section><section class="commerce-card"><h2>积分有效期</h2>${
    a.grants
      .filter((g) => g.state !== "expired" && g.remaining + g.held > 0)
      .map(
        (g) =>
          `<article class="commerce-task-row"><div><strong>${esc(labels[g.kind] || g.kind)} · ${g.remaining} 积分${g.held ? "，冻结 " + g.held : ""}</strong><small>${g.state === "scheduled" ? date(g.startsAt) + " 生效 · " : ""}${g.expiresAt ? date(g.expiresAt) + " 到期" : "长期有效"}</small></div></article>`,
      )
      .join("") || "<p>暂无可用积分。</p>"
  }</section>`;
}
function checkout() {
  const p = state.catalog.products.find((p) => p.id === state.selected);
  if (!p || !client.session) return "";
  const channels = state.catalog.providers,
    available = channels.some((p) => p.available);
  return `<section class="commerce-card subscription-checkout" id="checkout"><h2>确认购买 · ${esc(p.name)}</h2><p>${yuan(p.priceFen)} · ${p.points} 积分${p.kind === "monthly" ? "／一个月周期" : "／有效期 180 天"}</p>${p.kind === "monthly" && state.account?.grants.some((g) => g.kind === "monthly" && g.state !== "expired") ? '<p class="commerce-notice">已有有效订阅，本次购买将在已购周期结束后生效。更换套餐也从下个未购买周期开始，不会覆盖当前积分。</p>' : ""}<form data-checkout><fieldset class="subscription-providers"><legend>支付方式</legend>${channels.map((c) => `<label><input type="radio" name="provider" value="${c.id}" ${state.provider === c.id ? "checked" : ""} ${c.available ? "" : "disabled"} required>${esc(c.name)}${c.available ? "" : "（暂未开通）"}</label>`).join("")}</fieldset>${!available ? '<p class="commerce-notice">支付暂未开通，请联系页面“帮助与反馈”中的支持人员。</p>' : ""}<label><input id="billing-accepted" type="checkbox" ${state.accepted ? "checked" : ""} required>我已阅读积分规则，确认${p.kind === "monthly" ? "按月购买、不自动扣款，月度积分当期有效" : "积分包有效期 180 天"}。</label><button class="primary" type="submit" ${!available || !state.accepted || !state.provider || state.busy ? "disabled" : ""}>确认并生成支付二维码 · ${yuan(p.priceFen)}</button></form></section>`;
}
function payment() {
  const o = state.order;
  if (!o) return "";
  return `<section class="commerce-card subscription-payment" id="payment"><h2>${esc(labels[o.state] || o.state)}</h2><p>${esc(o.product.name)} · ${yuan(o.priceFen)} · ${o.provider === "wechat" ? "微信支付" : "支付宝"}</p><code>订单号：${esc(o.orderNo)}</code>${o.state === "pending" ? `${state.qr ? `<img class="subscription-qr" src="${state.qr}" alt="${o.provider === "wechat" ? "微信" : "支付宝"}支付二维码"><p>请使用${o.provider === "wechat" ? "微信" : "支付宝"}扫码。手机可截图后，在支付 App 中从相册识别二维码。</p>` : "<p>此订单的二维码尚未生成，可继续使用同一订单重试。</p><button data-resume-order>重新生成此订单二维码</button>"}<p>二维码有效期至 ${date(o.expiresAt)}。支付后会自动检查结果。</p><button data-refresh-order ${state.busy ? "disabled" : ""}>我已支付，检查结果</button>` : o.state === "paid" ? '<p>权益已入账，可在积分有效期中查看生效时间。</p><a class="commerce-button primary" href="/recognition.html">去上传识谱</a>' : "<p>请重新选择套餐生成新二维码；如已付款，请检查支付结果，勿重复付款。</p><button data-refresh-order>检查支付结果</button>"}</section>`;
}
function historyPanel() {
  const a = state.account;
  if (!a) return "";
  return `<section class="commerce-card"><h2>我的订单</h2>${a.orders.map((o) => `<article class="commerce-task-row"><div><strong>${esc(o.product.name)} · ${yuan(o.priceFen)} · ${esc(labels[o.state] || o.state)}</strong><small>${date(o.createdAt)} · ${esc(o.orderNo)}</small></div><button data-order="${o.orderId}">查看订单</button></article>`).join("") || "<p>还没有购买订单。</p>"}</section><section class="commerce-card"><h2>最近积分记录</h2>${a.events.map((e) => `<article class="commerce-task-row"><span>${esc(labels[e.kind] || e.kind)}<small class="commerce-muted"> · ${date(e.createdAt)}</small></span><strong>${e.amount > 0 ? "+" : ""}${e.amount}</strong></article>`).join("") || "<p>暂无积分记录。</p>"}<p class="commerce-muted">冻结先扣除可用余额，结算时返还失败行积分；成功行消耗包含在原冻结记录中。</p></section>`;
}
function rules() {
  return `<section class="commerce-card subscription-rules"><h2>识谱积分规则</h2><ul><li>完整左右手谱行为一个计费单位，每行 ${state.catalog.pointsPerRegion} 积分。开始前确认所选行数和总积分。</li><li>提交时冻结，结束后只结算返回完整且通过基础检查的谱行；失败、未开始或取消的未成功行释放冻结。</li><li>系统内部补救不额外扣分。主动重新识别时再次确认费用，复用的成功行不重复扣分。</li><li>冻结跨过到期日后返还的积分沿用原有效期，不延长。积分有效期以此页显示为准。</li><li>月度积分当期有效，不累计；续订提前购买的下期积分，到下期才可用。到期后已保存的谱仍可编辑、播放和练习。</li><li>AI 结果需对照原谱核对，基础检查不代表逐音准确。错识或支付问题可通过帮助与反馈联系支持人员。</li></ul><a href="/#support">帮助与反馈</a></section>`;
}
function render() {
  root.innerHTML = layout({
    active: "subscription",
    session: client.session,
    ...state,
    body: state.catalog
      ? account() + plans() + checkout() + payment() + historyPanel() + rules()
      : '<p role="status">正在读取订阅信息…</p>',
  });
  root.querySelectorAll("[data-plan]").forEach(
    (b) =>
      (b.onclick = () => {
        state.selected = b.dataset.plan;
        state.accepted = false;
        state.key = crypto.randomUUID();
        state.provider =
          state.catalog.providers.find((p) => p.available)?.id || "";
        render();
        $("#checkout")?.scrollIntoView({ behavior: "smooth" });
      }),
  );
  $("#billing-accepted")?.addEventListener("change", (e) => {
    state.accepted = e.target.checked;
    render();
  });
  root.querySelectorAll("[name=provider]").forEach((el) =>
    el.addEventListener("change", (e) => {
      state.provider = e.target.value;
      state.key = crypto.randomUUID();
      render();
    }),
  );
  $("[data-checkout]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.accepted || !state.provider) return;
    void run(async () => {
      const order = await client.json("/subscriptions/orders", {
        method: "POST",
        key: state.key,
        body: { productId: state.selected, provider: state.provider },
      });
      await showOrder(order);
      state.account = await client.json("/subscriptions");
      if (order.state === "expired") state.key = crypto.randomUUID();
    });
  });
  $("[data-resume-order]")?.addEventListener(
    "click",
    () =>
      void run(async () => {
        await showOrder(
          await client.json(
            "/subscriptions/orders/" + state.order.orderId + "/checkout",
            { method: "POST", body: {} },
          ),
        );
      }),
  );
  $("[data-refresh-order]")?.addEventListener("click", () => void run(refresh));
  root.querySelectorAll("[data-order]").forEach(
    (b) =>
      (b.onclick = () =>
        void run(async () => {
          await showOrder(
            await client.json("/subscriptions/orders/" + b.dataset.order),
          );
        })),
  );
}
window.addEventListener("pagehide", () => clearTimeout(timer));
window.addEventListener("pageshow", (e) => {
  if (e.persisted) void run(load);
});
void run(load);
