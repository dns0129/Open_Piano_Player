# 琴伴 iOS 应用与 Apple 应用内购买

本目录是可由 XcodeGen 生成的 iPhone／iPad 原生工程，最低 iOS 16。SwiftUI 提供原生导航、连接失败重试和系统文件分享；WKWebView 使用琴伴商业账号服务，保留现有邮箱／密码登录、私有曲库和识谱功能；StoreKit 2 完成 Apple 商品展示、购买、恢复及订阅管理。

代码不会创建开发者账号或 App Store Connect 商品，也不包含签名证书、商户密钥或服务器私钥。首次配置前显示开发配置错误，设备 Release／Archive 会拒绝占位域名、商品及团队信息。网页与 Node 服务的构建仍使用仓库原有命令。

## 1. 在 Mac 生成并打开工程

需要 Xcode（含 iOS SDK、至少一个 iPhone 模拟器）和 XcodeGen。开发者账号尚未开通时，可以先执行无签名模拟器构建。

    brew install xcodegen
    cp ios/Configuration/Local.example.xcconfig ios/Configuration/Local.xcconfig

将 Local.xcconfig 中的公开应用配置替换成实际值，再运行：

    bash ios/generate.sh
    open ios/Qinban.xcodeproj

Local.xcconfig、生成的 Xcode 工程、派生构建文件和本地 StoreKit 文件均不提交。项目规范、Swift 源码、图标、隐私清单和 StoreKit 模板都在版本控制中。

| Xcode 配置项 | 对应服务端／Apple 配置 |
| --- | --- |
| PRODUCT_BUNDLE_IDENTIFIER | 已登记 App ID；必须等于 QINBAN_APPLE_BUNDLE_ID |
| DEVELOPMENT_TEAM | 新申请开发者账号的 Team ID |
| QINBAN_SERVER_HOST | 正式商业服务的 HTTPS 主机名，可带端口；不得带路径 |
| QINBAN_SANDBOX_HOST | 独立 staging 服务的 HTTPS 主机名；与正式服务使用不同主机名、数据库和账号密钥 |
| QINBAN_PRODUCT_LIGHT | QINBAN_APPLE_PRODUCT_LIGHT；自动续期一个月，轻享版 |
| QINBAN_PRODUCT_STANDARD | QINBAN_APPLE_PRODUCT_STANDARD；自动续期一个月，标准版 |
| QINBAN_PRODUCT_PROFESSIONAL | QINBAN_APPLE_PRODUCT_PROFESSIONAL；自动续期一个月，专业版 |
| QINBAN_PRODUCT_TOPUP | QINBAN_APPLE_PRODUCT_TOPUP；消耗型积分包 |

四个商品 ID 必须在 App Store Connect、服务端配置和原生配置中完全一致。三档月会员放入同一个订阅组，并将专业版、标准版、轻享版依次设为等级 1、2、3。不要启用 Family Sharing：本版的权益归属以登录账号的 appAccountToken 为准，不实现共享家庭成员跨账号发放。真实价格、币种、税费、地区和可售状态由 App Store Connect 配置；应用显示 StoreKit 返回的本地化价格。

## 2. 正式、TestFlight 与审核环境

Release 在创建 WKWebView、发送登录请求之前读取并验证 AppTransaction.shared，核对 bundleID，然后依据已验证的 appTransaction.environment 选择服务：

| 原生运行方式 | 选用服务 | 服务器 Apple 环境 |
| --- | --- | --- |
| App Store 正式下载且 AppTransaction 为 Production | QinbanServerOrigin | Production |
| TestFlight／审核沙盒且 AppTransaction 为 Sandbox | QinbanSandboxOrigin | Sandbox |
| Xcode Debug | 固定 QinbanSandboxOrigin | staging Sandbox；本地 StoreKit 签名仍不能在服务器入账 |
| 无法验证／未知环境 | 显示重试，暂不创建网页登录会话 | 不推断、不切到正式服务 |

正式与 staging 必须使用不同主机名；仅更换端口不隔离 Cookie。两边需要独立数据库、会话密钥、存储目录和额度账本。提供给审核人员的琴伴测试账号必须在 staging 注册／开通，不能只在正式库存在。两个 origin 都必须使用有效 HTTPS 证书，本工程不关闭 ATS 或 TLS 验证。

首次启动只读取 AppTransaction.shared。若验证失败，用户点击“重新连接”才调用 AppTransaction.refresh()，此时系统可能要求登录 App Store；重试仍需通过相同的签名、Bundle ID 和环境检查，才创建网页登录会话。

这是在客户端先确定服务目标，服务器仍独立验证每笔交易环境。生产服务不得接受 Sandbox／Xcode 交易；不能仅凭 User-Agent、客户端传入的环境名或已解码但未验签的 JWS 放行。

Apple 官方依据：

