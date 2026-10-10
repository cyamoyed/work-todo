/* Component tests — task list render paths (port of tests/dom-behavior.test.js
 * sections: boot, renderList cards, status toggle, delete/undo/cancel, empty
 * state, done-collapse bar). Cards must be DIRECT children of #task-list. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';

let wrapper;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

const taskList = () => wrapper.find('#task-list');

/** Direct children of #task-list shaped like task cards (legacy `.children` contract). */
const cards = () =>
  Array.from(taskList().element.children).filter(
    (c) => c.classList && c.classList.contains('task-card')
  );

const directChildren = () => Array.from(taskList().element.children);

describe('boot renders empty state', () => {
  it('renders #task-list, zeroed stats and non-empty overview copy', () => {
    expect(taskList().exists()).toBe(true);
    expect(wrapper.find('#stat-total').text()).toBe('0');
    expect(wrapper.find('#overview-sub').text().length).toBeGreaterThan(0);
    expect(wrapper.find('#overview-sub').text()).toBe('先记下要做的事');
  });
});

describe('renderList cards', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '卡片标题', status: 'done', priority: 'high', dueDate: null });
    tasks.createTask({ title: '过期卡', status: 'todo', priority: 'low', dueDate: '2000-01-01' });
    await flushPromises();
  });

  it('renders task-cards as direct children of #task-list', () => {
    expect(cards().length).toBeGreaterThanOrEqual(1);
  });

  it('flags overdue card and priority classes', () => {
    expect(cards().some((c) => c.classList.contains('is-overdue'))).toBe(true);
    expect(
      cards().some((c) => c.classList.contains('prio-high') || c.classList.contains('prio-low'))
    ).toBe(true);
  });

  it('done task is collapsed behind the toggle bar by default', () => {
    expect(
      directChildren().some(
        (c) => c.id === 'done-toggle-bar' || (c.classList && c.classList.contains('done-toggle-bar'))
      )
    ).toBe(true);
    // done card not a direct child while collapsed
    expect(cards().some((c) => c.classList.contains('is-done'))).toBe(false);
  });

  it('done card weakened (is-done) when expanded', async () => {
    ui.setDoneExpanded(true);
    await flushPromises();
    expect(cards().some((c) => c.classList.contains('is-done'))).toBe(true);
    expect(cards().some((c) => c.classList.contains('prio-high'))).toBe(true);
    expect(cards().some((c) => c.classList.contains('is-overdue'))).toBe(true);
  });
});

describe('done-collapse bar', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '完成项', status: 'done' });
    tasks.createTask({ title: '未完项', status: 'todo' });
    await flushPromises();
  });

  it('is a direct child of #task-list with 展开 label, toggles to 收起', async () => {
    const bar = wrapper.find('#done-toggle-bar');
    expect(bar.exists()).toBe(true);
    expect(directChildren().includes(bar.element)).toBe(true);
    const toggle = wrapper.find('#done-toggle');
    expect(toggle.text()).toBe('已完成 1 项 · 展开');

    await toggle.trigger('click');
    await flushPromises();
    expect(toggle.text()).toBe('收起已完成');
    // done card now a direct child of the list
    expect(cards().some((c) => c.classList.contains('is-done'))).toBe(true);

    await toggle.trigger('click');
    await flushPromises();
    expect(toggle.text()).toBe('已完成 1 项 · 展开');
    expect(cards().some((c) => c.classList.contains('is-done'))).toBe(false);
  });
});

describe('status toggle cycles todo → in-progress → done → todo', () => {
  const statusToggle = () => wrapper.find('.task-card .status-toggle');

  it('walks the full cycle with one click per step and toasts each change', async () => {
    const t = tasks.createTask({ title: 'cycle', status: 'todo' });
    await flushPromises();
    expect(statusToggle().exists()).toBe(true); // status toggle exists

    await statusToggle().trigger('click');
    await flushPromises();
    expect(tasks.getTask(t.id).status).toBe('in-progress');
    expect(wrapper.find('#toast').text()).toContain('状态：进行中');

    await statusToggle().trigger('click');
    await flushPromises();
    expect(tasks.getTask(t.id).status).toBe('done');
    expect(wrapper.find('#toast').text()).toContain('已完成');

    // done tasks collapse by default — expand before next switch
    ui.setDoneExpanded(true);
    await flushPromises();

    await statusToggle().trigger('click');
    await flushPromises();
    expect(tasks.getTask(t.id).status).toBe('todo');
    expect(wrapper.find('#toast').text()).toContain('状态：待办');
  });

  it('right-click opens the status menu for direct jumps', async () => {
    const t = tasks.createTask({ title: 'jump', status: 'todo' });
    await flushPromises();

    await statusToggle().trigger('contextmenu');
    await flushPromises();
    const menu = document.querySelector('.status-menu');
    expect(!!menu).toBe(true); // status menu opened
    const item = Array.from(menu.querySelectorAll('.status-menu-item')).find(
      (n) => n.textContent.trim() === '已完成'
    );
    expect(!!item).toBe(true); // menu item 已完成
    item.click();
    await flushPromises();
    expect(tasks.getTask(t.id).status).toBe('done');
    expect(document.querySelector('.status-menu')).toBe(null); // closed after pick
  });

  it('completing a recurring task toasts 已生成下一次 with 查看 action', async () => {
    const t = tasks.createTask({ title: '每日例会', status: 'todo', repeat: 'daily' });
    await flushPromises();
    await statusToggle().trigger('click'); // todo → in-progress
    await statusToggle().trigger('click'); // in-progress → done
    await flushPromises();
    expect(tasks.getTask(t.id).status).toBe('done');
    const toast = wrapper.find('#toast');
    expect(toast.text()).toContain('已完成 · 已生成下一次「每日例会」');
    const btn = toast.find('button');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('查看');
    // one extra todo occurrence was generated
    expect(tasks.state.tasks.filter((x) => x.title === '每日例会' && x.status === 'todo').length).toBe(1);
  });
});

