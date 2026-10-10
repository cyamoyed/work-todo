# 构建说明

WorkTodo 前端为 Vue 3 + Vite 单页应用（源码在 `src/`，入口 `index.html` + `styles.css`）。
桌面端由 Tauri 2 承载同一套前端构建产物。

## Web 预览

```bash
npm install
npm run dev        # 开发服务器 http://127.0.0.1:5173（HMR）
npm run build      # 产出 dist/
npm run preview    # 本地预览构建产物
```

> `index.html` 引用 ES module，需经 Vite 提供服务；直接双击打开（`file://`）不可用。

## 桌面打包（Windows / macOS）

### 前置依赖

1. Node.js ≥ 18（建议 20 LTS）+ npm
2. [Rust](https://www.rust-lang.org/tools/install)（`rustc` ≥ 1.77）
3. Tauri CLI：

```bash
cargo install tauri-cli --version "^2"
# 或
npm install -g @tauri-apps/cli
```

4. 平台依赖：
   - **Windows**：Visual Studio C++ Build Tools + WebView2 Runtime（Win11 自带）
   - **macOS**：Xcode Command Line Tools（`xcode-select --install`）

### 首次准备图标

```bash
cd src-tauri
cargo tauri icon /path/to/icon.png
```

会生成 `src-tauri/icons/` 下所需的 png / icns / ico。

### 构建命令

```bash
# 开发（自动执行 npm run dev，桌面窗口加载 devUrl，支持 HMR）
cargo tauri dev

# 产出安装包（自动先执行 npm run build）
cargo tauri build
```

产物位置：

| 平台 | 产物路径 |
|------|----------|
| Windows | `src-tauri/target/release/bundle/msi/*.msi` 与 `nsis/*.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg` 与 `macos/*.app` |

> **注意**：macOS 包必须在 Mac 上构建；跨平台交叉打包 Tauri 官方不支持。本地没有 Mac 时可用 GitHub Actions 云端打包，见下方「CI 自动打包发布」。

## 目录说明

```
workTodo/
├── index.html              # Vite 入口（挂载 #app）
├── styles.css              # 唯一样式源（Vite 打包进 dist/）
├── vite.config.js          # plugin-vue、base:'./'（Tauri 需要相对资源路径）、vitest 配置
├── vitest.e2e.config.js    # e2e 专用（node 环境）
├── src/
│   ├── main.js             # 启动：store → router → 挂载 → facade
│   ├── App.vue             # 应用外壳
│   ├── router/             # hash 路由（#/today 等 7 视图）
│   ├── store/              # reactive 数据/UI 状态
│   ├── core/               # 纯逻辑（日期/筛选/导入导出/日历）
│   ├── lib/                # storage / Tauri 桥 / facade
│   ├── components/         # 单文件组件
│   └── views/              # 路由视图
├── dist/                   # Vite 构建产物（Tauri frontendDist，勿手改）
├── tests/
│   ├── unit/               # vitest 单元测试（纯逻辑 + store + storage）
│   ├── component/          # vitest + @vue/test-utils 组件测试
│   └── e2e/                # playwright-core 真浏览器端到端
├── src-tauri/              # Tauri 桌面壳
│   ├── Cargo.toml          # 含 [lib] name = "worktodo_lib"
│   ├── tauri.conf.json     # frontendDist = "../dist"
│   └── src/
│       ├── main.rs
│       └── lib.rs          # load_tasks / save_tasks（原子写入）
└── docs/
    ├── BUILD.md            # 本文件
    └── compose/spec/       # 功能规格
```

## 数据

- 存储：WebView 的 `localStorage`
- 键名：`worktodo.tasks.v1`（任务）、`worktodo.projects.v1`（项目）、`worktodo.sync.v1`（同步会话）；界面偏好存 `sessionStorage` 的 `worktodo.ui.v1`；更新检查节流时间戳 `worktodo.update.v1`
- 任务/项目为**软删除**：删除写入 `deletedAt` 墓碑（保留 30 天）以传播删除状态，界面只显示活数据
- 数据版本：`SCHEMA_VERSION = 3`（v2 及以下自动补 `deletedAt: null` 升级读取）
- Windows/macOS 桌面包内数据独立于浏览器，各自持久化。

## 数据与备份

- **导出**：侧栏「导出数据」下载 `worktodo-YYYYMMDD.json`，含 `schemaVersion`、`exportedAt`、`tasks`、`projects`（含墓碑）。
- **导入**：侧栏「导入数据」选择 JSON；默认按 `id` 合并（同 id 取 `max(updatedAt, deletedAt)` 较新者），导入前有确认。
- **浏览器数据**：`localStorage` 键 `worktodo.tasks.v1` / `worktodo.projects.v1`。侧栏有数据风险提示（`#data-hint`）。
- **桌面数据**：Tauri 应用数据目录下的 `tasks.json`（通过 `load_tasks` / `save_tasks` 命令读写）。启动时会尝试从桌面文件恢复。
- **桌面备份**：应用数据目录 `backups/worktodo-YYYYMMDD-HHmmss.json`，启动与导入后自动备份，滚动保留 10 份；侧栏「数据备份」可查看/恢复（`backup_tasks` / `list_backups` / `restore_backup`）。
- **多端同步**：侧栏「同步设置」。支持 PocketBase（自建，需一个数据集合，名称可在应用内配置、默认 `workTodo`）与 WebDAV（网盘 JSON 文件）；pull-merge-push + rev/ETag 乐观锁，实体级 LWW 自动解决冲突。详见 `docs/SYNC-DESIGN.md`。
- **测试**：`npm test`（单元 + 组件）、`npm run test:e2e`（构建后真浏览器端到端）。

## 版本

- 当前前端功能版本：**0.4.0**（持久化加固 + 多端同步）。
- v0.3 起新增：项目、日程（dayline）、本周回顾、hash 路由（视图进 URL、前进后退、直达链接）、Vue 3 + Vite 架构。
- v0.4 起新增：软删除墓碑（schema v3）、桌面滚动备份、PocketBase / WebDAV 多端同步。

## 软件更新

应用会检查 GitHub Releases 并引导到下载页（不自动下载安装包，网页版与桌面版行为一致）。

- **检查入口**：启动后静默检查（6 小时内最多一次，时间戳存 `worktodo.update.v1`）；侧栏底部「检查更新」随时手动检查；侧栏底部版本行常驻显示当前版本，发现新版时变为主题色并显示「有新版 vX.Y.Z」，点击可打开更新弹窗。
- **版本来源**：`https://api.github.com/repos/cyamoyed/workTodo/releases/latest`（不含 draft / prerelease）。`tag_name` 形如 `v0.5.0`（可省略 `v`），与运行中版本比较，更新日志取 Release 正文（`body`，弹窗内按纯文本展示）。
- **下载目标**：按平台挑安装包资产——Windows 优先 `*-setup.exe`（其次 `.exe` / `.msi`），macOS `.dmg`，Linux `.AppImage`（其次 `.deb`）；没有匹配资产则打开 Release 页面。桌面端用 `plugin:opener|open_url` 调系统浏览器（`src-tauri/capabilities/default.json` 授予 `opener:default`），网页端 `window.open` 新标签页。
- **前端版本号**：由 `src-tauri/Cargo.toml` 经 Vite `define` 注入为 `__APP_VERSION__`（版本号唯一源头），`src/` 内不要手写版本号。

## CI 自动打包发布（GitHub Actions）

`.github/workflows/release.yml` 在推送 `v*` 标签时自动完成整条发布链：单元/组件测试 → 校验 tag 与版本号一致 → 三平台并行构建 → 直接发布 GitHub Release。

- **产物覆盖**：Windows（`.msi` + NSIS `*-setup.exe`）、macOS（通用二进制 `.dmg`，同时支持 Intel / Apple Silicon）、Linux（`.deb` / `.rpm` / `.AppImage`）。
- **触发方式**：
  - 发版：`git tag vX.Y.Z && git push origin vX.Y.Z`；
  - 仅构建：在仓库 Actions 页面手动触发（workflow_dispatch），安装包上传为 artifacts，不创建 Release。
- **版本校验**：tag 与 `src-tauri/Cargo.toml` 的 `version` 不一致时构建直接失败，避免「Release 已发新版、应用内版本号对不上」。
- **Release 正文**：自动取上一 tag 以来的提交记录（`git log --no-merges`）+ 各平台下载指引；发布后可随时在 GitHub 页面编辑，应用内更新弹窗读取的是线上正文。
- **命名约束**：资产保持 Tauri 默认命名（`*_setup.exe` / `.dmg` / `.AppImage` 等），`src/lib/update.js` 按后缀与 `*-setup.exe` 优先级挑选下载目标，不要上传时改名。
- **发布即生效**：Release 直接发布（非 draft / prerelease），`releases/latest` 立即指向新版，应用内「检查更新」可检测到。
- **缓存**：npm（`package-lock.json`）与 Rust（`Cargo.lock` + `src-tauri/target`）均已缓存，冷启动全量构建约 10–20 分钟。
- e2e 测试不进 CI：Chromium 由 `vitest.e2e.config.js` 扫描本机 `%LOCALAPPDATA%/ms-playwright` 定位，依赖本机环境。
- **发布流程**：升版 `src-tauri/Cargo.toml` 的 `version`（版本号唯一源头，`tauri.conf.json` 与 `package.json` 均不携带版本号）→ 提交并推送 `vX.Y.Z` tag → GitHub Actions 自动构建三平台安装包并发布 Release（详见下方「CI 自动打包发布」；也可按本节旧流程手工 `cargo tauri build` + 手动建 Release）。用户端应用会检测到新版。
