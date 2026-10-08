---
feature: work-todo-mvp
status: in-progress
updated: 2026-10-08
branch: feat/work-todo-mvp
commits: 
---

# Work Todo MVP

## Report

**What was built** — 详见 [S2]；核心是根目录纯静态 SPA（`index.html` / `styles.css` / `app.js`）+ Tauri 2 桌面壳脚手架。

**Verification**（2026-10-08）
- `node --check app.js` — PASS
- `node scripts/smoke-test.js` — PASS（46 passed, 0 failed）：HTML 结构、CRUD、排序（含等键稳定序）、筛选/搜索、非数组与损坏 JSON 恢复、非法枚举过滤、Tauri 配置与 `[lib]` 对齐
- `node scripts/prepare-dist.js` — PASS（dist/ 含 index.html, styles.css, app.js）
- Playwright UI 冒烟（http://127.0.0.1:5173）— PASS 全链路：
  - 空态「还没有任务」
  - 新建（标题/优先级/截止日期）→ 列表出现
  - 状态循环 todo → in-progress
  - 搜索命中 / 无命中空态「没有匹配的任务」
  - 状态筛选（已完成 → 空态）
  - 编辑回填 + 保存
  - 同会话 reload 后 localStorage 持久化（`worktodo.tasks.v1`）
  - 删除确认对话框 → 列表清空
  - 过期标识：截止 2026-10-01 显示「已过期」，页脚「过期 1」
  - 唯一 console 错误为 favicon 404

**Journey log**
1. 首版 Tauri `Cargo.toml` 漏掉 `[lib] name = "worktodo_lib"`，与 `main.rs` 不对齐会导致 `cargo tauri dev/build` 无法编译；已补并加入 smoke 断言。
2. 排序比较器原式 `a<b?1:-1` 在等键时双向返回 -1，同毫秒创建顺序不稳定；已改为等键返回 0。
3. `frontendDist: ".."` 会把整个仓库打进包；改为 `../dist` + `scripts/prepare-dist.js`，根目录 `index.html` 仍供浏览器预览。
4. smoke 里 filter/search 曾用测试内 `.filter()` 复刻逻辑而非调用 `visibleTasks`（闭包 `filters` 不可外设）；T6 的真实覆盖以 Playwright 为准。

## [S1] Problem

工作中需要一个轻量的个人待办记录工具：能快速记下任务、跟踪状态与优先级、按截止日期推进，并能按条件筛选检索。产品要跨平台可用（Web / Windows / macOS），不要求账号与云同步；本地数据持久即可。交付形态以可浏览器直接预览的 Web 应用为主，同时提供 Tauri 脚手架以便后续打桌面包。

## [S2] Design

### 技术形态

- 前端：纯 HTML / CSS / JavaScript 单页应用，入口 `index.html`，配套 `styles.css`、`app.js`，保存于仓库根目录，双击或静态服务即可在浏览器运行。
- 桌面：同一套前端由 Tauri（WebView）承载；本交付只提供 Tauri 工程配置与构建说明（`src-tauri/` + `docs/BUILD.md`），不在本机产出安装包。macOS 包必须在 Mac 上构建。
- 持久化：`localStorage`，键名 `worktodo.tasks.v1`。写入失败时在 UI 显示非阻塞错误提示，不静默丢数据。
- 无构建步骤、无打包器、无运行时 npm 依赖（Tauri 侧构建依赖除外，仅打包时需要）。

### 数据模型

```ts
type TaskStatus = 'todo' | 'in-progress' | 'done'
type TaskPriority = 'high' | 'medium' | 'low'

interface Task {
  id: string          // crypto.randomUUID()
  title: string       // 必填，trim 后 1–120 字符
  status: TaskStatus  // 默认 'todo'
  priority: TaskPriority // 默认 'medium'
  dueDate: string | null // 'YYYY-MM-DD'，可空
  createdAt: string   // ISO 8601
  updatedAt: string   // ISO 8601
}
```

### 行为契约

