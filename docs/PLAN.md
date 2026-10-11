# OTools 工具站 — 调研与方案

## 1. 目标

- 可拓展：新增一个工具 = 新建一个目录（页面 + 元信息），首页 / 搜索 / 分类自动收录。
- 现代简约 UI：卡片 + 留白 + 圆角 + 中性色，支持暗色模式。
- 多端：电脑端浏览器、手机浏览器（H5）、微信小程序，一套代码。

## 2. 技术调研

| 维度 | 候选 | 结论 |
| --- | --- | --- |
| 跨端框架 | **uni-app (Vue3+Vite)** / Taro 4 / 纯 H5 + 小程序 web-view | uni-app：国内小程序生态最成熟，模板丰富；web-view 方案需业务域名且体验差，排除 |
| 工程模板 | **unibest v4** / uni-preset-vue 官方模板 | unibest（MIT，持续维护）：TS、UnoCSS、约定式路由、Pinia 持久化、分包优化、自定义 tabbar 全部内置 |
| UI 组件库 | **wot-design-uni** / uview-plus / uv-ui | wot-design-uni（MIT）：设计简约、TS 友好、H5 与小程序一致性好、支持暗色主题 |
| 原子化样式 | **UnoCSS + @uni-helper/unocss-preset-uni** | 模板内置，自动处理小程序类名兼容 |
| 工具算法 | crypto-js、js-base64、dayjs、uqrcodejs | 均为纯 JS，无 DOM 依赖，小程序可运行 |

关键约束：小程序没有 `window/document/btoa/TextEncoder`，主包 ≤ 2MB。
→ 工具算法只选纯 JS 库；工具页面全部放入分包 `src/pages-tools`。

## 3. 架构

```
src/
├─ pages/                 主包：首页、分类、我的（tabbar）
├─ pages-tools/<id>/      分包：每个工具一个目录
│   ├─ index.vue          工具页面
│   └─ meta.ts            工具元信息 defineTool({...})
├─ tools/
│   ├─ types.ts           ToolMeta / Category 类型
│   ├─ categories.ts      分类定义
│   └─ registry.ts        import.meta.glob 自动收集所有 meta.ts
├─ components/
│   ├─ tool-card/         工具卡片
│   ├─ tool-layout/       工具页统一外壳（标题、说明、操作区）
│   └─ copy-box/          结果展示 + 一键复制
├─ store/tool.ts          收藏、最近使用（持久化到 uni storage）
└─ utils/                 跨端工具函数（剪贴板、toast 等）
```

**扩展协议**：`meta.ts` 导出 `{ id, name, desc, category, icon, keywords, platforms? }`，
`platforms` 用于声明仅部分端可用的工具（如依赖 DOM 的工具只在 H5 显示）。
提供 `pnpm new:tool <id>` 脚本生成模板。

**响应式**：移动端 2 列 → 平板 3~4 列 → 桌面 5~6 列；H5 宽屏限制内容最大宽度 1200px 居中。
小程序使用 rpx 自然适配，H5 通过媒体查询 + 最大宽度控制。

## 4. 分阶段任务

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P1 脚手架 | 引入 unibest，接入 wot-design-uni，清理演示代码（登录 / 请求示例） | `build:h5`、`build:mp-weixin` 通过 |
| P2 核心框架 | 工具注册表、首页（搜索 / 分类 / 收藏 / 最近）、工具页外壳、响应式布局、主题 token | 浏览器 PC / 手机尺寸截图检查 |
| P3 首批工具 | JSON 格式化、Base64、URL 编解码、时间戳、哈希、密码生成、UUID、进制转换、颜色转换、字数统计、大小写转换、二维码 | 每个工具在 H5 手动验证 + 小程序构建通过 |
| P4 体验完善 | 暗色模式、小程序分享、我的页（收藏管理、关于）、新增工具脚手架脚本 | — |
| P5 发布文档 | README（开发 / 构建 / 新增工具指南） | — |

### 进度（2026-10-06）

- [x] P1 脚手架：unibest v4.4.1 + wot-design-uni 1.14，H5 与小程序基线构建通过
- [x] P2 核心框架：注册表、首页 / 分类 / 我的、H5 宽屏顶部导航、主题 token
- [x] P3 首批 12 个工具，均已在 H5 中实测（哈希、Base64 等对照标准值）
- [x] P4 暗色模式、小程序全局分享、`pnpm new:tool` 脚手架
- [x] P5 README
- [ ] 真机 / 微信开发者工具验证（需要本机安装开发者工具，并配置自己的 AppID）

### 实施中的方案调整

- 工具元信息最初用 `import.meta.glob` 收集，但这样构建后主包会 `require` 分包 `pages-tools` 中的 meta 文件，
  小程序真机上会报错。现改为 `vite-plugins/tool-metas.ts` 在构建期读取 meta 字面量，生成虚拟模块 `virtual:tool-metas` 内联到主包。

## 5. 后续可扩展方向

- 工具分组标签、使用热度排序
- 需要服务端的工具（IP 查询、汇率）通过模板内置的 alova 请求层接入
- 国际化（模板已带 vue-i18n）
