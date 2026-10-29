/* Component tests — 已完成行内联显示创建/完成时间（右侧信息图标已移除）。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { useUiStore } from '../../src/store/ui.js';
import { formatIsoStamp } from '../../src/core/dates.js';

let wrapper;
let tasks;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks } = await mountApp({ route: '/all' }));
});

afterEach(async () => {
  await cleanup();
});

const card = (id) => wrapper.find(`.task-card[data-id="${id}"]`);

describe('已完成任务的创建/完成时间', () => {
  it('完成行内联显示「创建于 … · 完成于 …」两个时间', async () => {
    const t = tasks.createTask({ title: '已完成任务', status: 'done' });
    const done = tasks.getTask(t.id);
    useUiStore().setDoneExpanded(true); // done cards are collapsed by default
    await flushPromises();

    const line = card(done.id).find('.task-times');
    expect(line.exists()).toBe(true);
    expect(line.text()).toContain(`创建于 ${formatIsoStamp(done.createdAt)}`);
    expect(line.text()).toContain(`完成于 ${formatIsoStamp(done.completedAt)}`);
    expect(line.text()).toContain('·');
  });

  it('未完成行不显示时间行', async () => {
    const t = tasks.createTask({ title: '待办任务', status: 'todo' });
    await flushPromises();
    expect(card(t.id).find('.task-times').exists()).toBe(false);
  });

  it('所有行都不再有信息图标，删除按钮保留', async () => {
    const a = tasks.createTask({ title: '待办任务', status: 'todo' });
    const b = tasks.createTask({ title: '已完成任务', status: 'done' });
    useUiStore().setDoneExpanded(true);
    await flushPromises();

    expect(wrapper.findAll('[aria-label="查看任务详情"]').length).toBe(0);
    expect(card(a.id).find('[aria-label="删除任务"]').exists()).toBe(true);
    expect(card(b.id).find('[aria-label="删除任务"]').exists()).toBe(true);
  });
});
