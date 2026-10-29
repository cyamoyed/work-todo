# work-todo 数据持久化与多端同步 · 设计文档

> 版本：v1.0 · 编制日期：2026-10-10 · 状态：**已批准，实施中**
> 输入：v0.4 需求「数据持久化且多端同步」
> 关联：`docs/DEV-PLAN-v04.md`（开发计划）· `design/ANTI-AI.md`（UI 约束）

---

## 1. 目标与约束

### 1.1 目标

1. **持久化可靠**：localStorage 被清空、桌面文件损坏时有恢复路径；
2. **多端同步**：浏览器端与 Tauri 桌面端（多台设备）共享同一份任务/项目数据；
3. **离线优先**：无网照常可用，联网后自动收敛，同步失败不影响主功能。

### 1.2 约束

| 约束 | 说明 |
|------|------|
| 不推翻现有架构 | localStorage 仍是本地主存储；`src/core` 纯逻辑、`src/lib` I/O、store 编排的分层不变 |
| 依赖克制 | Vue 是唯一运行时依赖；同步通信使用原生 `fetch`，不引入 SDK |
| 数据量小 | 个人待办（数百条级），秒级同步延迟可接受，无需实时协作编辑 |
| 隐私 | 数据可自建服务端（PocketBase），用户可选零后端方案（WebDAV 网盘） |
| 存储契约演进 | 键名不变；任务 schema v2 → v3 **只增字段**，旧数据可读可导 |

### 1.3 明确不做（本期）

账号体系（邮箱验证/OAuth）、端到端加密、实时推送（realtime）、多设备会话管理、子任务/附件同步、团队协作。见 §9 后续演进。

---

## 2. 现状分析：同步的雏形已存在

| 现有能力 | 位置 | 对同步的意义 |
|----------|------|--------------|
| `createdAt` / `updatedAt` 每实体维护 | `src/core/tasks.js` `applyTaskPatch` | LWW（last-write-wins）冲突仲裁的依据 |
| 按 id 合并、新者胜 | `src/core/transfer.js` `mergeImportTasks` | **就是一套实体级合并引擎**，导入即「手动同步」 |
| 导出 payload 带 `schemaVersion` | `src/core/transfer.js` `buildExportPayload` | 现成的同步数据格式 |
| 桌面文件镜像 + 空库恢复 | `src/lib/tauri.js` `bootstrapDesktopStorage` | 桌面端已有第二份数据 |
| 持久化失败可见 | `src/store/tasks.js` `storageError` | 错误诚实原则 |

**缺口**：① 硬删除——A 端删除后 B 端合并会「复活」任务；② 无远端存储与触发机制；③ localStorage 可被浏览器清除，无兜底。

---

## 3. 总体架构：Local-first + SyncProvider

**原则：本地永远是主存储，同步是后台增强。** 同步层可插拔（Provider），服务端无需理解任务语义。

```
store/tasks.js（唯一数据入口，不变）
  ├── lib/storage.js      localStorage 本地主存储（不变）
  ├── lib/tauri.js        桌面文件镜像 + 滚动备份（增强）
  └── lib/sync/           ★ 新增
        ├── engine.js     pull → merge → push 状态机（触发/重试/退避）
        ├── session.js    同步配置与凭据持久化（work-todo.sync.v1）
        └── providers/
              ├── pocketbase.js   推荐：自建后端
              └── webdav.js       备选：零后端（网盘）
src/core/transfer.js      合并引擎（升级为含墓碑的 LWW）
src-tauri/src/lib.rs      文件 I/O + 备份（薄壳，不变位）
```

---

## 4. 数据模型演进（SCHEMA_VERSION 3）

### 4.1 软删除墓碑（tombstone）

删除改为**软删除**，写入 `deletedAt` 时间戳，实体留在存储中作为墓碑：

```js
// 任务/项目统一规则
deletedAt: string | null   // ISO 时间戳；非空 = 已删除（墓碑）
```

- **UI 与统计一律只见活数据**：store 维护 `state.tasks` / `state.projects`（仅活实体）与 `state.deletedTasks` / `state.deletedProjects`（墓碑）两个集合，现有全部 UI 消费方零改动；
- **持久化/导出/同步为单一数组**：活实体 + 墓碑合并存储，墓碑携带 `deletedAt`；
- **墓碑保留 30 天**（`TOMBSTONE_DAYS`），过期在加载/合并后物理清除。离线超过 30 天的设备可能复活已删任务——个人场景可接受，文档明示；
- **撤销 = 复活**：`restoreTasks` 清除 `deletedAt` 并将 `updatedAt` 置为当前时间（复活是一次编辑动作，参与 LWW 仲裁）。

