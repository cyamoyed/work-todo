/* work-todo — shared constants (pure, no DOM / no Vue) */

export const STORAGE_KEY = 'work-todo.tasks.v1';
export const PROJECTS_KEY = 'work-todo.projects.v1';
export const UI_PREFS_KEY = 'work-todo.ui.v1';
export const NOTIFY_KEY = 'work-todo.notified.v1';
export const SYNC_KEY = 'work-todo.sync.v1';
export const THEME_KEY = 'work-todo.theme.v1';
/** Theme settings: 'system' (default, follows prefers-color-scheme) | 'light' | 'dark'. */
export const THEME_SETTINGS = ['system', 'light', 'dark'];
export const UPDATE_KEY = 'work-todo.update.v1';
export const UPDATE_REPO = 'cyamoyed/work-todo';
// 应用常驻期间的自动复查窗口：每 15 分钟查一次（ETag 命中 304 不占 GitHub API 配额）
export const UPDATE_AUTO_CHECK_MS = 15 * 60 * 1000;
// 检查失败（断网/限流）后的复查窗口：15 分钟后自动重试
export const UPDATE_RETRY_MS = 15 * 60 * 1000;
// 自动检查的轮询节拍（60s）：shouldAutoCheck 按上面的窗口把关。节拍取密是为了
// 抵消「检查完成时间戳 vs 定时器起点」的漂移——15 分钟整的节拍会因每次检查的
// 耗时累计被窗口边界挡掉，退化成隔次（30 分钟）才真正检查。
export const UPDATE_POLL_TICK_MS = 60 * 1000;
// 单次更新请求的 HTTP 超时：直连 GitHub 挂起时不无限等待，到点降级到镜像源
export const UPDATE_CHECK_TIMEOUT_MS = 8000;
export const SCHEMA_VERSION = 3;
export const TOMBSTONE_DAYS = 30;
export const DEFAULT_SYNC_COLLECTION = 'work_todo';
export const NOTES_MAX = 2000;
export const TITLE_MAX = 120;
export const PROJECT_NAME_MAX = 40;
export const UNDO_TOAST_MS = 15000;
export const TAGS_MAX = 5;
export const TAG_MAX = 12;

export const REPEAT_LABELS = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  weekday: '工作日',
};

export const STATUS_LABELS = {
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
};

export const PRIORITY_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
};

export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
export const STATUS_CYCLE = ['todo', 'in-progress', 'done'];

export const PROJECT_COLORS = {
  slate: '#a1a1aa',
  ink: '#3f3f46',
  indigo: '#6366f1',
  amber: '#a16207',
};