- [AppTransaction.shared](https://developer.apple.com/documentation/storekit/apptransaction/shared)：iOS 16 起提供已签名应用交易，可能需要联网且可能抛出错误。
- [AppTransaction.environment](https://developer.apple.com/documentation/storekit/apptransaction/environment)：环境属于已验证交易信息。
- [AppTransaction.refresh()](https://developer.apple.com/documentation/storekit/apptransaction/refresh())：验证失败时显式重试，可能显示 App Store 身份验证提示，因此只响应用户点击。
- [TestFlight 内购](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight)和[审核沙盒配置](https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases)：购买在沙盒运行，不实际扣款。

## 3. 购买与补偿流程

原生桥接通过只读的 window.QinbanNative 提供以下 Promise 方法：

| 方法 | 输入 | 返回 |
| --- | --- | --- |
| getProducts | productIds 字符串数组，最多四个白名单商品 | products 数组：id、displayName、description、displayPrice、type、subscriptionPeriod |
| purchase | productId、服务端提供的 appAccountToken UUID | status 为 success／pending／cancelled；success 同时含 transaction |
| pendingTransactions | 无 | transactions、unverifiedCount；无系统登录弹窗 |
| restore | 无；仅用户点击恢复按钮调用 | AppStore.sync 后返回 transactions、unverifiedCount |
| finishTransaction | transactionId 字符串 | finished 与 transactionId |
| manageSubscriptions | 无 | 打开系统订阅管理页 |
| clearSession | 无；服务端退出／删除成功后调用 | 清理本站 Cookie 和本 App 的 HTTP 缓存；保留 IndexedDB／本地曲谱 |

transaction 包含 signedTransaction（完整 JWS）、transactionId、originalTransactionId、productId，以及 Apple 返回时的 appAccountToken。原生只返回 StoreKit 验证通过且属于白名单商品的交易；服务器依然重新验签并检查应用、环境、商品、用户归属和交易幂等。

付款成功后，网页将 JWS 发送至 POST /api/v1/app-store/transactions。只有服务端确认已持久化、且返回的 transactionId 与请求一致，网页才调用 finishTransaction。网络中断、账号切换、验签失败或错误账号恢复都不会提前结束交易。

原生启动 Transaction.updates 监听，向当前可信主页面发送 qinban:transaction 事件。每次登录或加载支付页还要读取 pendingTransactions，避免页面尚未注册监听时丢失事件。该方法合并 Transaction.currentEntitlements 与 Transaction.unfinished；已完成的消耗型积分包不重新发放，未确认的消耗型交易在重启后仍能补交。

Apple 购买积分的有效期与原有网页扫码套餐不同。本次 Apple 入账积分不设置到期；会员订阅有效期另行记录。取消自动续订不立即撤销已付费期限内会员；退款由服务端通知与补查更新，前端不能自行决定权益。

## 4. 本地 StoreKit 测试

generate.sh 根据公开商品配置生成 StoreKit/Qinban.local.storekit；选中 Qinban-StoreKit-Local scheme 即可使用。模板配置了三个一月自动续期会员和一个消耗型积分包，测试价格仅作演示，不会同步到 App Store Connect。

Xcode 本地交易由 Xcode 签名，**不是真实 Apple 沙盒交易**。服务器拒绝这类交易，因此本地测试可验证商品面板、购买取消、pending、恢复和未完成交易保留，但不能据此宣称已经验证服务器真实入账。不要为方便测试在 HTTP 增加“标记已付款”或跳过验签开关。

需要完整端到端验证时，选 Qinban scheme（没有本地 StoreKit 配置），部署 staging、配置 Apple 沙盒商品和服务器密钥，再使用 Sandbox Apple Account 或 TestFlight。测试成功后仍需验证正式环境配置。

## 5. 自动检查

Linux／Mac 都可以执行桥接契约测试、配置文件检查以及无凭据结构验证：

    node --test ios/bridge.test.mjs
    python3 ios/validate-structure.py
    bash -n ios/generate.sh ios/check.sh ios/validate-release.sh

在安装完整 Xcode 的 Mac 上：

    bash ios/check.sh --test

这会生成工程，编译 Release 与 Debug 的模拟器版本，并运行 XCTest。Release 模拟器构建不要求真实 Team ID；实际设备 Release／Archive 依然运行完整配置检查。XCTest 覆盖精确 origin、恶意近似域名、凭据 URL、沙盒／正式 Cookie 域隔离、桥接协议边界、商品白名单及交易编号格式。

当前云端为 Linux；本轮可以运行结构与 JS 测试，但不能在这个环境执行 Xcode 编译、iPhone 模拟器或真机 StoreKit。Mac／CI 的通过结果要单独记录，不能把结构验证称作原生构建通过。

## 6. 权限、隐私与发布前验收

- 相机用途只用于用户主动拍摄乐谱；相册用途只用于主动选择导入的图片。原生不自动申请麦克风、定位或跟踪权限；网页媒体权限仅允许可信主框架按需请求相机。
- 下载由 WKDownload 保存到应用临时目录，完成后显示系统分享页。文件名去除路径，下载跳转仍必须属于当前可信服务；连续完成的下载依次分享，当前分享关闭后才删除对应临时导出副本。
- 普通外部网页默认不能在应用内导航。显式用户点击的 Apple 支持／法律页面进入系统浏览器；mailto 打开邮件应用。任意外部网页、子框架都不能调用原生付款。
- PrivacyInfo.xcprivacy 声明当前商业服务实际涉及的邮箱、用户标识、购买记录、上传图片／其他乐谱内容、用户反馈和诊断数据用于应用功能，未声明“不收集数据”。原生没有广告／跟踪 SDK，也未使用需理由声明的受限 API；最终仍须按部署后的全部代码和供应商处理方式核对 App Store Connect 隐私答案及隐私政策。
- 真实验收包括：相机与文件导入、音频在用户操作后启动、后台恢复、弱网购买、购买完成后立即关 App、重装恢复、切换琴伴账号、订阅续期／取消／到期／退款、删除账号后的自动续订提示，以及审核测试账号。

App Store 审核关注完整产品价值与实际可用性。原生导航、系统分享和内购代码不等同于保证过审；需用最终服务、内容、截图、支持与隐私页面完成提审。
