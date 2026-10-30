# OTools 工具箱

简洁、可扩展的在线工具站，一套代码同时运行在 **电脑浏览器、手机浏览器（H5）和微信小程序**。

- 技术栈：uni-app (Vue 3 + Vite) · [unibest](https://github.com/feige996/unibest) 模板 · [wot-design-uni](https://wot-design-uni.cn) · UnoCSS · Pinia
- 现代简约 UI，支持浅色 / 深色 / 跟随系统
- 宽屏顶部导航 + 多列网格，手机底部 tabbar + 双列卡片
- 登录后使用（文本快传的取件除外），管理员 / 普通用户两种角色，管理员可管理用户
- 密码管理：按网站分组管理账号密码与两步验证码（TOTP），支持同一网站多个账号，服务端 AES-GCM 加密存储
- 短链接：自定义后缀、有效期、点击统计，可一键生成带备注的二维码
- Markdown 便签：随写随存、多设备同步，代码高亮、行号、一键复制，冲突自动检测；文件夹、大纲导航、分栏滚动同步、全屏编辑、历史版本；可生成只读分享链接（可设访问密码）
- 文件快传：取件码免登录下载，阅后即焚；有效期可选 1 小时 ~ 30 天、自定义（1 小时 ~ 365 天）或永久，到期自动删除（R2 存储 + 定时清理）
- 待办事项：清单、子任务、优先级、标签、截止日期与时间；重复任务（含按法定节假日的「每个工作日」）；中文智能识别（「明天下午3点 交周报 !高 #工作」）；共享清单（按用户名邀请成员一起编辑）；日历视图、四象限、完成统计、番茄钟；便签里的「- [ ] 任务」可一键转为待办
- 纪念日：倒数日与累计天数（起始日算第 1 天或第 0 天可选）、公历 / 农历 / 某月第几个星期几、生日年龄与生肖星座、里程碑、节日库、分享图；卡片 / 时间线视图、自定义背景图（R2）、只读分享链接（可设访问密码与有效期）
- 提醒：站内提醒、日历订阅（.ics，加到手机 / 电脑自带日历由系统提醒）、浏览器推送（Web Push）；首页「今日」卡片显示今天的待办与近期纪念日
- WebShell（网页版 SSH 客户端，仅 H5，界面布局仿 FinalShell：左侧监控栏、终端与命令输入栏、底部文件 / 命令面板、右键菜单、连接管理器）：多标签终端（xterm.js）、SFTP 文件管理（拖拽上传、在线编辑、权限）、服务器监控（系统信息、CPU / 内存 / 网络 / 磁盘 / 进程、延迟）、快捷命令（支持变量、发送到所有会话）、跳板机、密钥管理；可导入 `~/.ssh/config` 或 FinalShell 导出的服务器（直接选择导出的文件夹、按目录分组、本地还原密码）；SSH 协议在浏览器里完成（WebAssembly），服务端只转发加密流量；服务器、密码、私钥等用「主密码」端到端加密后云同步
- 密码体检：弱密码、重复使用、长期未换与泄露检查（k-匿名，不外传密码）
- 文本快传：多设备间互传文字，取件码或仅链接分享（取件无需登录，猜错取件码按 IP 限流），可设阅后即焚与有效期（含永久）；可选「纯文本」，链接打开后整页只有原文（`/r/<码>`，类似 GitHub Raw，可直接 curl）
- 支持 PWA：H5 可安装到桌面 / 手机主屏幕，以独立窗口打开，断网时也能打开应用外壳（「我的」页面有「安装到桌面」入口）
- 除密码管理与体检、短链接、文本 / 文件快传、便签、我的 IP、DNS / 域名查询、汇率外，其余工具纯前端运行，数据不出本地
- 可整站部署到 Cloudflare Workers（静态资源 + API + D1 数据库）
- 收藏、最近使用（本地持久化），小程序全局分享

方案与调研见 [docs/PLAN.md](docs/PLAN.md)。

## 内置工具

| 分类 | 工具 |
| --- | --- |
| 账号安全 | 密码管理（按网站分组，支持多账号与两步验证码，数据加密同步）、密码体检 |
| 开发调试 | WebShell（SSH 终端 / SFTP / 服务器监控）、JSON 格式化、时间戳转换、JWT 解析、正则测试、文本对比、Cron 表达式（Linux / Spring / Quartz） |
| 编码加密 | Base64 编解码、URL 编解码、哈希计算（MD5/SHA/HMAC）、对称加密（AES / DES / 3DES，兼容 OpenSSL）、字符转义（HTML / Unicode / JS / JSON / 正则 / SQL / XML） |
| 文本处理 | Markdown 便签、字数统计、命名格式转换、文本批处理、人民币大写、文本快传 |
| 图片处理 | 图片压缩（批量、格式转换、调整尺寸）、二维码识别（自动解析网址、Wi-Fi、名片等）、图片取色（H5 / 小程序） |
| 网络工具 | 我的 IP、DNS 查询（Cloudflare / Google / 阿里 DNS）、域名查询（RDAP，含 IP 段归属）、文件快传 |
| 生活实用 | 待办事项、纪念日、房贷计算器（等额本息 / 本金、组合贷、提前还款）、个税计算器（累计预扣、年终奖计税对比）、日期计算（万年历、农历、工作日含法定节假日）、汇率换算、单位换算 |
| 格式转换 | 进制转换（大整数）、颜色转换 |
| 生成工具 | 二维码生成（可加文字备注）、短链接、随机密码、UUID |

## 开发

需要 Node ≥ 20 与 pnpm ≥ 9（未全局安装 pnpm 时可用 `npx pnpm@10` 代替）。
WebShell 的 SSH 客户端用 Go 编写、编译为 WebAssembly，构建 H5 时需要 [Go](https://go.dev/dl/) ≥ 1.24（见 `webshell-wasm/go.mod`）；没有安装 Go 时其他工具照常构建，只有 WebShell 不可用。

```bash
pnpm install
```

```bash
pnpm dev:h5
```

```bash
pnpm dev:mp
```

- H5：浏览器打开 http://localhost:9000
- 微信小程序：用微信开发者工具导入 `dist/dev/mp-weixin`。正式发布前在 `env/.env` 中把 `VITE_WX_APPID` 改为自己的 AppID

构建：`pnpm build:h5`（产物 `dist/build/h5`）、`pnpm build:mp`（产物 `dist/build/mp-weixin`）。

### 本地启动后端（登录 / 密码管理依赖）

后端是 `worker/` 下的 Cloudflare Worker，本地用 wrangler 模拟（含本地 D1 数据库）：

```bash
cp .dev.vars.example .dev.vars   # 并把 VAULT_KEY 改成随机值，生成方式见文件内注释
pnpm worker:migrate:local
pnpm worker:dev
```

WebShell 本地调试：线上环境不允许连接内网 / 本机地址，本地要连接本机的 SSH 服务时，在 `.dev.vars` 中加入 `WEBSHELL_ALLOW_PRIVATE=true`。

再另开终端 `pnpm dev:h5`，开发环境下 H5 的 `/api` 请求会被 vite 代理到 `http://127.0.0.1:8787`（见 `env/.env.development`）。
首次打开会进入「初始化管理员」页面，创建的第一个账号即为管理员。

## 部署到 Cloudflare Workers

整个站点（H5 静态资源 + `/api` 接口 + `/s/<短码>` 短链跳转）部署为一个 Worker：静态资源由 Workers Static Assets 托管，
只有 `/api/*`、`/s/*` 和 `/r/*`（文本快传的纯文本页面）会进入 Worker 代码，数据存在 D1，文件快传的文件存在 R2。配置见 [wrangler.jsonc](wrangler.jsonc)。
每 15 分钟运行一次定时任务（Cron Trigger），清理过期的文件、快传、限流记录与会话。

1. 登录 Cloudflare：`pnpm exec wrangler login`
2. 创建 D1 数据库，把输出的 `database_id` 填入 `wrangler.jsonc`：`pnpm exec wrangler d1 create otools`
3. 建表：`pnpm worker:migrate`
4. 设置密码库主密钥（base64 编码的 32 字节随机数，**设置后不要更换，否则已保存的密码无法解密**）：`pnpm exec wrangler secret put VAULT_KEY`
5. 构建并部署：`pnpm deploy:cf`
6. 打开 `https://otools.<你的子域>.workers.dev`，创建管理员账号

### 自动部署（GitHub Actions）

推送到 `main` 分支后，[.github/workflows/deploy-cloudflare.yml](.github/workflows/deploy-cloudflare.yml) 会自动执行：
安装 Go 与依赖 → 构建 H5（含 WebShell 的 WebAssembly） → 测试 → 准备 D1、R2 与密钥 → 数据库迁移 → `wrangler deploy`。
也可以在仓库的 Actions 页面手动运行。走自动部署时，上面的手动步骤 2~5 都不需要做。

一次性配置：在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加 3 个 Repository secrets：

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 在 Cloudflare 控制台「我的个人资料 → API 令牌」创建：用「编辑 Cloudflare Workers」模板，再额外添加 **账户 → D1 → 编辑** 权限（模板已含 Workers R2 存储编辑权限，没有的话请一并添加） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台「Workers 和 Pages」页面右侧的账户 ID |
| `VAULT_KEY` | 密码库主密钥，base64 编码的 32 字节随机数，生成方式见 `.dev.vars.example`。请另外妥善备份 |

说明：
- `wrangler.jsonc` 中的 `database_id` 保持占位符即可：部署脚本 [scripts/cf-prepare.mjs](scripts/cf-prepare.mjs) 会按名称查找远程 D1 数据库，不存在就自动创建（只改 CI 工作区，不会提交回仓库）。如果你已经手动创建并填好了 ID，则直接使用
- `VAULT_KEY` 只在 Worker 上还没有这个 secret 时（首次部署）写入，之后的部署**不会覆盖**，避免误改导致已保存的密码无法解密。确实要更换只能手动处理，且旧数据将无法解密
- 新的 Cloudflare 账户需要先在控制台打开一次「Workers 和 Pages」，注册 `workers.dev` 子域，否则首次部署会失败
- 文件快传需要账户开通 R2（Cloudflare 控制台 → R2，免费额度 10 GB，开通时需绑定付款方式）。部署脚本会自动创建存储桶 `otools-files`，并给 `tmp/` 前缀（有效期不超过 31 天的文件）添加「32 天后自动删除」的生命周期规则作为定时清理之外的兜底，更长或永久的文件放在 `keep/` 下不自动删除（旧版本对整个存储桶生效的 8 天规则会被自动移除）；**未开通 R2 时照常部署**，只是文件快传会提示不可用，开通后重新部署即可
- 浏览器推送用的 VAPID 密钥（`VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY`）由部署脚本在首次部署时自动生成并上传，之后不再变化（变化会导致已订阅的浏览器收不到推送）；本地调试见 `.dev.vars.example`
- WebShell 的中转使用 Durable Object（`WebShellRelay`，SQLite 存储类型，免费套餐可用），首次部署时由 `wrangler.jsonc` 中的 `migrations` 自动创建，无需额外配置；CI 中会安装 Go 编译 SSH 客户端
- 多次提交会排队依次部署，不会并发

可选配置（`wrangler.jsonc` 的 `vars`）：
- `ALLOW_REGISTER`：`"true"` 时登录页开放自助注册（注册的都是普通用户），默认只能由管理员在「我的 → 用户管理」中创建账号
- `PBKDF2_ITERATIONS`：密码哈希迭代次数，默认 100000。Workers 免费套餐每次请求 CPU 时间有限，若登录时报 1102 错误可调低（如 50000）

安全说明：
- 用户登录密码使用 PBKDF2-SHA256 加盐哈希；会话 token 只存 SHA-256；同一账号连续输错 5 次密码锁定 15 分钟
- 密码库的「密码」「备注」「两步验证密钥」以及文本快传、便签的内容用 AES-256-GCM 加密，每个用户的密钥由 `VAULT_KEY` 经 HKDF 派生；网站名称、网址、账号为明文（用于列表与搜索）
- 这是服务端加密：能同时拿到 D1 数据和 `VAULT_KEY` 的人（即 Cloudflare 账号持有者）理论上可以解密
- 用户数据隔离：密码库、便签、文本 / 文件快传的接口都只操作当前用户自己的数据（查询与修改均带用户条件），每个用户的数据用各自派生的密钥加密。管理员角色在应用内只能管理用户、查看与停用短链，**没有查看他人密码库、便签、快传的入口**
- 待办与纪念日：标题、备注加密存储，日期等用于提醒与日历订阅的字段为明文；共享清单里的待办用清单创建者的密钥加密，成员经服务端解密查看。每人最多 5000 条待办、100 个清单（每个最多 20 位成员）、500 个纪念日；已完成的待办保留 180 天
- 提醒：定时任务每 15 分钟派发到点的提醒，站内提醒内容加密、保留 30 天；日历订阅链接带随机令牌，服务端只存哈希与加密副本，可随时重新生成使旧链接失效；退出登录时会取消本浏览器的推送订阅
- 便签容量限制：每人最多 500 条、正文总量 30 MB；历史版本同一便签 10 分钟内最多一个快照、每条最多 30 个、保留 90 天、每人历史总量 20 MB（超出自动删除最旧的），避免写满 D1。分享密码用作者密钥加密保存，访问时放在请求头里，错误次数按 IP 限流
- 本机缓存同样按用户隔离：便签草稿、DNS 查询记录、工具收藏与最近使用按账号分开保存，退出登录时清除草稿与查询记录
- 登录拦截在前端路由层完成，接口权限由 Worker 校验；其余工具是纯前端代码，静态资源本身不做访问控制
- 文本 / 文件快传凭 6 位取件码、便签凭 12 位分享码免登录访问（文本快传关闭取件码时改用 16 位链接码，只能通过链接打开）；纯文本页面以 `text/plain` + `nosniff` + CSP sandbox 返回，不会被当作网页执行，且浏览器打开时不带登录信息，阅后即焚的内容打开一次即销毁；猜错按 IP（IPv6 按 /64）限流。文件下载使用 10 分钟有效的签名链接，且一律作为附件下载
- 密码体检的泄露检查调用 Have I Been Pwned，只发送密码 SHA-1 的前 5 位（k-匿名），由 Worker 在服务端比对
- WebShell：
  - 端到端加密：服务器地址、用户名、密码、私钥、快捷命令、已信任的主机密钥、设置都在浏览器里用主密码加密（PBKDF2-SHA256 60 万次派生密钥，加密随机生成的 AES-256-GCM 数据密钥），服务端只存密文，管理员与 Cloudflare 账号持有者都无法解密；**主密码无法找回**，忘记只能重置（删除全部 WebShell 数据）。可选「在此设备上记住」，把不可导出的密钥存在浏览器 IndexedDB 中
  - SSH 握手、加解密、SFTP 都在浏览器的 WebAssembly 里完成（Go 官方 `x/crypto/ssh` 与 `pkg/sftp`），Worker 只把 WebSocket 与服务器的 TCP 连接对接，看不到密码与终端内容；首次连接会让用户确认主机密钥指纹，变化时警告（防中间人）
  - 中转需要登录：先用登录态换取 30 秒内有效、只能用一次的票据，再建立 WebSocket；每人最多 20 个同时连接，签发票据与在线检测都有频率限制；只能连接公网地址（Cloudflare 本身无法访问内网与 Cloudflare 网段），不支持 25 端口
  - 服务端会记录连接的目标地址、端口、时间与流量（用于限制并发与「连接记录」，本人可见，保留 30 天）；概览页的在线检测由 Worker 对服务器的 SSH 端口发起 TCP 连接（不做 SSH 握手）
  - 用 Durable Object 承载中转是因为普通 Worker 中一条 WebSocket 整体只算一次请求，免费套餐的 10ms CPU 撑不住长连接；Durable Object 每收到一条消息重置 30 秒 CPU 额度，浏览器每 20 秒发送一次心跳。免费套餐的 Durable Object 有每日用量额度（以 Cloudflare 官网为准），长时间、多会话使用建议升级付费套餐
- 短链跳转（`/s/<短码>`）是公开的，任何人拿到短链都能访问；只有登录用户能创建。管理员可在短链工具中切换到「全部用户」查看、停用或删除任意短链，用于处理滥用

微信小程序 / App 不同域，需要在 `env/.env.production` 中配置 Worker 的完整地址（如 `VITE_SERVER_BASEURL__WEIXIN_RELEASE`），并在小程序后台把该域名加入 request、uploadFile、downloadFile 合法域名（后两项用于文件快传）。

## 新增一个工具

```bash
pnpm new:tool regex 正则测试 dev
```

会生成 `src/pages-tools/regex/` 目录：

```
src/pages-tools/regex/
├─ meta.ts     # 元信息：名称、描述、分类、图标、搜索关键字、可用平台
└─ index.vue   # 工具页面，用 <ot-tool-layout> 包裹
```

重启 dev 后，首页、分类页和搜索都会自动收录这个工具，不需要在其他地方登记。

`meta.ts` 约定：

- `id` 必须与目录名一致
- `defineTool({...})` 的参数必须是纯字面量。构建期会直接读取它并内联到主包，以避免小程序主包引用分包文件
- 图标用 Carbon 图标集的类名，如 `i-carbon-json`（[查找图标](https://icones.js.org/collection/carbon)），会被自动加入 UnoCSS safelist
- `platforms: ['h5']` 可限定只在部分平台展示，例如依赖 DOM 的工具

可复用的组件（`src/components`）：

| 组件 | 用途 |
| --- | --- |
| `ot-tool-layout` | 工具页外壳：标题 / 描述 / 收藏，自动记录最近使用 |
| `ot-panel` | 带标题的卡片，`#extra` 插槽放按钮 |
| `ot-textarea` | 多行输入（已去掉小程序 140 字限制） |
| `ot-result` | 结果行：标签 + 等宽值 + 复制 |
| `ot-segmented` | 支持 `{ value, label }` 的分段选择器 |

工具函数见 `src/utils/common.ts`：`copyText`、`toast`、`getRandomBytes`（跨端安全随机数）。

新增分类：编辑 `src/tools/categories.ts`，并同步 `CategoryId` 类型与 `scripts/new-tool.js` 中的分类列表。

## 跨端注意事项

- 算法库只选纯 JS、不依赖 DOM 的库；小程序没有 `window`、`document`、`btoa`、`TextEncoder`
- 正则不要用 `\p{...}` Unicode 属性转义，部分小程序运行环境不支持
- 平台差异代码用条件编译：`// #ifdef H5` / `// #ifdef MP-WEIXIN`
- `src/pages.json` 由插件自动生成。如果出现页面重复之类的异常，删除该文件后重新运行即可

## 致谢

[uni-app](https://uniapp.dcloud.net.cn)、[unibest](https://github.com/feige996/unibest)（MIT）、[wot-design-uni](https://github.com/Moonofweisheng/wot-design-uni)（MIT）、[UnoCSS](https://unocss.dev)、[crypto-js](https://github.com/brix/crypto-js)、[js-base64](https://github.com/dankogai/js-base64)、[dayjs](https://day.js.org)、[uQRCode](https://github.com/Sansnn/uQRCode)
