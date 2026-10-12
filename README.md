# OTools 工具箱

简洁、可扩展的在线工具站，一套代码同时运行在 **电脑浏览器、手机浏览器（H5）和微信小程序**。

- 技术栈：uni-app (Vue 3 + Vite) · [unibest](https://github.com/feige996/unibest) 模板 · [wot-design-uni](https://wot-design-uni.cn) · UnoCSS · Pinia
- 现代简约 UI，支持浅色 / 深色 / 跟随系统
- 宽屏顶部导航 + 多列网格，手机底部 tabbar + 双列卡片
- 登录后使用（文本快传的取件除外），管理员 / 普通用户两种角色，管理员可管理用户
- 密码管理：按网站分组管理账号密码与两步验证码（TOTP），支持同一网站多个账号，服务端 AES-GCM 加密存储
- 短链接：自定义后缀、有效期、点击统计，可一键生成带备注的二维码
- Markdown 便签：随写随存、多设备同步，代码高亮、行号、一键复制，冲突自动检测，可生成只读分享链接
- 文件快传：取件码免登录下载，阅后即焚，到期自动删除（R2 存储 + 定时清理）
- 密码体检：弱密码、重复使用、长期未换与泄露检查（k-匿名，不外传密码）
- 文本快传：多设备间互传文字，取件码分享（取件无需登录，猜错取件码按 IP 限流），可设阅后即焚与有效期
- 除密码管理与体检、短链接、文本 / 文件快传、便签、我的 IP、DNS / 域名查询、汇率外，其余工具纯前端运行，数据不出本地
- 可整站部署到 Cloudflare Workers（静态资源 + API + D1 数据库）
- 收藏、最近使用（本地持久化），小程序全局分享

方案与调研见 [docs/PLAN.md](docs/PLAN.md)。

## 内置工具

| 分类 | 工具 |
| --- | --- |
| 账号安全 | 密码管理（按网站分组，支持多账号与两步验证码，数据加密同步）、密码体检 |
| 开发调试 | JSON 格式化、时间戳转换、JWT 解析、正则测试、文本对比、Cron 表达式（Linux / Spring / Quartz） |
| 编码加密 | Base64 编解码、URL 编解码、哈希计算（MD5/SHA/HMAC）、对称加密（AES / DES / 3DES，兼容 OpenSSL）、字符转义（HTML / Unicode / JS / JSON / 正则 / SQL / XML） |
| 文本处理 | Markdown 便签、字数统计、命名格式转换、文本批处理、人民币大写、文本快传 |
| 图片处理 | 图片压缩（批量、格式转换、调整尺寸）、二维码识别（自动解析网址、Wi-Fi、名片等）、图片取色（H5 / 小程序） |
| 网络工具 | 我的 IP、DNS 查询（Cloudflare / Google / 阿里 DNS）、域名查询（RDAP，含 IP 段归属）、文件快传 |
| 生活实用 | 房贷计算器（等额本息 / 本金、组合贷、提前还款）、个税计算器（累计预扣、年终奖计税对比）、日期计算（万年历、农历、工作日含法定节假日）、汇率换算、单位换算 |
| 格式转换 | 进制转换（大整数）、颜色转换 |
| 生成工具 | 二维码生成（可加文字备注）、短链接、随机密码、UUID |

## 开发

需要 Node ≥ 20 与 pnpm ≥ 9（未全局安装 pnpm 时可用 `npx pnpm@10` 代替）。

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

再另开终端 `pnpm dev:h5`，开发环境下 H5 的 `/api` 请求会被 vite 代理到 `http://127.0.0.1:8787`（见 `env/.env.development`）。
首次打开会进入「初始化管理员」页面，创建的第一个账号即为管理员。

## 部署到 Cloudflare Workers

整个站点（H5 静态资源 + `/api` 接口 + `/s/<短码>` 短链跳转）部署为一个 Worker：静态资源由 Workers Static Assets 托管，
只有 `/api/*` 和 `/s/*` 会进入 Worker 代码，数据存在 D1，文件快传的文件存在 R2。配置见 [wrangler.jsonc](wrangler.jsonc)。
每 15 分钟运行一次定时任务（Cron Trigger），清理过期的文件、快传、限流记录与会话。

1. 登录 Cloudflare：`pnpm exec wrangler login`
2. 创建 D1 数据库，把输出的 `database_id` 填入 `wrangler.jsonc`：`pnpm exec wrangler d1 create otools`
3. 建表：`pnpm worker:migrate`
4. 设置密码库主密钥（base64 编码的 32 字节随机数，**设置后不要更换，否则已保存的密码无法解密**）：`pnpm exec wrangler secret put VAULT_KEY`
5. 构建并部署：`pnpm deploy:cf`
6. 打开 `https://otools.<你的子域>.workers.dev`，创建管理员账号

### 自动部署（GitHub Actions）

推送到 `main` 分支后，[.github/workflows/deploy-cloudflare.yml](.github/workflows/deploy-cloudflare.yml) 会自动执行：
安装依赖 → 构建 H5 → 测试 → 准备 D1、R2 与密钥 → 数据库迁移 → `wrangler deploy`。
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
- 文件快传需要账户开通 R2（Cloudflare 控制台 → R2，免费额度 10 GB，开通时需绑定付款方式）。部署脚本会自动创建存储桶 `otools-files`，并添加「对象 8 天后自动删除」的生命周期规则作为兜底；**未开通 R2 时照常部署**，只是文件快传会提示不可用，开通后重新部署即可
- 多次提交会排队依次部署，不会并发

可选配置（`wrangler.jsonc` 的 `vars`）：
- `ALLOW_REGISTER`：`"true"` 时登录页开放自助注册（注册的都是普通用户），默认只能由管理员在「我的 → 用户管理」中创建账号
- `PBKDF2_ITERATIONS`：密码哈希迭代次数，默认 100000。Workers 免费套餐每次请求 CPU 时间有限，若登录时报 1102 错误可调低（如 50000）

安全说明：
- 用户登录密码使用 PBKDF2-SHA256 加盐哈希；会话 token 只存 SHA-256；同一账号连续输错 5 次密码锁定 15 分钟
- 密码库的「密码」「备注」「两步验证密钥」以及文本快传、便签的内容用 AES-256-GCM 加密，每个用户的密钥由 `VAULT_KEY` 经 HKDF 派生；网站名称、网址、账号为明文（用于列表与搜索）
- 这是服务端加密：能同时拿到 D1 数据和 `VAULT_KEY` 的人（即 Cloudflare 账号持有者）理论上可以解密
- 用户数据隔离：密码库、便签、文本 / 文件快传的接口都只操作当前用户自己的数据（查询与修改均带用户条件），每个用户的数据用各自派生的密钥加密。管理员角色在应用内只能管理用户、查看与停用短链，**没有查看他人密码库、便签、快传的入口**
- 本机缓存同样按用户隔离：便签草稿、DNS 查询记录、工具收藏与最近使用按账号分开保存，退出登录时清除草稿与查询记录
- 登录拦截在前端路由层完成，接口权限由 Worker 校验；其余工具是纯前端代码，静态资源本身不做访问控制
- 文本 / 文件快传凭 6 位取件码、便签凭 12 位分享码免登录访问；猜错按 IP（IPv6 按 /64）限流。文件下载使用 10 分钟有效的签名链接，且一律作为附件下载
- 密码体检的泄露检查调用 Have I Been Pwned，只发送密码 SHA-1 的前 5 位（k-匿名），由 Worker 在服务端比对
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
