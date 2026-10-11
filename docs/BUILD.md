# 构建说明

work-todo 前端为 Vue 3 + Vite 单页应用（源码在 `src/`，入口 `index.html` + `styles.css`）。
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
work-todo/
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
│   ├── Cargo.toml          # 含 [lib] name = "work_todo_lib"
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
- 键名：`work-todo.tasks.v1`（任务）、`work-todo.projects.v1`（项目）、`work-todo.sync.v1`（同步会话）；界面偏好存 `sessionStorage` 的 `work-todo.ui.v1`；更新检查节流/退避时间戳与 ETag 缓存 `work-todo.update.v1`；主题设置 `work-todo.theme.v1`（`system`/`light`/`dark`，默认跟随系统）
- 任务/项目为**软删除**：删除写入 `deletedAt` 墓碑（保留 30 天）以传播删除状态，界面只显示活数据
- 数据版本：`SCHEMA_VERSION = 3`（v2 及以下自动补 `deletedAt: null` 升级读取）
- Windows/macOS 桌面包内数据独立于浏览器，各自持久化。

## 数据与备份

- **导出**：侧栏「导出数据」下载 `work-todo-YYYYMMDD.json`，含 `schemaVersion`、`exportedAt`、`tasks`、`projects`（含墓碑）。
- **导入**：侧栏「导入数据」选择 JSON；默认按 `id` 合并（同 id 取 `max(updatedAt, deletedAt)` 较新者），导入前有确认。
- **浏览器数据**：`localStorage` 键 `work-todo.tasks.v1` / `work-todo.projects.v1`。侧栏有数据风险提示（`#data-hint`）。
- **桌面数据**：Tauri 应用数据目录下的 `tasks.json`（通过 `load_tasks` / `save_tasks` 命令读写）。启动时会尝试从桌面文件恢复。
- **桌面备份**：应用数据目录 `backups/work-todo-YYYYMMDD-HHmmss.json`，启动与导入后自动备份，滚动保留 10 份；侧栏「数据备份」可查看/恢复（`backup_tasks` / `list_backups` / `restore_backup`）。
- **多端同步**：侧栏「同步设置」。支持 PocketBase（自建，需一个数据集合，名称可在应用内配置、默认 `work_todo`）与 WebDAV（网盘 JSON 文件）；pull-merge-push + rev/ETag 乐观锁，实体级 LWW 自动解决冲突。详见 `docs/SYNC-DESIGN.md`。
- **测试**：`npm test`（单元 + 组件）、`npm run test:e2e`（构建后真浏览器端到端）。

## 版本

- 当前前端功能版本：**0.4.0**（持久化加固 + 多端同步）。
- v0.3 起新增：项目、日程（dayline）、本周回顾、hash 路由（视图进 URL、前进后退、直达链接）、Vue 3 + Vite 架构。
- v0.4 起新增：软删除墓碑（schema v3）、桌面滚动备份、PocketBase / WebDAV 多端同步。

## 软件更新

应用会检查 GitHub Releases：桌面端优先**应用内更新**（下载 + 安装 + 重启，全在应用内完成），不可用时引导到下载页；网页版行为一致地引导到下载页。

- **检查入口**：启动后静默检查；应用常驻期间每 15 分钟复查一次（两个入口都受同一节流约束）；网络恢复（`online` 事件）时补查；侧栏底部「检查更新」随时手动检查；侧栏底部版本行常驻显示当前版本，发现新版时变为主题色并显示「有新版 vX.Y.Z」，点击可打开更新弹窗。
- **节流与退避**：成功检查后 6 小时内不再自动检查（`UPDATE_AUTO_CHECK_MS`，时间戳存 `work-todo.update.v1`）；检查失败（断网 / 限流）不占用 6 小时窗口，15 分钟后（`UPDATE_RETRY_MS`）即可自动复查——开机断网不会把更新检测拖到 6 小时后。
- **版本来源**：`https://api.github.com/repos/cyamoyed/work-todo/releases/latest`（不含 draft / prerelease）。`tag_name` 形如 `v0.5.0`（可省略 `v`），与运行中版本比较，更新日志取 Release 正文（`body`，弹窗内按纯文本展示）。
  - **ETag 缓存**：成功响应的 ETag 与解析结果缓存在 `work-todo.update.v1`，下次检查带 `If-None-Match`；GitHub 返回 304 时不消耗 API 限额。
  - **限流降级**：API 返回 403（未认证限额 60 次/小时/IP，企业出口 IP 容易触发）时改读 `https://github.com/cyamoyed/work-todo/releases.atom`（普通网页，不走 API 限额），解析出最新版本与日志；feed 失败才报「GitHub 请求受限」。两条路径的失败原因（`network` / `rate-limited` / `http` …）会体现在 toast 文案里。
