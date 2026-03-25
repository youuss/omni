# Omni 开发说明

本文说明如何在本地搭建环境、运行与构建 **Omni**（Tauri 2 + React + Vite 的规格驱动开发桌面应用）。产品定位与界面规范见根目录 [README.md](./README.md)。

## 技术栈概览

| 层级 | 技术 |
|------|------|
| 桌面壳 | [Tauri 2](https://v2.tauri.app/)（Rust） |
| 前端 | React 19、TypeScript、Vite 7、Tailwind CSS 4 |
| 状态 | Zustand |
| 画布 | React Flow（`@xyflow/react`） |
| 本机能力 | Shell（调用 `claude`）、Dialog、Opener |

## 环境要求

- **Node.js**：建议当前 LTS（与 `package.json` 中引擎无硬性锁定时，以本机可运行 `npm install` 为准）。
- **Rust**：安装 [rustup](https://rustup.rs/)，并使用 stable toolchain；首次构建会拉取 Tauri 相关 crate。
- **系统依赖**：按 [Tauri 官方前置条件](https://v2.tauri.app/start/prerequisites/) 安装对应平台的编译依赖（macOS Xcode CLI Tools、Windows WebView2、Linux 各发行版说明等）。
- **Claude CLI**：应用通过 Shell 插件执行本机 `claude` 命令；开发 Pipeline / Agent 相关功能时需保证 `claude` 在 PATH 中可用。权限配置见 `src-tauri/capabilities/default.json`（`run-claude`）。

## 安装依赖

在项目根目录执行：

```bash
npm install
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Tauri 开发模式：会先跑 `vite:dev`（`http://localhost:1420`），再打开桌面窗口；前端热更新由 Vite 提供。 |
| `npm run vite:dev` | 仅启动 Vite 开发服务器（浏览器可访问同一端口，便于纯 UI 调试；部分 Tauri API 需在桌面壳内验证）。 |
| `npm run vite:build` | 类型检查（`tsc`）+ 前端生产构建，输出到 `dist/`。 |
| `npm run build` | 完整生产构建：执行 `vite:build` 后打包 Tauri 应用。 |
| `npm run preview` | 预览已构建的前端静态资源（Vite preview）。 |
| `npm run tauri -- <子命令>` | 透传 Tauri CLI，例如生成图标（见下文）。 |

开发入口脚本为 `scripts/run-tauri.mjs`，用于在仓库根目录调用本地 `@tauri-apps/cli`。

## 目录结构（开发相关）

```
├── src/                    # React 前端源码
│   ├── App.tsx             # 路由与壳层
│   ├── pages/              # 各页面（Projects、Workspace、Agents、Skills、Settings）
│   ├── components/         # 布局与 UI（含 shadcn 风格组件）
│   ├── stores/             # Zustand：project / workflow / pipeline / output
│   ├── services/           # 规格、项目、Pipeline、Claude 等与 invoke 协作的逻辑
│   └── types/              # TypeScript 类型
├── public/                 # 静态资源（如 logo.svg）
├── src-tauri/              # Tauri 与 Rust 后端
│   ├── src/
│   │   ├── lib.rs          # 插件注册与 invoke 命令表
│   │   └── commands/       # 各模块的 `#[tauri::command]`
│   ├── capabilities/     # 权限与能力（Shell / Dialog 等）
│   ├── icons/              # 应用图标（打包用）
│   ├── tauri.conf.json     # 产品名、窗口、beforeDevCommand、bundle 等
│   └── Cargo.toml
├── dist/                   # `vite:build` 产出（由 Tauri 引用）
└── vite.config.ts          # 端口 1420、@ → src、忽略 src-tauri 监听
```

路径别名：`@/` 指向 `src/`（见 `vite.config.ts` 与 TypeScript 配置）。

## 前端开发说明

- **开发服务器端口**：`1420`（与 `tauri.conf.json` 中 `devUrl` 一致）；`strictPort: true`，端口被占用时需先释放或改配置两处保持一致。
- **仅改 UI**：可用 `npm run vite:dev` 在浏览器中快速迭代；涉及文件系统、`@tauri-apps/api`、Shell 等行为时请在 `npm run dev` 桌面窗口中验证。
- **远程 / 局域网调试**（可选）：设置环境变量 `TAURI_DEV_HOST` 为可访问的主机名或 IP 时，`vite.config.ts` 会调整 `server.host` 与 HMR（例如 `1421`），便于真机或局域网连到开发机；需同时满足 Tauri 侧对 dev server 地址的配置要求。

## Tauri / Rust 侧说明

- **新增或修改后端能力**：在 `src-tauri/src/commands/` 实现命令，于 `lib.rs` 的 `invoke_handler!` 中注册；前端通过 `@tauri-apps/api` 的 `invoke` 调用。
- **权限**：`src-tauri/capabilities/default.json` 声明了 `core`、`opener`、`dialog`、`shell` 等；扩展可执行程序或路径时需同步修改 capability，避免运行时拒绝。
- **打包资源**：`tauri.conf.json` 的 `bundle.resources` 包含 `resources/**/*`，新增随包文件时放入对应目录并确认路径。

## 应用图标

从矢量或大图重新生成各平台图标（写入 `src-tauri/icons/`，与 `bundle.icon` 配置一致）：

```bash
npm run tauri -- icon public/logo.svg
```

iOS 图标背景色可附加 `--ios-color '#RRGGBB'`。

## 问题排查简要提示

- **Rust 编译失败**：检查是否完成 Tauri 官方列出的平台依赖；必要时执行 `rustup update`。
- **`claude` 无法执行**：确认终端中可直接运行 `claude`；检查 `capabilities/default.json` 中 `run-claude` 是否仍匹配实际命令名与参数需求。
- **端口冲突**：释放 `1420`（及使用 `TAURI_DEV_HOST` 时的 `1421`），或统一修改 `vite.config.ts` 与 `tauri.conf.json` 的 `devUrl`。

更细的产品功能与 UI 规范仍以 [README.md](./README.md) 为准。
