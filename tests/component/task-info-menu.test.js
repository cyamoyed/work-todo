/* Component tests — task info menu (创建/完成时间 via the row's info button). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { formatIsoStamp } from '../../src/core/dates.js';

let wrapper;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks, ui } = await mountApp({ route: '/all' }));
});

afterEach(async () => {
  await cleanup();
});

const infoMenu = () => document.querySelector('.info-menu');

async function openInfoFor(task) {
  const btn = wrapper.find(`.task-card[data-id="${task.id}"] [aria-label="查看任务详情"]`);
  expect(btn.exists()).toBe(true);
  await btn.trigger('click');
  await flushPromises();
  return infoMenu();
}

describe('task info menu', () => {
  it('is hidden until the row info button is clicked', async () => {
    tasks.createTask({ title: '普通任务' });
    await flushPromises();
    expect(infoMenu()).toBe(null);
    await openInfoFor(tasks.state.tasks[0]);
    expect(infoMenu()).not.toBe(null);
  });

  it('shows created time for an open task and "—" for completion', async () => {
    const t = tasks.createTask({ title: '待办任务', status: 'todo' });
    await flushPromises();
    const menu = await openInfoFor(t);
    expect(menu.querySelector('[data-field="created"]').textContent).toBe(formatIsoStamp(t.createdAt));
    expect(menu.querySelector('[data-field="completed"]').textContent).toBe('—');
  });

  it('shows completed time for a done task', async () => {
    const t = tasks.createTask({ title: '已完成任务', status: 'done' });
    ui.setDoneExpanded(true); // done cards are collapsed by default
    await flushPromises();
    const done = tasks.getTask(t.id);
    const menu = await openInfoFor(done);
    expect(menu.querySelector('[data-field="created"]').textContent).toBe(formatIsoStamp(done.createdAt));
    expect(menu.querySelector('[data-field="completed"]').textContent).toBe(formatIsoStamp(done.completedAt));
  });

  it('closes via closeAllPops (Esc path)', async () => {
    tasks.createTask({ title: '关闭测试' });
    await flushPromises();
    await openInfoFor(tasks.state.tasks[0]);
    expect(infoMenu()).not.toBe(null);
    ui.closeAllPops();
    await flushPromises();
    expect(infoMenu()).toBe(null);
    expect(ui.state.infoMenu.open).toBe(false);
  });
});