- **下载目标**：按平台挑安装包资产——Windows 优先 `*-setup.exe`（其次 `.exe` / `.msi`），macOS `.dmg`，Linux `.AppImage`（其次 `.deb`）；没有匹配资产则打开 Release 页面。桌面端用 `plugin:opener|open_url` 调系统浏览器（`src-tauri/capabilities/default.json` 授予 `opener:default`），网页端 `window.open` 新标签页。
- **更新弹窗**：展示新版本号、当前版本、发布日期、更新日志；操作有「稍后」「复制链接」（复制下载目标到剪贴板，浏览器拉起失败时的兜底）「前往下载」。网页版会附一行提示「网页版部署更新后，刷新页面即可使用新版」。
- **前端版本号**：由 `src-tauri/Cargo.toml` 经 Vite `define` 注入为 `__APP_VERSION__`（版本号唯一源头），`src/` 内不要手写版本号。

### 应用内更新（桌面端，tauri-plugin-updater）

弹窗打开时桌面端会额外询问 updater 插件（`src/lib/updater.js`，走 duck-typed 桥接，不引 `@tauri-apps/api`）：插件命中可安装更新后主按钮变为「立即更新」——下载进度条（`src/core/update.js createDownloadProgress`）→ 安装 → 重启生效；失败或插件不可用时自动回退「前往下载」浏览器流程，两条路径互为兜底。

- **清单与签名**：插件读 `https://github.com/cyamoyed/work-todo/releases/latest/download/latest.json`（tauri-action 的 `includeUpdaterJson` 自动生成），安装包须有 minisign 签名；运行端公钥在 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，与构建端私钥配对。
- **签名密钥**：`src-tauri/keys/work-todo-updater.key`（本地，已 gitignore）/.key.pub。仓库 secrets 需配置 `TAURI_SIGNING_PRIVATE_KEY` = 私钥文件的**完整内容**（base64 形式的单行字符串，即文件原样；tauri 构建时先 base64 解码再解析 minisign 密钥）与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（本密钥对为空，secret 留空即可）。**发下一个版本前必须先把私钥内容贴进 GitHub secrets，否则 CI 构建直接失败**（这是预期行为：无签名的 latest.json 对存量用户是无效更新）。
  - **secret 为空或不合法时的报错**是 `incorrect updater private key password: Missing comment in secret key`——解码失败被 tauri 统一包装成「密码错误」，与密码无关：空 secret、贴成了解码后的两行原始内容、或贴了别的 base64 都会这样。release.yml 在构建前有预检步骤，会秒级失败并给出可操作的提示。
  - **复制方式**（不要经剪贴板多处中转，避免丢行）：Git Bash 执行 `cat src-tauri/keys/work-todo-updater.key | clip` 后整行粘贴进 secret；或 `gh secret set TAURI_SIGNING_PRIVATE_KEY < src-tauri/keys/work-todo-updater.key`。
