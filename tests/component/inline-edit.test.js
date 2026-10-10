/* Component tests — inline editing on the task row: priority cell opens the
 * prio menu, due cell opens the due menu (quick chips + date/time inputs). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString, addDays, weekRange } from '../../src/core/dates.js';

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

/** Menus are teleported to document.body — query the real DOM. */
const menu = (cls) => document.querySelector(cls);
const itemByLabel = (root, sel, label) =>
  Array.from(root.querySelectorAll(sel)).find((n) => n.textContent.trim() === label);

describe('inline priority edit (row cell → prio menu)', () => {
  it('clicking .task-col-prio opens the menu and applying a pick updates the store', async () => {
    const t = tasks.createTask({ title: '调优先级', status: 'todo', priority: 'medium' });
    await flushPromises();

    expect(wrapper.find('.task-card .task-col-prio').exists()).toBe(true);
    await wrapper.find('.task-card .task-col-prio').trigger('click');
    await flushPromises();

    const m = menu('.prio-menu');
    expect(!!m).toBe(true); // prio menu opened
    const item = itemByLabel(m, '.row-menu-item', '高');
    expect(!!item).toBe(true); // menu item 高
    item.click();
    await flushPromises();

    expect(tasks.getTask(t.id).priority).toBe('high');
    expect(wrapper.find('#toast').text()).toContain('优先级：高');
    expect(menu('.prio-menu')).toBe(null); // closed after pick
  });

  it('marks the current priority and closes on outside click', async () => {
    tasks.createTask({ title: '当前优先级', status: 'todo', priority: 'low' });
    await flushPromises();

    await wrapper.find('.task-card .task-col-prio').trigger('click');
    await flushPromises();
    const m = menu('.prio-menu');
    const current = m.querySelector('.row-menu-item.is-current');
    expect(current && current.textContent.trim()).toBe('低');

    ui.closeAllPops();
    await flushPromises();
    expect(menu('.prio-menu')).toBe(null);
  });
});

describe('inline due edit (row cell → due menu)', () => {
  it('quick chips set the due date (今天 / 明天 / 下周一)', async () => {
    const t = tasks.createTask({ title: '调时间', status: 'todo', dueDate: null });
    await flushPromises();

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    const m = menu('.due-menu');
    expect(!!m).toBe(true); // due menu opened

    itemByLabel(m, '.due-quick button', '今天').click();
    await flushPromises();
    expect(tasks.getTask(t.id).dueDate).toBe(todayString());
    expect(wrapper.find('#toast').text()).toContain('截止：今天');

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    itemByLabel(menu('.due-menu'), '.due-quick button', '明天').click();
    await flushPromises();
    expect(tasks.getTask(t.id).dueDate).toBe(addDays(todayString(), 1));

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    itemByLabel(menu('.due-menu'), '.due-quick button', '下周一').click();
    await flushPromises();
    expect(tasks.getTask(t.id).dueDate).toBe(addDays(weekRange().end, 1));
  });

  it('date/time inputs set arbitrary values and 清除 empties the due', async () => {
    const t = tasks.createTask({ title: '精确设置', status: 'todo', dueDate: null, dueTime: null });
    await flushPromises();

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    const dateInput = menu('.due-menu').querySelector('input[type="date"]');
    dateInput.value = '2026-12-25';
    dateInput.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(tasks.getTask(t.id).dueDate).toBe('2026-12-25');
    expect(menu('.due-menu')).toBe(null); // closed after pick

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    const timeInput = menu('.due-menu').querySelector('input[type="time"]');
    timeInput.value = '15:30';
    timeInput.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(tasks.getTask(t.id).dueTime).toBe('15:30');
    expect(wrapper.find('#toast').text()).toContain('时间：15:30');

    await wrapper.find('.task-card .task-due').trigger('click');
    await flushPromises();
    itemByLabel(menu('.due-menu'), '.due-quick button', '清除').click();
    await flushPromises();
    expect(tasks.getTask(t.id).dueDate).toBe(null);
    expect(tasks.getTask(t.id).dueTime).toBe(null);
    expect(wrapper.find('#toast').text()).toContain('已清除截止时间');
  });

  it('empty due cell carries the 设置时间 placeholder affordance', async () => {
    tasks.createTask({ title: '无时间', status: 'todo', dueDate: null });
    await flushPromises();
    expect(wrapper.find('.task-card .task-due').classes()).toContain('is-empty');
    expect(wrapper.find('.task-card .task-due').attributes('aria-label')).toBe('设置截止时间');
  });
});