1. **列表**：按筛选条件展示任务。默认排序：未完成在前，同组内按 `dueDate` 升序（空日期排在最后），再按 `priority`（high > medium > low），最后按 `createdAt` 降序。已完成任务视觉弱化。
2. **新建 / 编辑**：单表单模式。`title` 非空校验；`dueDate` 允许清空。提交后写入 localStorage 并刷新列表。编辑时表单回填当前值。
3. **状态变更**：列表行内提供状态切换（todo → in-progress → done → todo 循环，或直接选值）；变更即时持久化。
4. **删除**：需确认；删除后不可恢复（MVP 不做回收站）。
5. **筛选**：按状态（全部 / todo / in-progress / done）与优先级（全部 / high / medium / low）过滤。
6. **搜索**：对 `title` 做大小写不敏感的子串匹配；与筛选条件为 AND 关系。
7. **空态**：无任务或筛选无结果时展示明确空态文案，不用空白列表。
8. **过期**：`dueDate` 早于今天且状态非 `done` 的任务，在列表中用过期标识（角标/色点）。
9. **错误**：localStorage 读写异常时保留内存态并提示用户；不白屏。

### 界面结构

- 顶栏：应用名 + 搜索框 + 「新建任务」按钮。
- 筛选条：状态筛选、优先级筛选、（搜索已置于顶栏）。
- 列表区：每行显示标题、优先级、状态、截止日期；行内操作为编辑、删除、状态切换。
- 表单区：新建/编辑共用，字段为标题、状态、优先级、截止日期。
- 文案：简体中文。风格克制、信息密度适中，桌面可读性优先。

### 测试边界

- 以手动浏览器冒烟为主（本应用无测试框架）：CRUD 闭环、筛选、搜索、过期标识、localStorage 刷新后仍存在。
- 数据层 `app.js` 中与 localStorage 交互的函数保持纯逻辑可测，便于日后补单测。

## [S3] Out of Scope

- 账号、云同步、多设备冲突合并
- 子任务、标签、备注、附件
- 项目/工作区分组、看板、日历视图
- 提醒通知、重复任务
- 回收站、数据导入导出
- 本机产出 Windows/macOS 安装包（仅提供 Tauri 脚手架与构建文档）
- 国际化多语言切换（UI 固定简体中文）
- 暗色主题切换、移动端专项适配（桌面浏览器优先，窄屏可用即可）

## Tasks

- [x] T1: 项目骨架与静态页面结构 — acceptance: 根目录存在 `index.html` / `styles.css` / `app.js`，浏览器打开可见顶栏、筛选条、空列表区与表单区（covers: S2 技术形态、界面结构）
- [x] T2: 数据层 — acceptance: `app.js` 提供任务 list/create/update/remove 的 localStorage 读写函数，可手工在控制台调用并看到 `worktodo.tasks.v1` 变化（covers: S2 数据模型、行为契约 9）
- [x] T3: 任务列表渲染与排序 — acceptance: 有数据时按契约 1 的排序规则渲染行，展示标题/优先级/状态/截止日期，已完成弱化显示（covers: S2 行为契约 1、7）
- [x] T4: 新建/编辑表单 — acceptance: 可新建任务并出现在列表；点编辑回填并可保存；标题为空时内联报错；截止日期可清空（covers: S2 行为契约 2）
- [x] T5: 状态切换与删除 — acceptance: 行内可切换 todo/in-progress/done 并即时持久化；删除有确认且刷新后仍消失（covers: S2 行为契约 3、4）
- [x] T6: 筛选与搜索 — acceptance: 状态/优先级筛选与标题搜索可组合生效，无结果时展示空态（covers: S2 行为契约 5、6、7）
- [x] T7: 过期标识与错误提示 — acceptance: 过期未完成任务有可见标识；localStorage 异常时页面有提示且不白屏（covers: S2 行为契约 8、9）
- [x] T8: Tauri 脚手架与构建文档 — acceptance: 存在 `src-tauri/` 配置与 `docs/BUILD.md`，说明如何在 Windows/macOS 打包；Web 路径不受影响（covers: S2 技术形态）
- [x] T9: 浏览器冒烟验收 — acceptance: 按测试边界手工走通 CRUD/筛选/搜索/过期/刷新持久化全链路，结果记录在 Report（covers: S2 测试边界）
