# 琴伴 iOS：账号、Apple 内购与发布接入

实现日期：2026-11-12。原生工程与 Mac 操作步骤见 [ios/README.md](../ios/README.md)。本文件说明服务器、账号和商品配置。代码测试不代表 Apple 开发者会员、商品审核、正式收款或真机验收已经完成。

## 实现范围

- 保留已有邮箱验证码与密码登录。敏感操作在数据库事务中再次确认会话仍有效；密码重置、退出设备、账号恢复和删除不会依赖旧的客户端身份。没有引入新的社交登录服务。
- 账号页提供立即删除和 30 天可恢复删除，删除前需近期邮箱验证及确认当前邮箱。立即删除先禁止登录，再启动后台清理；清理失败保留待处理状态并由后续任务重试。恢复期内登录只进入恢复页面。
- Apple 商品由 StoreKit 2 获取本地化价格，购买使用服务器分配的 `appAccountToken`。服务器验证 Apple 签名并查询当前交易后提交权益，客户端随后才完成交易。网络中断保留未完成交易，通过重试同步补交，不能自动再次购买。
- Apple 月会员与积分包使用独立交易记录。Apple 获得的积分不设到期日；会员有效期另行记录。网页已有订单继续按原订单快照兑现。
- App Store 版订阅页只展示 Apple 内购。原生桥接异常时不回退到扫码收款；服务器也拒绝原生分发标记的扫码下单与二维码恢复请求。此标记仅选择购买界面，不作为账号或付款凭据。

## 服务器接口

| 接口 | 认证与作用 |
| --- | --- |
| `GET /api/v1/app-store/catalog` | 公开商品映射和是否可用，不含密钥或自行声明的 Apple 售价 |
| `GET /api/v1/app-store/account` | 当前会话；稳定账号 token、订阅和当前账号交易记录 |
| `POST /api/v1/app-store/transactions` | 会话、同源、CSRF、幂等键；只接收 `signedTransaction` 并由服务器决定权益 |
| `POST /api/v1/app-store/sync` | 会话、同源、CSRF、幂等键；查询 Apple 当前交易与订阅状态，30 秒限频 |
| `POST /api/v1/app-store/notifications` | Apple V2 签名通知，无用户会话；只有此专用路径免浏览器 CSRF |
| `GET /api/v1/legal` | 公开运营方与服务提供方信息 |

订单状态不由 URL 跳转或前端“成功”标志决定。重复交易只发放一次积分；重复通知与乱序续订、退款事件不能覆盖较新的状态。退款会撤销对应可用积分，已冻结的退款积分在任务失败时也不会重新变为可用。

## 两个环境及审核流程

准备两个使用不同主机名的 HTTPS 服务：

| 项目 | 沙盒服务 | 正式服务 |
| --- | --- | --- |
| `QINBAN_ACCOUNT_PROFILE` | `staging` | `production` |
| `QINBAN_APPLE_ENVIRONMENT` | `Sandbox` | `Production` |
| 数据库、会话密钥、文件目录 | 独立测试数据 | 正式用户数据 |
| 用户 | 开发、TestFlight、Apple 审核账号 | App Store 正式用户 |

两者均启用 HTTPS、真实事务邮件及受限数据库运行角色。`local` 仅供本机验证，其验证码写入本机邮箱目录，不用于真机互联网测试。

原生 Release 在创建网页和登录之前校验 `AppTransaction`。已验证 Sandbox 版本选择沙盒域名，正式版本选择正式域名；无法验证时提供重试，不猜测环境。数据库首次启用 Apple 内购时绑定环境，不能使用同一个积分库先跑沙盒再切正式。

因此，同一个待提审二进制能够把审核购买连接到独立沙盒服务。审核账号必须在沙盒服务中可登录，服务在审核期间保持可用。不要把正式用户账号或积分复制进沙盒。

## Apple 开发者账号开通后的配置

1. 确定开发者主体、Bundle ID、App Store App ID 和 Team ID；原生与服务器的 Bundle ID 必须一致。
2. 完成 App Store Connect 收费相关协议与收款资料。在同一订阅组建立轻享、标准、专业三个按月自动续期商品，并建立 150 积分消耗品。商品价格由你在 Apple 配置，界面从 StoreKit 获取，不能从网页人民币定价推算 Apple 价格。
3. 将四个真实商品 ID 同时填入服务器 `QINBAN_APPLE_PRODUCT_*` 与原生配置白名单。禁用 Family Sharing：当前实现要求交易属于购买人，并绑定一个琴伴账号。
4. 在服务器私有路径保存 App Store Server API `.p8` 密钥和 Apple 官方根证书。设置 Key ID、Issuer ID、证书路径及环境。私钥永不进入 App、网页、源码或日志。
5. 分别配置 Production 与 Sandbox 的 V2 通知地址：对应域名下 `/api/v1/app-store/notifications`。接通后验证 Apple 测试通知，再验证真实沙盒生命周期。
6. 设置运营方名称、支持邮箱和实际邮件、托管、识谱服务提供方资料。`/privacy.html` 与 `/terms.html` 无需登录可访问；资料不完整时会显示开放前提示，不能据此声称完整上架材料已齐备。

完整变量示例见 [.env.example](../.env.example)。启动脚本不会自动加载 `.env`，使用环境变量或 Node 的 `--env-file` 指定仓库外的私有文件。

```bash
# 使用维护连接应用新增迁移，勿修改已应用的旧迁移。
node --env-file=/private/qinban/production.env scripts/accounts.mjs migrate
npm run commercial:build
node --env-file=/private/qinban/production.env scripts/check-ios-release.mjs
node --env-file=/private/qinban/production.env scripts/accounts.mjs start
```

本次新增迁移为 `0008-accounts-app-store.sql` 与 `0009-accounts-deletion-cleanup.sql`，编号按排序自动发现，允许跳号。现有 `0001` 至 `0006` 内容保持不变。

## 删除与迟到事件

清理会删除身份、私有曲库、上传文件、积分与邀请关联；不能通过同邮箱新注册认领旧交易。随机账号墓碑和已去除用户关联的 Apple 交易标识用于阻止重复领款。网页订单保留必要对账信息并清空支付链接；删除后发生的有效付款记录供商户核对，不重新创建钱包。

同一账号的积分操作、支付入账和清理共用事务锁；文件写入与删除序列化，永久删除标记阻止迟到任务重新写入文件。供应商成本账不会因删账号而归零。

账号删除不会替用户取消 Apple 自动续订；账号页提供系统管理入口，同时保留直接删除选项，不要求先联系人工客服。

## 验收边界

仓库包含账本、账户生命周期、HTTP 权限、网页购买交互和原生工程验证。Linux 能运行 Node/PGlite、网页构建及浏览器测试；iOS 模拟器编译与 XCTest 需要 Mac/Xcode，`.github/workflows/ios.yml` 提供独立验证。

真实环境仍需走通：验证码邮件、密码找回、换设备登录、Apple 首购、用户取消、待批准、后台完成、网络中断补交、恢复、自动续期、取消续订、退款与退款撤回、账号切换、删除后的通知及重新安装。

Xcode 本地 `.storekit` 产生的测试交易不由 Apple 服务器签名，服务器不会接受它们发放真实积分；本地文件用于原生界面和 StoreKit 测试。真正的跨端入账需 Apple Sandbox。

官方依据：[StoreKit 测试](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode)、[App Store Server Library](https://developer.apple.com/documentation/appstoreserverapi/simplifying-your-implementation-by-using-the-app-store-server-library)、[AppTransaction](https://developer.apple.com/documentation/storekit/apptransaction)、[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)。
