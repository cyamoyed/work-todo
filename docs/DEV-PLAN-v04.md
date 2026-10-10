# work-todo v0.4 开发计划

> 版本：v0.4 · 编制日期：2026-10-10 · 状态：**已交付**
> 输入：`docs/SYNC-DESIGN.md`（数据持久化与多端同步设计）
> 目标：持久化加固（墓碑 + 桌面备份）与多端同步（PocketBase / WebDAV），离线优先、最终收敛。

---

## 1. 背景

v0.3 已交付 UI 重设计与信任能力，500+ 项测试全绿。当前数据仅存于 localStorage（桌面端另有文件镜像）：

1. **localStorage 可被浏览器清除**，清除即丢数据，无兜底；
2. **删除是硬删除**，一旦引入同步会导致删除项复活；
3. **多设备无法共享数据**，导出/导入是唯一手段。

v0.4 按 `docs/SYNC-DESIGN.md` 实施：local-first + 可插拔同步层。

**成功标准（v0.4）**

1. 删除/撤销/清空全部走软删除墓碑，30 天后自动清理，全部既有撤销流不回归；
2. 桌面端有滚动自动备份（保留 10 份）并可恢复；浏览器端有数据风险提示与一键导出；
3. PocketBase 与 WebDAV 两个同步 Provider 可用（登录、拉取、推送、冲突重试）；
4. 同步状态可见（未配置/同步中/已同步/失败/离线），同步失败不阻塞本地操作；
5. schema v2 数据无损升级 v3；导出/导入/同步 payload 形状一致；
6. 回归测试不少于既有规模，新场景（墓碑、合并、同步引擎、Provider、备份）全覆盖。

---

## 2. 工作全清单

| ID | 优先级 | 类别 | 内容 | 状态 |
|----|--------|------|------|------|
| A-01 | P0 | 数据模型 | 任务/项目软删除墓碑 `deletedAt`，`SCHEMA_VERSION = 3`，v2 兼容读取 | 已完成 |
| A-02 | P0 | 数据模型 | 合并规则升级：`lastActionAt = max(updatedAt, deletedAt)` 新者胜 | 已完成 |
| A-03 | P0 | 数据模型 | 墓碑 30 天物理清理（`TOMBSTONE_DAYS`） | 已完成 |
| A-04 | P0 | store | 删除/撤销/清空已完成后/删除项目/导入/恢复 全部走软删除语义，活/墓碑双集合 | 已完成 |
| A-05 | P1 | 桌面 | Rust：`backup_tasks` 滚动备份（保留 10 份）+ `list_backups` + `restore_backup` | 已完成 |
| A-06 | P1 | UI | 备份弹窗（列表/恢复）；浏览器数据风险提示 `#data-hint` + 一键导出 | 已完成 |
| B-01 | P0 | 同步 | 同步引擎：pull → merge → push、rev 冲突重试（≤3）、debounce 5s、60s 轮询、聚焦/online 触发、指数退避 | 已完成 |
| B-02 | P0 | 同步 | 会话持久化 `work-todo.sync.v1`（配置/token/rev/lastSyncedAt） | 已完成 |
| B-03 | P0 | 同步 | PocketBase Provider：注册/登录/`sync_docs` 读写/rev 校验 | 已完成 |
| B-04 | P1 | 同步 | WebDAV Provider：GET/PUT JSON 文件、`If-Match` 乐观锁 | 已完成 |
| B-05 | P0 | UI | 同步设置弹窗 `#sync-modal` + 状态指示 `#sync-status`（ANTI-AI 约束） | 已完成 |
| B-06 | P1 | 协同 | 同步与撤销/导入导出/桌面恢复协同：合并后拆分落盘、导入后触发同步 | 已完成 |
| C-01 | P1 | 契约 | CLAUDE.md / BUILD.md 存储契约更新；版本号 0.4.0 三处同步 | 已完成 |
| C-02 | P1 | 测试 | 既有测试夹具升级 v3；新增用例见 §5 | 已完成 |

**明确不做（本期）**：realtime、设备会话管理、端到端加密、冲突历史、账号体系（OAuth/邮箱验证）。见 SYNC-DESIGN §9。

---

## 3. 规划原则

1. **Local-first**：同步层任何故障不影响本地增删改；失败状态诚实展示。
2. **单一数据入口**：所有读写仍经 `store/tasks.js`；同步引擎通过回调注入，不反向依赖 store。
3. **契约只增不改**：键名不变；schema 加字段不删不改；payload 形状导出/导入/同步三用。
4. **UI 零破坏**：既有 DOM id/class 一律不动，只新增；遵守 `design/ANTI-AI.md`。
5. **测试同权**：每条变更带自动化用例；破坏性场景（删除同步、并发 push）必有回归。

---

## 4. 分阶段实施

### M1 数据模型与 store（A-01 ~ A-04）

- `src/constants.js`：`SCHEMA_VERSION = 3`、`TOMBSTONE_DAYS = 30`、`SYNC_KEY`；
- `src/core/tasks.js` / `projects.js`：normalize/factory/patch 增加 `deletedAt`；新增 `lastActionAt`；
- `src/core/transfer.js`：`mergeImportTasks` 改用 `lastActionAt`；新增 `purgeDeleted`；
- `src/store/tasks.js`：活/墓碑双集合 + 软删除 + 撤销复活 + `applySyncResult`。