- **平台支持**：Windows = NSIS `*-setup.exe`（installMode `passive`，安装器接管后应用自动退出重启）；macOS = 通用 `.app.tar.gz` 增量替换（首次安装仍需右键打开过一次 Gatekeeper；更新替换的新包不再触发隔离提示）；Linux = 仅 `.AppImage` 自更新，`.deb` / `.rpm` / `.msi` 安装的用户走浏览器下载重装。
- **过渡说明**：v0.8.0 之前的存量桌面版没有 updater 插件，永远走浏览器下载；应用内更新从携带本功能的版本起、由再下一个 Release 的 `latest.json` 首次生效。
- **密钥丢失的后果**：私钥一旦丢失，存量桌面用户无法通过应用内更新升级（签名对不上），只能回退浏览器下载重新安装一次（之后新密钥恢复生效）。请把私钥另行备份（密码管理器 / 私有存储）。
- **权限**：`src-tauri/capabilities/default.json` 授予 `updater:default` 与 `process:allow-restart`（更新后重启）。

## CI 自动打包发布（GitHub Actions）

`.github/workflows/release.yml` 在推送 `v*` 标签时自动完成整条发布链：单元/组件测试 → 校验 tag 与版本号一致 → 生成更新日志并创建**草稿** Release → 三平台并行构建、上传安装包到草稿 → 校验资产齐全后**统一转正式发布**。

- **产物覆盖**：Windows（NSIS `*-setup.exe`，不再构建 MSI）、macOS（通用二进制 `.dmg`，同时支持 Intel / Apple Silicon）、Linux（`.deb` / `.rpm` / `.AppImage`）。
- **触发方式**：
  - 发版：`git tag vX.Y.Z && git push origin vX.Y.Z`；
  - 仅构建：在仓库 Actions 页面手动触发（workflow_dispatch），安装包上传为 artifacts，不创建 Release。
- **版本校验**：tag 与 `src-tauri/Cargo.toml` 的 `version` 不一致时构建直接失败，避免「Release 已发新版、应用内版本号对不上」。
- **两段式发布**：先建草稿，全部平台资产上传完毕后由 publish job 按 `src/core/update.js pickDownloadUrl` 的规则校验（Windows `*-setup.exe`、macOS dmg、Linux AppImage/deb，另需应用内更新清单 `latest.json`）再转正式，并确认 `releases/latest` 已指向新 tag。任一平台构建失败时 Release 停留在草稿，不会被应用内更新检测暴露；人工删除草稿、修复后重推 tag 即可。
- **Release 正文**：按 conventional commits 自动分组（新功能 feat / 问题修复 fix / 体验优化 perf，其余提交不展示；全部为维护性提交时写「维护性更新」）+ 各平台下载指引。正文末尾的下载指引只面向 GitHub 页面访客，应用内弹窗展示时会自动裁掉（`src/core/update.js trimReleaseNotes`）。发布后可随时在 GitHub 页面编辑，应用内更新弹窗读取的是线上正文。
- **命名约束**：资产保持 Tauri 默认命名（`*_setup.exe` / `.dmg` / `.AppImage` 等），`src/core/update.js` 按后缀与 `*-setup.exe` 优先级挑选下载目标，不要上传时改名。
- **版本号防漂移**：`.github/workflows/version-guard.yml` 在 main 分支有新提交但 `Cargo.toml` 版本号未升时给出 warning 提醒（不阻断），避免发版前忘记升版。
- **缓存**：npm 随 setup-node 缓存；Rust 编译缓存由 `rust-cache-warm.yml` 在 main 分支预热——tag 触发的构建写入的缓存被 GitHub 限定在该 tag 的 ref 作用域内、其它任何运行都读不到，因此发布流水线只读不写（`save-if: "false"`），预热流水线专职写入；两处 rust-cache 的 `shared-key`（`release`）必须一致。冷启动全量构建约 10–20 分钟，缓存命中后约 4–6 分钟。
- e2e 测试不进 CI：Chromium 由 `vitest.e2e.config.js` 扫描本机 `%LOCALAPPDATA%/ms-playwright` 定位，依赖本机环境。
- **发布流程**：升版 `src-tauri/Cargo.toml` 的 `version`（版本号唯一源头，`tauri.conf.json` 与 `package.json` 均不携带版本号）→ 提交并推送 `vX.Y.Z` tag → GitHub Actions 自动构建三平台安装包、校验后发布 Release（详见上方「CI 自动打包发布」；也可按本节旧流程手工 `cargo tauri build` + 手动建 Release）。用户端应用会检测到新版。
