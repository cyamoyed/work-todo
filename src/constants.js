/* WorkTodo — shared constants (pure, no DOM / no Vue) */

export const STORAGE_KEY = 'worktodo.tasks.v1';
export const PROJECTS_KEY = 'worktodo.projects.v1';
export const UI_PREFS_KEY = 'worktodo.ui.v1';
export const NOTIFY_KEY = 'worktodo.notified.v1';
export const SYNC_KEY = 'worktodo.sync.v1';
export const SCHEMA_VERSION = 3;
export const TOMBSTONE_DAYS = 30;
export const DEFAULT_SYNC_COLLECTION = 'workTodo';
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
