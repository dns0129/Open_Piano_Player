# 琴伴登录页与密码登录（2026-10-28）

按用户提供的设计图实现 `account.html`：桌面 56.25% / 43.75% 左右分栏，暖色钢琴摄影、宋体标题、墨绿色按钮；手机显示紧凑场景标题与单列表单。登录后的账号与私有曲库面板保留。

## 使用流程

- 默认密码登录，账号标识为邮箱（现有服务不支持手机号）。可切换至原有邮箱验证码登录。
- 新注册：填写邮箱与可选邀请码 → 邮箱验证码 → 设置并确认 12–128 字符密码 → 完成注册。封闭注册时邀请码必填。
- 忘记密码／旧账号首次设置密码：填写已注册邮箱 → 获取用途为 `password` 的 8 位验证码 → 设置并确认新密码 → 自动登录。未知邮箱仍收到相同的接口响应，服务不发送邮件、不创建账号。
- 验证码可用 10 分钟，重发等待 60 秒；原来的邀请码、注销等待期恢复、登录后返回来源页面等行为保留。
- 重置密码时撤销该账号全部旧会话与未使用验证码，防止旧密码的并发登录在重置后留下有效会话。重置验证码只可提交至密码重置接口。
- 密码只在页面内存和 HTTPS 请求中使用，不写入浏览器存储。服务端使用随机盐和 scrypt（N=32768, r=8, p=3，64 字节输出）；哈希表只授权身份服务。参考 [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。
- 密码登录对邮箱与来源 IP 分别限制尝试次数，并限制并发哈希数。登录失败统一提示“邮箱或密码不正确”。
- 密码登录不视为最近邮箱验证；导出等敏感操作继续沿用邮箱再次验证要求。
- 勾选“记住我”：30 天会话（仍受现有 7 天闲置失效约束）；不勾选：会话 Cookie 与最多 1 天的服务端会话。验证码登录维持原有会话策略。

## 上线与本机

新增可重复执行的迁移 `db/accounts-passwords-v1.sql`。本机 PGlite 下次启动自动应用；生产必须先以维护凭据应用此迁移，再更新并重启账号服务。迁移仅新增独立密码表，不改动现有曲库、账号或任务数据。未迁移的旧服务不会自动提供新密码接口。

开发预览仍只把验证码写入私有 development-mailbox，不发送真实邮件。生产沿用原 SMTP 配置；密码设置／重置邮件有独立主题与用途提示。

## 背景图片

- 产物：`public/images/auth-piano-studio.webp`（WebP 转码用于网页）。
- 使用内置 imagegen，以用户附件为参考生成摄影背景；文字、标志与表单均由 HTML/CSS 渲染。
- 提示词："Edit target: supplied login page reference. Deliver ONLY the portrait photograph from the LEFT side as a standalone background asset, aspect ratio 9:10. Remove the entire right login form panel. Remove ALL overlaid text and the top left logo and bottom left caption by restoring the natural room background behind them. Preserve exactly the warm sunlit piano studio scene: large window and creamy blank sunlit wall at upper left (keep this area quiet and pale for future dark text), black upright acoustic piano and keyboard occupying lower right, sheet music at upper right, green plants, wooden floor with sunlight shadows, black piano bench lower left. Remove YAMAHA lettering / brand marking from piano. Beautiful editorial photographic quality, realistic, matching existing scene composition, no text, no logo, no UI, no watermark. This image is for CSS background underneath separately rendered HTML text, so do NOT include any writing apart from naturally indistinct score notation."

## 验证入口

`tests/accounts-passwords.test.mjs` 覆盖密码存储权限、记住我期限、失败响应、重置用途与浏览器绑定、过期与错误次数、旧会话／验证码撤销、并发重置及 HTTP CSRF/Cookie。`tests/account-sign-in-ui.test.mjs` 覆盖两种登录方式、密码可见性、注册设密、重置确认、来源页返回与保留草稿。项目回归使用 `npm run check`，商业版构建使用 `npm run build:hosted`。
