/* Component tests — 逾期视图：侧栏「逾期」入口、逾期分流、空态。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { addDays, todayString } from '../../src/core/dates.js';

let wrapper;
let router;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, router, tasks, ui } = await mountApp({ route: '/all' }));
  tasks.createTask({ title: '逾期任务', status: 'todo', dueDate: '2000-01-01' });
  tasks.createTask({ title: '未来任务', status: 'todo', dueDate: addDays(todayString(), 10) });
  tasks.createTask({ title: '无期任务', status: 'todo' });
  await flushPromises();
});

afterEach(async () => {
  await cleanup();
});

const cards = () => wrapper.findAll('#task-list .task-card');

describe('逾期视图', () => {
  it('侧栏有「逾期」入口，计数只含逾期未完成', async () => {
    const overdueNav = wrapper.find('[data-view="overdue"]');
    expect(overdueNav.exists()).toBe(true);
    expect(overdueNav.text()).toContain('逾期');
    expect(wrapper.find('#nav-count-overdue').text()).toBe('1');
  });

  it('路由 /overdue 只列逾期任务，标题为「逾期」', async () => {
    await router.push('/overdue');
    await flushPromises();

    expect(ui.state.viewMode).toBe('overdue');
    expect(ui.state.filters.range).toBe('overdue');
    expect(wrapper.find('#list-title').text()).toBe('逾期');
    const titles = cards().map((c) => c.find('.task-title').text());
    expect(titles).toEqual(['逾期任务']);
    expect(cards()[0].classes()).toContain('is-overdue');
  });

  it('逾期视图隐藏搁置与归档中的逾期任务', async () => {
    tasks.shelveTask(tasks.state.tasks[0].id, true);
    const done = tasks.createTask({ title: '归档的逾期', status: 'done', dueDate: '2000-01-01' });
    // 归档的必须是未完成才算逾期分流对象——改为未完成再归档
    tasks.updateTask(done.id, { status: 'todo' });
    tasks.archiveTask(done.id, true);
    await flushPromises();

    await router.push('/overdue');
    await flushPromises();

    const titles = cards().map((c) => c.find('.task-title').text());
    expect(titles).toEqual([]);
  });

  it('没有逾期任务时显示专属空态文案', async () => {
    tasks.setTasks([]);
    await flushPromises();
    await router.push('/overdue');
    await flushPromises();
    const empty = wrapper.find('#task-list .empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('没有逾期的任务');
  });

  it('已完成状态不会出现在逾期视图', async () => {
    tasks.updateTask(tasks.state.tasks[0].id, { status: 'done' });
    await flushPromises();
    await router.push('/overdue');
    await flushPromises();
    expect(cards().length).toBe(0);
    expect(wrapper.find('#nav-count-overdue').text()).toBe('0');
  });
});
