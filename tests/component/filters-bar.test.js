/* Component tests — filter bar, chips, sort menu, search (port of
 * tests/dom-behavior.test.js sections: filter chip counts, search input
 * updates filters + clear). */
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

const cards = () =>
  Array.from(wrapper.find('#task-list').element.children).filter(
    (c) => c.classList && c.classList.contains('task-card')
  );

const chip = (barId, value) => wrapper.find(`#${barId} .chip[data-value="${value}"]`);

describe('filter chip counts', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '1', status: 'todo' });
    tasks.createTask({ title: '2', status: 'todo' });
    tasks.createTask({ title: '3', status: 'done' });
    await flushPromises();
  });

  it('status chips carry data-count numbers matching the store', () => {
    const count = (v) => wrapper.find(`#status-filter .chip-count[data-count="${v}"]`).text();
    expect(count('all')).toBe('3');
    expect(count('todo')).toBe('2');
    expect(count('in-progress')).toBe('0');
    expect(count('done')).toBe('1');
  });

  it('clicking status chips narrows the rendered list (todo → 2, done → 1)', async () => {
    await chip('status-filter', 'todo').trigger('click');
    await flushPromises();
    expect(cards().length).toBe(2); // filter todo count
    expect(chip('status-filter', 'todo').classes()).toContain('active');

    await chip('status-filter', 'done').trigger('click');
    await flushPromises();
    expect(cards().length).toBe(1); // filter done count
    expect(ui.state.viewMode).toBe('done'); // done status navigates to /done
    expect(chip('status-filter', 'done').classes()).toContain('active');

    // leaving done view goes to /all with the chosen status preserved (legacy)
    await chip('status-filter', 'todo').trigger('click');
    await flushPromises();
    expect(ui.state.viewMode).toBe('all');
    expect(ui.state.filters.status).toBe('todo');
    expect(cards().length).toBe(2);
  });
});

describe('chip active toggling', () => {
  it('range chips navigate and toggle active state (今天/本周/全部)', async () => {
    await chip('range-filter', 'week').trigger('click');
    await flushPromises();
    expect(ui.state.viewMode).toBe('week');
    expect(ui.state.filters.range).toBe('week');
    expect(chip('range-filter', 'week').classes()).toContain('active');

    await chip('range-filter', 'today').trigger('click');
    await flushPromises();
    expect(ui.state.viewMode).toBe('today');
    expect(ui.state.filters.range).toBe('today');
    expect(chip('range-filter', 'today').classes()).toContain('active');

    await chip('range-filter', 'all').trigger('click');
    await flushPromises();
    expect(ui.state.viewMode).toBe('all');
    expect(ui.state.filters.range).toBe('all');
    expect(chip('range-filter', 'all').classes()).toContain('active');
  });

  it('priority chips toggle active state without navigation', async () => {
    await chip('priority-filter', 'high').trigger('click');
    expect(ui.state.filters.priority).toBe('high');
    expect(chip('priority-filter', 'high').classes()).toContain('active');
    expect(chip('priority-filter', 'all').classes()).not.toContain('active');

    await chip('priority-filter', 'all').trigger('click');
    expect(ui.state.filters.priority).toBe('all');
    expect(chip('priority-filter', 'all').classes()).toContain('active');
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