describe('delete confirm flow', () => {
  const delBtn = () => wrapper.find('.task-card [aria-label="删除任务"]');

  beforeEach(async () => {
    tasks.createTask({ title: '要删除的' });
    await flushPromises();
  });

  it('opens the confirm dialog with exact copy and focused cancel, then deletes', async () => {
    expect(delBtn().exists()).toBe(true); // delete button exists
    await delBtn().trigger('click');
    await flushPromises();

    const backdrop = wrapper.find('#confirm-backdrop');
    expect(backdrop.element.hidden).toBe(false); // confirm dialog open
    const message = wrapper.find('#confirm-message').text();
    expect(message).toContain('要删除的'); // confirm message has title
    expect(message).toContain('可撤销'); // confirm copy mentions undo
    expect(message).toBe('确定删除「要删除的」吗？删除后 15 秒内可撤销。'); // exact copy
    expect(document.activeElement).toBe(wrapper.find('#btn-confirm-cancel').element); // cancel focused (not delete)

    await wrapper.find('#btn-confirm-ok').trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.length).toBe(0); // task deleted
    expect(backdrop.element.hidden).toBe(true); // confirm closed
    const toast = wrapper.find('#toast');
    expect(toast.text()).toContain('撤销'); // toast offers 撤销
    expect(toast.text()).toContain('已删除「要删除的」');
  });
});

describe('undo delete via toast', () => {
  it('restores the task at its original index', async () => {
    // Pin identical timestamps: the due-sort tie-break is creation-order only
    // when createdAt matches (newest-first otherwise), so the first card must
    // stay deterministic.
    tasks.createTask({ title: '可撤销' }, { now: '2026-01-01T00:00:00.000Z' });
    tasks.createTask({ title: '另一个' }, { now: '2026-01-01T00:00:00.000Z' });
    await flushPromises();
    await wrapper.find('.task-card [aria-label="删除任务"]').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-confirm-ok').trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.map((t) => t.title)).toEqual(['另一个']); // deleted first

    const toast = wrapper.find('#toast');
    const btn = toast.find('button');
    expect(btn.exists()).toBe(true); // undo button present
    expect(btn.text()).toBe('撤销');
    await btn.trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.map((t) => t.title)).toEqual(['可撤销', '另一个']); // original index
    expect(wrapper.find('#toast').element.hidden).toBe(true);
  });
});

describe('cancel delete keeps task', () => {
  it('cancel leaves the task in place and closes the dialog', async () => {
    tasks.createTask({ title: '保留' });
    await flushPromises();
    await wrapper.find('.task-card [aria-label="删除任务"]').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-confirm-cancel').trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.length).toBe(1); // still there
    expect(tasks.state.tasks[0].title).toBe('保留');
    expect(wrapper.find('#confirm-backdrop').element.hidden).toBe(true); // confirm closed
  });
});

describe('empty state copy', () => {
  it('default empty state: 从第一件事开始 + 新建任务 button (direct child of list)', async () => {
    const empty = taskList().find('.empty-state');
    expect(empty.exists()).toBe(true);
    expect(directChildren()[0].classList.contains('empty-state')).toBe(true);
    expect(empty.text()).toContain('从第一件事开始');
    const btn = empty.find('button.btn-primary');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('新建任务');
    await btn.trigger('click');
    expect(ui.state.taskModalOpen).toBe(true); // button opens the create modal
  });

  it('searching empty state: 没有匹配的任务', async () => {
    tasks.createTask({ title: '唯一' });
    ui.setFilters({ search: 'zzz' });
    await flushPromises();
    const empty = taskList().find('.empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('没有匹配的任务');
    expect(empty.text()).toContain('换个关键词试试，或清空搜索。');
  });

  it('project empty state: 这个项目里还没有任务', async () => {
    const project = tasks.createProject({ name: '空项目' });
    ui.setFilters({ projectId: project.id });
    await flushPromises();
    const empty = taskList().find('.empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('这个项目里还没有任务');
    expect(empty.text()).toContain('用上方输入框记一笔，会直接归入当前项目。');
  });
});
