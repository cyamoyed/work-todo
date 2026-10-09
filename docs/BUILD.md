# 构建说明

WorkTodo 前端为纯静态页面（`index.html` / `styles.css` / `app.js`），可直接浏览器预览。
桌面端由 Tauri 2 承载同一套前端。

## Web 预览

无需构建，任选其一：

- 双击打开根目录 `index.html`
- 或启动静态服务：

```bash
# Python
python -m http.server 5173 --bind 127.0.0.1
# 或 Node
npx serve .
```

然后访问 `http://127.0.0.1:5173/`。

## 桌面打包（Windows / macOS）

### 前置依赖

1. [Rust](https://www.rust-lang.org/tools/install)（`rustc` ≥ 1.77）
2. Tauri CLI：

```bash
cargo install tauri-cli --version "^2"
# 或
npm install -g @tauri-apps/cli
```

3. 平台依赖：
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
# 开发（加载 dist/ 中的静态前端，无 HMR）
cargo tauri dev

# 产出安装包（自动先执行 scripts/prepare-dist.js 拷贝前端）
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
├── index.html          # Web 入口（浏览器预览）
├── styles.css
├── app.js              # 任务 CRUD / 筛选 / localStorage
├── dist/               # 构建产物：上述三文件的拷贝（Tauri frontendDist）
├── scripts/
│   ├── prepare-dist.js # 打包前拷贝前端到 dist/
│   └── smoke-test.js   # Node 数据层冒烟
├── src-tauri/          # Tauri 桌面壳
│   ├── Cargo.toml      # 含 [lib] name = "worktodo_lib"
│   ├── tauri.conf.json # frontendDist = "../dist"
│   └── src/
│       ├── main.rs
│       └── lib.rs
└── docs/
    ├── BUILD.md        # 本文件
    └── compose/spec/   # 功能规格
```

## 数据

- 存储：WebView 的 `localStorage`
- 键名：`worktodo.tasks.v1`
- Windows/macOS 桌面包内数据独立于浏览器，各自持久化。

## v0.2 数据与备份

- **导出**：顶栏「导出」下载 `worktodo-YYYYMMDD.json`，含 `schemaVersion`、`exportedAt`、`tasks`。
- **导入**：顶栏「导入」选择 JSON；默认按 `id` 合并（同 id 取 `updatedAt` 较新者），导入前有确认，导入后可撤销。
- **浏览器数据**：`localStorage` 键 `worktodo.tasks.v1`。
- **桌面数据**：Tauri 应用数据目录下的 `tasks.json`（通过 `load_tasks` / `save_tasks` 命令读写）。首次启动若检测到 localStorage 为空会尝试从桌面文件恢复。
- **测试**：`node tests/run-all.js`（含 unit-features / e2e-ui）。

## 版本

- 当前前端功能版本：**0.2.0**（导出导入、备注、今日视图、快速添加、排序、批量清理、截止时间、移动端 FAB）。
