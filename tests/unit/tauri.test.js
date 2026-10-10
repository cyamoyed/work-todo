/* Unit tests — Tauri bridge: duck-typed invoke, save mirror, desktop bootstrap, backups. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTauri,
  tauriInvoke,
  mirrorSaveTasks,
  bootstrapDesktopStorage,
  backupTasks,
  listBackups,
  restoreBackup,
} from '../../src/lib/tauri.js';
import {
  createBackupNow,
  listBackupFiles,
  readBackupPayload,
  isBackupAvailable,
} from '../../src/lib/backup.js';
import { useTaskStore } from '../../src/store/tasks.js';

const store = useTaskStore();
let savedWindow;

beforeEach(() => {
  savedWindow = globalThis.window;
  localStorage.clear();
  store.load();
});

afterEach(() => {
  globalThis.window = savedWindow;
  vi.restoreAllMocks();
});

function withTauri(invokeImpl) {
  globalThis.window = {
    __TAURI_INTERNALS__: { invoke: invokeImpl },
  };
}

describe('isTauri / tauriInvoke', () => {
  it('not Tauri without the globals', () => {
    globalThis.window = {};
    expect(isTauri()).toBe(false);
    expect(tauriInvoke('save_tasks').catch(() => 'rejected')).resolves.toBe('rejected');
  });

  it('invoke routes to __TAURI_INTERNALS__.invoke', async () => {
    const invoke = vi.fn().mockResolvedValue('ok');
    withTauri(invoke);
    expect(isTauri()).toBe(true);
    await expect(tauriInvoke('save_tasks', { data: '[]' })).resolves.toBe('ok');
    expect(invoke).toHaveBeenCalledWith('save_tasks', { data: '[]' });
  });

  it('also supports legacy __TAURI__.core.invoke', async () => {
    const invoke = vi.fn().mockResolvedValue('ok');
    globalThis.window = { __TAURI__: { core: { invoke } } };
    expect(isTauri()).toBe(true);
    await expect(tauriInvoke('load_tasks')).resolves.toBe('ok');
    expect(invoke).toHaveBeenCalledWith('load_tasks', undefined);
  });
});

describe('mirrorSaveTasks', () => {
  it('fire-and-forget invoke with stringified tasks', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    withTauri(invoke);
    const list = [{ id: 'a' }];
    mirrorSaveTasks(list);
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith('save_tasks', { data: JSON.stringify(list) });
  });

  it('no-op outside Tauri', () => {
    globalThis.window = {};
    expect(() => mirrorSaveTasks([])).not.toThrow();
  });
});

describe('bootstrapDesktopStorage', () => {
  it('restores normalized tasks from the desktop file', async () => {
    const payload = JSON.stringify([
      { id: 'd1', title: '桌面任务', status: 'todo', priority: 'medium' },
    ]);
    withTauri(() => Promise.resolve(payload));
    const restored = await bootstrapDesktopStorage();
    expect(restored.length).toBe(1);
    expect(restored[0].title).toBe('桌面任务');
  });

  it('resolves null on empty / invalid / rejected', async () => {
    withTauri(() => Promise.resolve(''));
    expect(await bootstrapDesktopStorage()).toBeNull();
    withTauri(() => Promise.resolve('{corrupt'));
    expect(await bootstrapDesktopStorage()).toBeNull();
    withTauri(() => Promise.reject(new Error('nope')));
    expect(await bootstrapDesktopStorage()).toBeNull();
    globalThis.window = {};
    expect(await bootstrapDesktopStorage()).toBeNull();
  });

  it('store bootstrapDesktop replaces tasks and persists', async () => {
    const payload = JSON.stringify([
      { id: 'd2', title: '恢复项', status: 'todo', priority: 'high', dueDate: '2026-12-01' },
    ]);
    withTauri(() => Promise.resolve(payload));
    const changed = await store.bootstrapDesktop();
    expect(changed).toBe(true);
    expect(store.getTasks()[0].title).toBe('恢复项');
    const raw = JSON.parse(localStorage.getItem('work-todo.tasks.v1'));
    expect(raw[0].id).toBe('d2');
  });
});

describe('backup bridge + helpers', () => {
  it('backupTasks/listBackups/restoreBackup route to the right commands', async () => {
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'backup_tasks') return 'work-todo-20261010-120000.json';
      if (cmd === 'list_backups') return [{ name: 'work-todo-20261010-120000.json', size: 12, modified: 0 }];
      if (cmd === 'restore_backup') return '{"tasks":[],"projects":[]}';
      return null;
    });
    withTauri(invoke);
    expect(await backupTasks('[]', 'work-todo-20261010-120000.json')).toBe('work-todo-20261010-120000.json');
    expect(invoke).toHaveBeenCalledWith('backup_tasks', {
      data: '[]',
      name: 'work-todo-20261010-120000.json',
    });
    expect((await listBackups()).length).toBe(1);
    expect(await restoreBackup('work-todo-20261010-120000.json')).toBe('{"tasks":[],"projects":[]}');
  });

  it('createBackupNow stringifies the payload with a timestamped name', async () => {
    const invoke = vi.fn(async (cmd, args) => {
      expect(cmd).toBe('backup_tasks');
      expect(args.name).toMatch(/^work-todo-\d{8}-\d{6}\.json$/);
      expect(JSON.parse(args.data).tasks.length).toBe(1);
      return args.name;
    });
    withTauri(invoke);
    const name = await createBackupNow({ tasks: [{ id: 'a' }], projects: [] });
    expect(name).toMatch(/^work-todo-\d{8}-\d{6}\.json$/);
  });

  it('readBackupPayload parses JSON and nulls junk', async () => {
    withTauri(() => Promise.resolve('{"tasks":[{"id":"a"}],"projects":[]}'));
    const payload = await readBackupPayload('x.json');
    expect(payload.tasks[0].id).toBe('a');
    withTauri(() => Promise.resolve('{corrupt'));
    expect(await readBackupPayload('x.json')).toBeNull();
  });

  it('outside Tauri the helpers degrade to null/empty', async () => {
    globalThis.window = {};
    expect(await createBackupNow({ tasks: [], projects: [] })).toBeNull();
    expect(await listBackupFiles()).toEqual([]);
    expect(await readBackupPayload('x.json')).toBeNull();
    expect(isBackupAvailable()).toBe(false);
  });
});