### 4.2 合并规则（LWW 升级版）

对每个实体 id，定义**最后动作时间**：

```
lastActionAt(e) = max(e.updatedAt, e.deletedAt || '')
```

合并时取 `lastActionAt` 较大者；相等时取传入方（与现行为一致）。该规则同时正确处理「改后删」「删后改」「两设备同时改」的时序。

### 4.3 版本兼容

| 版本 | 处理 |
|------|------|
| v2 及以下（无 `deletedAt`） | `normalizeTask`/`normalizeProject` 补 `deletedAt: null`，正常读入 |
| v3 | 当前版本，`SCHEMA_VERSION = 3` |
| 导入校验 | `schemaVersion` 允许 `1..3`，超出拒绝并提示 |

### 4.4 项目删除语义（不变）

删除项目 = 墓碑化项目 + 解绑其任务（`projectId → null`），不删任务（`design/ANTI-AI.md` 约定）。

---

## 5. 同步协议

### 5.1 服务端数据形态

服务端只存**每用户一份 JSON blob**（即导出 payload 形状）+ 版本号：

```
{ payload: { schemaVersion, exportedAt, app, tasks, projects }, rev: number }
```

任务语义完全在客户端，服务端可以是任意能存取 JSON 的东西。

### 5.2 单轮同步：pull → merge → push

```
1. pull()  →  { payload, rev }
2. merged  =  mergeImportTasks(localCombined, remotePayload, 'merge')
3. apply merged 到本地（活/墓碑拆分 + 墓碑清理 + 落盘）
4. push(mergedPayload, expectedRev = rev)
   ├─ 成功 → 记录 lastSyncedAt
   └─ rev 冲突（409/412）→ 回到 1 重试（最多 3 次）
```

**并发收敛论证**：两设备同时 push 时，后写者可能覆盖前者的 blob，但**双方本地都保留自己的改动**（含墓碑 30 天），下一轮 pull-merge 会把被覆盖的改动重新合并回来。即：blob 是「合并缓存」，本地是改动的权威来源，系统最终收敛。rev 检查的作用是把收敛时延从「下一轮」缩到「当场重试」。

**时钟偏移**：LWW 依赖客户端 `updatedAt`；设备时钟偏差过大时最多导致单实体错误取舍，不影响收敛（双方仍会看到彼此数据）。服务端 `rev` 为单调递增整数，不受时钟影响。

### 5.3 触发时机

| 触发 | 延迟 |
|------|------|
| 应用启动（本地加载 + 桌面恢复后） | 立即 |
| 本地数据变更（增删改/导入/撤销） | debounce 5 秒 |
| 窗口重新聚焦 / 网络恢复 `online` | 立即（节流 10 秒内不重复） |
| 定时轮询 | 60 秒 |

### 5.4 错误处理

- 网络失败/服务端错误 → 状态 `error`，指数退避重试（30s → 60s → 120s → 封顶 300s），恢复后回到常规节奏；
- 未登录/未配置 → 状态 `disabled`，完全不影响本地功能；
- 一切同步失败**不得**阻塞本地增删改。

### 5.5 会话持久化

localStorage 新键 `work-todo.sync.v1`：`{ provider, url, username/email, token, password, rev, lastSyncedAt }`。

- PocketBase 存 API token（JWT，带 `exp`）+ 密码（仅本机）：token 到期前经 `auth-refresh` 自动续期，token 失效时用密码静默重新登录，长时间使用不掉登录；
- WebDAV 需要 Basic 认证凭据，存于本机并在 UI 明示「凭据保存在本机」；
- 密码不进 sessionStorage、不进导出/同步文件；UI 明示「登录凭据仅保存在本机」。

---

## 6. Provider 设计

统一接口（`src/lib/sync/providers/`）：

```js
{
  kind: 'pocketbase' | 'webdav',
  login(credentials) → session,      // 可选（WebDAV 直接可用）
  pull(session) → { payload, rev },
  push(session, payload, expectedRev) → { rev },  // rev 不符时抛 ConflictError
}
```

