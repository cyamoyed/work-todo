# work-todo 工作待办

轻量级工作任务管理应用：同一套 Vue 3 前端既可直接跑在浏览器里，也可打包为 Tauri 2 桌面应用（Windows NSIS 安装包）。纯 JavaScript 实现，运行时依赖只有 `vue` + `vue-router`，数据本地优先（local-first），可选配多端同步。

## 功能

- **多视图任务管理**：今天、本周、时间线（按日分组）、全部、搁置、已完成、回顾（统计）、项目视图；路由（hash）是当前视图与项目的唯一来源。
- **任务属性**：截止日期 + 时间、三态状态（形状 + 文字 + 颜色编码）、优先级、重复规则（完成后续推下一次截止日）、所属项目。
- **效率操作**：快速添加、批量选择操作、搜索、筛选与排序、键盘快捷键、删除后撤销。
- **搁置**：暂缓推进的任务一键收进「搁置」视图——不再出现在今天/本周/日程/全部等视图，也不参与统计与到期提醒；随时恢复或直接完成（完成自动脱离搁置），单个与批量均可操作并可撤销。
- **数据安全**：
  - 软删除墓碑（30 天后物理清理），删除/编辑冲突按「新者胜」合并；
  - JSON 导出 / 导入（导出 payload 同时是同步线格式）；
  - 桌面端原子写盘 + 滚动自动备份（保留 10 份）+ 一键恢复；浏览器端有数据风险提示与一键导出。
- **多端同步**（可选、离线优先，失败不阻塞本地操作）：PocketBase 或 WebDAV 网盘，pull → merge → push 状态机，rev/ETag 乐观锁重试。详见 [docs/SYNC-DESIGN.md](docs/SYNC-DESIGN.md)。
- **主题**：跟随系统 / 浅色 / 深色，首屏内联脚本预应用避免闪烁。
- **版本更新检查**：GitHub Releases（含 jsDelivr 兜底），桌面端支持 minisign 签名的应用内更新，浏览器端始终引导到发布页下载。

## 快速开始

```bash
npm install
npm run dev          # 浏览器开发: http://127.0.0.1:5173
```

常用命令：

```bash
npm run build        # 生产构建 → dist/
npm run preview      # 本地预览 dist/
npm test             # vitest 单元 + 组件测试
npm run test:e2e     # 构建 + playwright 驱动真实 Chromium 跑 dist/
```

### 桌面端（Tauri 2）

```bash
cargo tauri dev      # 桌面开发模式（先起 npm run dev）
cargo tauri build    # 产出 Windows NSIS setup.exe 安装包
```

前置要求：Node ≥ 18、Rust ≥ 1.88、`cargo install tauri-cli --version "^2"`、VS C++ Build Tools + WebView2。macOS 包需在 Mac 上构建。打包与更新签名细节见 [docs/BUILD.md](docs/BUILD.md)。

## 架构

分层严格，自上而下单向依赖：

| 目录 | 职责 |
|------|------|
| `src/core/` | 纯逻辑（日期/重复规则、任务规范化、筛选、导入导出合并、日历、版本比较），无 Vue/DOM，直接单测 |
| `src/lib/` | I/O：`storage.js`（localStorage）、`tauri.js`（duck-typed 桥）、`sync/`（同步引擎 + Provider）、`update.js`（GitHub Releases 检查）、`backup.js` |
| `src/store/` | `reactive()` 单例（无 Pinia）编排数据与状态：`tasks.js`、`ui.js`、`sync.js`、`update.js` |
| `src/components/` + `src/views/` | 薄 SFC；视图是共享列表组件的路由包装 |
| `src/router/` | hash 路由（Tauri custom protocol 必需）；路由 → store 单向同步 |
| `src-tauri/src/` | 薄 Rust 壳：原子读写、滚动备份、逾期通知 stub。**全部任务语义在前端** |

版本号只写在 `src-tauri/Cargo.toml` 一处：`tauri.conf.json` 与 `package.json` 均不带版本，`vite.config.js` 读取 Cargo.toml 注入 `__APP_VERSION__`，CI（version-guard）强制 Release tag 与之匹配。

UI 遵循 [design/ANTI-AI.md](design/ANTI-AI.md) 约束（单强调色、发丝分隔线、无渐变/毛玻璃等）。

## 测试

- `tests/unit/` — 直接测 `src/core` / `src/lib` / `src/store`，可通过 `__setStorageForTests` 注入存储故障。
- `tests/component/` — @vue/test-utils + happy-dom 挂载真实组件与真实 store。
- `tests/e2e/` — playwright-core 驱动真实 Chromium 跑**构建后的 dist/**；Chromium 从 `%LOCALAPPDATA%/ms-playwright` 扫描（`WORK_TODO_CHROME_PATH` 可覆盖）；拦截 `api.github.com` 保证离线运行。

## 文档

- [docs/BUILD.md](docs/BUILD.md) — 构建、打包、数据说明、软件更新与应用内更新签名。
- [docs/SYNC-DESIGN.md](docs/SYNC-DESIGN.md) — 持久化与多端同步设计（改 `src/lib/sync/` 或墓碑逻辑前必读）。
- [docs/DEV-PLAN.md](docs/DEV-PLAN.md) 系列 — 各版本产品计划。
- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) — 代码库导览与硬性契约（DOM id、存储键、分层规则）。
