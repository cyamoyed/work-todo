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
# 开发（热更新前端）
cargo tauri dev

# 产出安装包
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
├── src-tauri/          # Tauri 桌面壳
│   ├── Cargo.toml
│   ├── tauri.conf.json # frontendDist 指向仓库根目录
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
