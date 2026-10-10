/* work-todo — shared constants (pure, no DOM / no Vue) */

export const STORAGE_KEY = 'work-todo.tasks.v1';
export const PROJECTS_KEY = 'work-todo.projects.v1';
export const UI_PREFS_KEY = 'work-todo.ui.v1';
export const NOTIFY_KEY = 'work-todo.notified.v1';
export const SYNC_KEY = 'work-todo.sync.v1';
export const UPDATE_KEY = 'work-todo.update.v1';
export const UPDATE_REPO = 'cyamoyed/work-todo';
export const UPDATE_AUTO_CHECK_MS = 6 * 60 * 60 * 1000;
// 检查失败（断网/限流）后的短退避：到点允许自动复查，不占用 6 小时节流窗口
export const UPDATE_RETRY_MS = 15 * 60 * 1000;
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
