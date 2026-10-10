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

> **注意**：macOS 包必须在 Mac 上构建；跨平台交叉打包 Tauri 官方不支持。

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
- 键名：`worktodo.tasks.v1`（任务）、`worktodo.projects.v1`（项目）、`worktodo.sync.v1`（同步会话）；界面偏好存 `sessionStorage` 的 `worktodo.ui.v1`
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