**验收**：删除的任务不出现在任何视图/统计/通知；撤销后复活且 `updatedAt` 更新；v2 数据读入无损；导入含墓碑 payload 后删除状态正确传播。

### M2 桌面备份与数据提示（A-05 ~ A-06）

- `src-tauri/src/lib.rs`：三个备份命令（原子写、滚动清理）；
- `src/lib/tauri.js`：桥接封装；启动/导入后自动备份；
- `BackupModal` + `#data-hint`。

**验收**：桌面端重启后备份文件存在且 ≤10 份；恢复备份经确认后数据被替换；浏览器端显示数据风险提示。

### M3 同步引擎与 Provider（B-01 ~ B-04）

- `src/lib/sync/engine.js`：状态机 + 触发器 + 退避；
- `src/lib/sync/session.js`：`work-todo.sync.v1` 读写；
- `src/lib/sync/providers/pocketbase.js`、`webdav.js`（原生 fetch）。

**验收**：mock Provider 下 pull-merge-push 正确；rev 冲突自动重试；断网时本地可写、状态为离线/失败；恢复网络后自动收敛。

### M4 同步 UI 与协同（B-05 ~ B-06）

- `SyncSettingsModal`、`#sync-status`、MobileDrawer 入口对齐；
- 导入/撤销/桌面恢复后触发同步。

**验收**：可完成注册/登录/立即同步/退出全流程；状态行随引擎状态实时变化；UI 符合 ANTI-AI 约束（设计令牌测试通过）。

### M5 契约与回归（C-01 ~ C-02）

- CLAUDE.md、docs/BUILD.md、版本号 0.4.0（package.json / Cargo.toml / tauri.conf.json）；
- 全量测试多轮（§5）。

---

## 5. 测试计划（多轮）

| 轮次 | 范围 | 重点 |
|------|------|------|
| T1 单元 · core | `tests/unit/tombstones.test.js`（新）+ 既有 core 测试升级 | 墓碑 normalize、lastActionAt 合并、purge、v2 兼容 |
| T2 单元 · store/存储 | store 软删除/撤销/导入导出往返、storage/tauri 桥接 | 撤销复活、镜像含墓碑、备份命令调用 |
| T3 单元 · 同步 | `tests/unit/sync-engine.test.js`、`sync-providers.test.js`（新） | debounce/轮询/退避/rev 冲突/登录流（mock fetch） |
| T4 组件 | 同步弹窗、状态指示、备份弹窗、数据提示 | DOM 契约、状态文案、表单校验 |
| T5 E2E | 既有 e2e 全绿 + `e2e-sync.test.js`（新，mock HTTP 服务端） | 端到端登录→同步→双端删除传播；夹具升级 v3 |
| T6 回归 | `npm test` + `npm run test:e2e` 全量 | 零回归；测试规模 ≥ 既有 |

每轮失败项即时修复并重跑该轮，最后跑 T6 收口。

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| 双集合拆分遗漏消费方 | state.tasks 保持「仅活数据」语义，UI 层零改动；e2e 断言删除项不可见 |
| e2e 夹具与 v3 不兼容 | normalize 自动补字段，夹具只在断言 schemaVersion 处改动 |
| Rust 备份逻辑编译/平台差异 | 逻辑保持最小（写文件+排序清理）；JS 桥接层 mock 测试 |
| 同步 UI 触碰设计令牌 | design-tokens 测试已有；新样式只用既有变量 |

---

## 7. 交付记录（2026-10-10）

**测试规模（全绿，多轮复跑稳定）**

| 轮次 | 范围 | 结果 |
|------|------|------|
| T1–T4 | `npm test`（单元 20+ 文件 + 组件 7 文件） | 314 通过（新增 62：墓碑 12 / store 软删除 11 / 同步 Provider 13 / 同步引擎 13 / 同步与备份 UI 9 / 备份桥接 4） |
| T5 | `npm run test:e2e`（真浏览器） | 38 通过（既有 33 + 新增 5：墓碑不复活、撤销复活、登录推送、远端拉取、双端删除传播） |
| T6 | 稳定性复跑 | 单元/组件 ×3、e2e ×2 全绿（修复 1 处既有排序时序抖动：`task-list` 撤销用例钉死 createdAt） |
| — | `cargo check` / `cargo test` | 通过（Rust 为薄壳，行为由 JS 桥接测试覆盖） |

**契约变更（已同步至 CLAUDE.md / BUILD.md）**

- `SCHEMA_VERSION = 2 → 3`：任务/项目新增 `deletedAt` 软删除墓碑，v2 自动升级读取
- localStorage 新增 `work-todo.sync.v1`（同步会话）；桌面 `app_data_dir/backups/` 滚动备份（保留 10 份）
- 导出 payload 与同步 wire 格式统一；合并规则 `updatedAt` → `max(updatedAt, deletedAt)` LWW
