# OTools 工具箱

简洁、可扩展的在线工具站，一套代码同时运行在 **电脑浏览器、手机浏览器（H5）和微信小程序**。

- 技术栈：uni-app (Vue 3 + Vite) · [unibest](https://github.com/feige996/unibest) 模板 · [wot-design-uni](https://wot-design-uni.cn) · UnoCSS · Pinia
- 现代简约 UI，支持浅色 / 深色 / 跟随系统
- 宽屏顶部导航 + 多列网格，手机底部 tabbar + 双列卡片
- 登录后使用，管理员 / 普通用户两种角色，管理员可管理用户
- 密码管理：保存各网站账号密码，服务端 AES-GCM 加密存储；其余工具纯前端运行，数据不出本地
- 可整站部署到 Cloudflare Workers（静态资源 + API + D1 数据库）
- 收藏、最近使用（本地持久化），小程序全局分享

方案与调研见 [docs/PLAN.md](docs/PLAN.md)。

## 内置工具

| 分类 | 工具 |
| --- | --- |
| 账号安全 | 密码管理（需登录，数据加密同步） |
| 开发调试 | JSON 格式化、时间戳转换 |
| 编码加密 | Base64 编解码、URL 编解码、哈希计算（MD5/SHA/HMAC） |
| 文本处理 | 字数统计、命名格式转换 |
| 格式转换 | 进制转换（大整数）、颜色转换、图片取色（H5 / 小程序） |
| 生成工具 | 二维码生成、随机密码、UUID |

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

整个站点（H5 静态资源 + `/api` 接口）部署为一个 Worker：静态资源由 Workers Static Assets 托管，
只有 `/api/*` 会进入 Worker 代码，数据存在 D1。配置见 [wrangler.jsonc](wrangler.jsonc)。

1. 登录 Cloudflare：`pnpm exec wrangler login`
2. 创建 D1 数据库，把输出的 `database_id` 填入 `wrangler.jsonc`：`pnpm exec wrangler d1 create otools`
3. 建表：`pnpm worker:migrate`
4. 设置密码库主密钥（base64 编码的 32 字节随机数，**设置后不要更换，否则已保存的密码无法解密**）：`pnpm exec wrangler secret put VAULT_KEY`
5. 构建并部署：`pnpm deploy:cf`
6. 打开 `https://otools.<你的子域>.workers.dev`，创建管理员账号

可选配置（`wrangler.jsonc` 的 `vars`）：
- `ALLOW_REGISTER`：`"true"` 时登录页开放自助注册（注册的都是普通用户），默认只能由管理员在「我的 → 用户管理」中创建账号
- `PBKDF2_ITERATIONS`：密码哈希迭代次数，默认 100000。Workers 免费套餐每次请求 CPU 时间有限，若登录时报 1102 错误可调低（如 50000）

安全说明：
- 用户登录密码使用 PBKDF2-SHA256 加盐哈希；会话 token 只存 SHA-256；同一账号连续输错 5 次密码锁定 15 分钟
- 密码库的「密码」和「备注」用 AES-256-GCM 加密，每个用户的密钥由 `VAULT_KEY` 经 HKDF 派生；网站名称、网址、账号为明文（用于列表与搜索）
- 这是服务端加密：能同时拿到 D1 数据和 `VAULT_KEY` 的人（即 Cloudflare 账号持有者）理论上可以解密；管理员角色在应用内无法查看他人的密码库
- 登录拦截在前端路由层完成，接口权限由 Worker 校验；其余工具是纯前端代码，静态资源本身不做访问控制

微信小程序 / App 不同域，需要在 `env/.env.production` 中配置 Worker 的完整地址（如 `VITE_SERVER_BASEURL__WEIXIN_RELEASE`），并在小程序后台把该域名加入 request 合法域名。

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
