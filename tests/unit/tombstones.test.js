/* Unit tests — v3 tombstones: normalize compat, LWW merge rules, purge. */
import { describe, it, expect } from 'vitest';
import {
  normalizeTask,
  lastActionAt,
  softDeleteEntity,
  reviveEntity,
} from '../../src/core/tasks.js';
import { normalizeProject } from '../../src/core/projects.js';
import {
  mergeImportTasks,
  purgeDeleted,
  parseImportPayload,
  backupFilename,
} from '../../src/core/transfer.js';
import { SCHEMA_VERSION, TOMBSTONE_DAYS } from '../../src/constants.js';

const task = (over = {}) => ({
  id: 'a',
  title: '任务',
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('schema v3 normalize', () => {
  it('v2 task (no deletedAt) is upgraded with deletedAt: null', () => {
    const n = normalizeTask(task());
    expect(n.deletedAt).toBe(null);
  });

  it('keeps a non-empty deletedAt, nulls empty strings', () => {
    expect(normalizeTask(task({ deletedAt: '2026-02-01T00:00:00.000Z' })).deletedAt).toBe(
      '2026-02-01T00:00:00.000Z'
    );
    expect(normalizeTask(task({ deletedAt: '' })).deletedAt).toBe(null);
    expect(normalizeTask(task({ deletedAt: 5 })).deletedAt).toBe(null);
  });

  it('projects get deletedAt too', () => {
    const p = normalizeProject({ id: 'p', name: '项目' });
    expect(p.deletedAt).toBe(null);
    expect(
      normalizeProject({ id: 'p', name: '项目', deletedAt: '2026-02-01T00:00:00.000Z' }).deletedAt
    ).toBe('2026-02-01T00:00:00.000Z');
  });

  it('SCHEMA_VERSION is 3 and import accepts 2/3 but not 4', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(parseImportPayload({ schemaVersion: 2, tasks: [] }).ok).toBe(true);
    expect(parseImportPayload({ schemaVersion: 3, tasks: [] }).ok).toBe(true);
    expect(parseImportPayload({ schemaVersion: 4, tasks: [] }).ok).toBe(false);
    const parsed = parseImportPayload({
      schemaVersion: 3,
      tasks: [task({ deletedAt: '2026-02-01T00:00:00.000Z' })],
    });
    expect(parsed.tasks[0].deletedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('lastActionAt / soft delete / revive', () => {
  it('max(updatedAt, deletedAt)', () => {
    expect(lastActionAt(task({ updatedAt: '2026-03-01T00:00:00.000Z' }))).toBe(
      '2026-03-01T00:00:00.000Z'
    );
    expect(
      lastActionAt(
        task({ updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-04-01T00:00:00.000Z' })
      )
    ).toBe('2026-04-01T00:00:00.000Z');
  });

  it('softDeleteEntity stamps deletedAt only; reviveEntity clears it and bumps updatedAt', () => {
    const t = task({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const dead = softDeleteEntity(t, { now: '2026-05-01T00:00:00.000Z' });
    expect(dead.deletedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(dead.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    const alive = reviveEntity(dead, { now: '2026-06-01T00:00:00.000Z' });
    expect(alive.deletedAt).toBe(null);
    expect(alive.updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('LWW merge with tombstones', () => {
  const merge = (local, remote) =>
    mergeImportTasks({ tasks: local, projects: [] }, { tasks: remote, projects: [] }, 'merge');

  it('later delete beats earlier edit (delete propagates)', () => {
    const local = [task({ id: 'a', title: 'edited', updatedAt: '2026-01-01T00:00:00.000Z' })];
    const remote = [
      task({
        id: 'a',
        title: 'old',
        updatedAt: '2025-12-01T00:00:00.000Z',
        deletedAt: '2026-02-01T00:00:00.000Z',
      }),
    ];
    const r = merge(local, remote);
    expect(r.tasks[0].deletedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('later edit beats earlier delete (edit wins)', () => {
    const local = [
      task({
        id: 'a',
        title: 'gone',
        updatedAt: '2025-12-01T00:00:00.000Z',
        deletedAt: '2026-01-15T00:00:00.000Z',
      }),
    ];
    const remote = [task({ id: 'a', title: 'revived-by-edit', updatedAt: '2026-02-01T00:00:00.000Z' })];
    const r = merge(local, remote);
    expect(r.tasks[0].deletedAt).toBe(undefined); // incoming entity is live
    expect(r.tasks[0].title).toBe('revived-by-edit');
  });

  it('later delete beats later-older delete by max stamp; keeps union of ids', () => {
    const local = [
      task({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' }),
      task({ id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const remote = [
      task({ id: 'c', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const r = merge(local, remote);
    expect(r.tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('project merge uses the same rule', () => {
    const r = mergeImportTasks(
      {
        tasks: [],
        projects: [{ id: 'p', name: '本地', updatedAt: '2026-01-01T00:00:00.000Z' }],
      },
      {
        tasks: [],
        projects: [
          {
            id: 'p',
            name: '远端删',
            updatedAt: '2025-01-01T00:00:00.000Z',
            deletedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      },
      'merge'
    );
    expect(r.projects[0].deletedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('purgeDeleted', () => {
  it('drops tombstones older than TOMBSTONE_DAYS, keeps live and fresh', () => {
    const now = '2026-06-15T00:00:00.000Z';
    const fresh = new Date(new Date(now).getTime() - 2 * 86400000).toISOString();
    const stale = new Date(new Date(now).getTime() - (TOMBSTONE_DAYS + 5) * 86400000).toISOString();
    const list = [
      task({ id: 'live' }),
      task({ id: 'fresh-tomb', deletedAt: fresh }),
      task({ id: 'stale-tomb', deletedAt: stale }),
    ];
    const kept = purgeDeleted(list, { now });
    expect(kept.map((t) => t.id)).toEqual(['live', 'fresh-tomb']);
  });
});

describe('backupFilename', () => {
  it('is work-todo-YYYYMMDD-HHmmss.json', () => {
    const name = backupFilename(new Date(2026, 9, 10, 15, 4, 5));
    expect(name).toBe('work-todo-20261010-150405.json');
  });
});