### 6.1 PocketBase（推荐，自建）

- 部署：单个 Go 二进制 + SQLite 文件，一台 VPS 即可，数据在自己手里；
- 认证：`POST /api/collections/users/auth-with-password`（注册用 `POST /api/collections/users/records`）；
- 数据：自建数据集合（名称可配置，默认 `work_todo`，PocketBase 集合名仅允许字母数字下划线），字段 `user`(relation) / `payload`(json) / `rev`(number)，记录按用户一对一；
- push 采用「读 rev → 校验 → PATCH」，窗口极窄的 TOCTOU 由 §5.2 收敛论证兜底。

### 6.2 WebDAV（备选，零后端）

- 把 payload 作为单个 JSON 文件读写（如坚果云网盘 `work-todo-sync.json`）；
- push 用 `If-Match: <etag>` 实现真乐观锁，412 即冲突；
- **浏览器受 CORS 限制**：需服务端允许跨域（坚果云支持；自建 nginx 可配）。Tauri 桌面端不受限；
- 服务端选型对照：

| 方案 | 运维 | 浏览器端 | 桌面端 | 推荐度 |
|------|------|----------|--------|--------|
| PocketBase 自建 | 一台 VPS | ✅ | ✅ | ★★★ 首选 |
| Supabase 免费托管 | 无 | ✅（国内一般） | ✅ | ★★ 备选 |
| WebDAV 网盘 | 无 | ⚠️ 需 CORS | ✅ | ★★ 桌面优先时 |

---

## 7. 桌面端滚动备份（持久化加固）

Tauri `app_data_dir/backups/`：

| 命令 | 行为 |
|------|------|
| `backup_tasks(data)` | 写入 `work-todo-YYYYMMDD-HHmmss.json`，滚动保留最近 **10** 份，自动清理更旧 |
| `list_backups()` | 列出备份文件名/大小/修改时间 |
| `restore_backup(name)` | 读出备份内容，前端以**替换模式**导入（确认弹窗先行） |

触发时机：应用启动完成、导入完成后各一次。浏览器端无文件系统，以「数据提示 + 一键导出」替代。

---

## 8. UI 设计（遵循 design/ANTI-AI.md）

- 侧栏底部数据区新增：`同步设置` 入口（`#btn-sync-settings`）与同步状态行（`#sync-status`：未配置 / 同步中… / 已同步 HH:MM / 同步失败 / 离线）；
- `SyncSettingsModal`（`#sync-modal`）：Provider 单选（PocketBase / WebDAV）、服务地址、账号密码、登录/注册、立即同步、退出登录；发丝线分行、13–14px 字阶、无渐变无图标堆砌；
- `BackupModal`（`#backup-modal`，仅桌面端）：备份列表 + 恢复按钮；
- 浏览器端数据提示（`#data-hint`）：「数据仅存于本机浏览器，清除浏览器数据会丢失。建议开启同步或定期导出。」
- **DOM 契约**：只新增 id/class，不改动任何既有 id/class；`:hidden` 弹层模式与现有一致。

---

## 9. 后续演进（本期不做）

1. **Realtime**：PocketBase 订阅 → 多端秒级刷新；
2. **设备会话管理**：查看/踢出已登录设备；
3. **端到端加密**：客户端加密 payload，服务端不可读；
4. **冲突历史**：保留实体历史版本，支持回看（当前 LWW 静默取舍）。

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 删除操作经合并复活 | 软删除墓碑（§4.1），e2e 覆盖「A 删 B 同步」场景 |
| 设备时钟不准导致 LWW 误判 | 单实体粒度影响可接受；rev 仲裁不受时钟影响；文档明示 |
| 30 天墓碑过期后离线设备复活删除项 | 设计取舍，UI 文档明示；TOMBSTONE_DAYS 可调 |
| 同步服务不可用 | 本地功能零依赖同步层；退避重试；状态诚实显示 |
| 凭据存储（密码在 localStorage） | UI 明示「登录凭据仅保存在本机」；PocketBase 以 token 为主、密码仅用于到期/失效时自动续登 |
| 存储契约变更影响测试 | schema 只增字段 + `SCHEMA_VERSION=3`；同步更新 CLAUDE.md/BUILD.md 与全部测试夹具 |
