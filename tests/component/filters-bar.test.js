/* Component tests — filter dropdowns, stat chips, sort menu, search (port of
 * tests/dom-behavior.test.js sections: filter chip counts, search input
 * updates filters + clear). Range switching lives in the left nav only. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString } from '../../src/core/dates.js';

let wrapper;
let tasks;
let ui;
let router;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks, ui, router } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

const cards = () =>
  Array.from(wrapper.find('#task-list').element.children).filter(
    (c) => c.classList && c.classList.contains('task-card')
  );

const option = (popId, value) => wrapper.find(`#${popId} .pop-item[data-value="${value}"]`);

describe('filter dropdown counts', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '1', status: 'todo' });
    tasks.createTask({ title: '2', status: 'todo' });
    tasks.createTask({ title: '3', status: 'done' });
    await flushPromises();
  });

  it('status dropdown options carry data-count numbers matching the store', () => {
    const count = (v) => wrapper.find(`#status-filter .chip-count[data-count="${v}"]`).text();
    expect(count('all')).toBe('3');
    expect(count('todo')).toBe('2');
    expect(count('in-progress')).toBe('0');
    expect(count('done')).toBe('1');
  });

  it('picking status options narrows the rendered list without navigating', async () => {
    ui.setDoneExpanded(true); // done tasks collapse by default — expand to count them
    await flushPromises();
    await option('status-filter', 'todo').trigger('click');
    await flushPromises();
    expect(cards().length).toBe(2); // filter todo count
    expect(option('status-filter', 'todo').classes()).toContain('active');
    expect(ui.state.viewMode).toBe('today'); // dropdowns never push routes

    await option('status-filter', 'done').trigger('click');
    await flushPromises();
    expect(cards().length).toBe(1); // filter done count
    expect(ui.state.filters.status).toBe('done');

    await option('status-filter', 'all').trigger('click');
    await flushPromises();
    expect(ui.state.filters.status).toBe('all');
    expect(cards().length).toBe(3);
  });
});

describe('range dimension: left nav only', () => {
  it('main area has no range chips; navigation drives the range filter', async () => {
    expect(wrapper.find('#range-filter').exists()).toBe(false);

    await router.push('/week');
    await flushPromises();
    expect(ui.state.filters.range).toBe('week');

    await router.push('/today');
    await flushPromises();
    expect(ui.state.filters.range).toBe('today');

    await router.push('/all');
    await flushPromises();
    expect(ui.state.filters.range).toBe('all');
  });
});

describe('stat chips filter and toggle', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '今天到期', status: 'todo', dueDate: todayString() });
    tasks.createTask({ title: '逾期项', status: 'todo', dueDate: '2000-01-01' });
    tasks.createTask({ title: '推进中', status: 'in-progress' });
    await flushPromises();
  });

  it('chips reflect the strip stats', () => {
    const chips = wrapper.findAll('#strip .stat-chip');
    expect(chips.length).toBe(4);
    expect(chips[0].text()).toBe('待推进 2');
    expect(chips[1].text()).toBe('今日到期 1');
    expect(chips[2].text()).toBe('逾期 1');
    expect(chips[3].text()).toBe('进行中 1');
  });

  it('逾期 chip filters to overdue and toggles back to the view range', async () => {
    const overdueChip = wrapper.findAll('#strip .stat-chip')[2];
    await overdueChip.trigger('click');
    await flushPromises();
    expect(ui.state.filters.range).toBe('overdue');
    expect(overdueChip.classes()).toContain('active');
    expect(cards().length).toBe(1);

    await overdueChip.trigger('click');
    await flushPromises();
    expect(ui.state.filters.range).toBe('today'); // /today view default
    expect(overdueChip.classes()).not.toContain('active');
  });

  it('进行中 chip toggles the status filter', async () => {
    const chip = wrapper.findAll('#strip .stat-chip')[3];
    await chip.trigger('click');
    await flushPromises();
    expect(ui.state.filters.status).toBe('in-progress');
    expect(chip.classes()).toContain('active');
    expect(cards().length).toBe(1);

    await chip.trigger('click');
    await flushPromises();
    expect(ui.state.filters.status).toBe('all');
    expect(cards().length).toBe(3);
  });
});

describe('priority dropdown', () => {
  it('picking a priority filters without navigation', async () => {
    tasks.createTask({ title: '普通', priority: 'low' });
    tasks.createTask({ title: '急', priority: 'high' });
    await flushPromises();

    await option('priority-filter', 'high').trigger('click');
    expect(ui.state.filters.priority).toBe('high');
    expect(option('priority-filter', 'high').classes()).toContain('active');
    expect(option('priority-filter', 'all').classes()).not.toContain('active');
    expect(cards().length).toBe(1);

    await option('priority-filter', 'all').trigger('click');
    expect(ui.state.filters.priority).toBe('all');
    expect(cards().length).toBe(2);
  });
});

describe('sort menu selection', () => {
  it('updates #sort-label-text and the hidden #sort-select for all three modes', async () => {
    expect(wrapper.find('#sort-label-text').text()).toBe('按截止日'); // default
    expect(wrapper.find('#sort-select').element.value).toBe('due');

    await wrapper.find('#btn-sort').trigger('click');
    expect(ui.state.sortPopOpen).toBe(true);
    await wrapper.find('#sort-pop [data-value="priority"]').trigger('click');
    expect(ui.state.sortMode).toBe('priority');
    expect(wrapper.find('#sort-label-text').text()).toBe('按优先级'); // 按优先级
    expect(wrapper.find('#sort-select').element.value).toBe('priority');

    await wrapper.find('#btn-sort').trigger('click');
    await wrapper.find('#sort-pop [data-value="created"]').trigger('click');
    expect(ui.state.sortMode).toBe('created');
    expect(wrapper.find('#sort-label-text').text()).toBe('按创建时间'); // 按创建时间

    await wrapper.find('#btn-sort').trigger('click');
    await wrapper.find('#sort-pop [data-value="due"]').trigger('click');
    expect(ui.state.sortMode).toBe('due');
    expect(wrapper.find('#sort-label-text').text()).toBe('按截止日'); // 按截止日
  });
});

describe('clear-done button', () => {
  it('hidden with no done tasks, shown with done, clears via confirm + undo toast', async () => {
    expect(wrapper.find('#btn-clear-done').element.hidden).toBe(true); // hidden when no done tasks

    tasks.createTask({ title: '做完的', status: 'done' });
    await flushPromises();
    expect(wrapper.find('#btn-clear-done').element.hidden).toBe(false);

    await wrapper.find('#btn-clear-done').trigger('click');
    await flushPromises();
    expect(wrapper.find('#confirm-backdrop').element.hidden).toBe(false);
    expect(wrapper.find('#confirm-message').text()).toContain('将清除 1 项已完成任务');

    await wrapper.find('#btn-confirm-ok').trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.filter((t) => t.status === 'done').length).toBe(0);
    const toast = wrapper.find('#toast');
    expect(toast.text()).toContain('已清除 1 项');
    expect(toast.find('button').text()).toBe('撤销');

    await toast.find('button').trigger('click');
    await flushPromises();
    expect(tasks.state.tasks.filter((t) => t.status === 'done').length).toBe(1); // undo restores
  });
});

describe('search input updates filters + clear', () => {
  it('typing filters the list, clear restores it', async () => {
    tasks.createTask({ title: 'Apple Pie' });
    tasks.createTask({ title: 'Banana' });
    await flushPromises();
    expect(cards().length).toBe(2);

    await wrapper.find('#search-input').setValue('apple');
    await flushPromises();
    expect(cards().length).toBe(1); // search filters list
    expect(wrapper.find('#btn-clear-search').element.hidden).toBe(false);

    await wrapper.find('#btn-clear-search').trigger('click');
    await flushPromises();
    expect(cards().length).toBe(2); // clear restores list
    expect(wrapper.find('#search-input').element.value).toBe('');
    expect(wrapper.find('#btn-clear-search').element.hidden).toBe(true);
  });
});
