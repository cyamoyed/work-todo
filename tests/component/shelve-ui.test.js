/* Component tests — 搁置功能：仅多选批量入口（搁置/恢复）、搁置视图、侧栏计数。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';

let wrapper;
let router;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, router, tasks, ui } = await mountApp());
  tasks.createTask({ title: '写周报', status: 'todo' });
  tasks.createTask({ title: '整理需求', status: 'todo' });
  await flushPromises();
});

afterEach(async () => {
  await cleanup();
});

const toast = () => wrapper.find('#toast');
const cards = () => wrapper.findAll('#task-list .task-card');
const rowShelveButtons = () =>
  wrapper.findAll('.task-card [aria-label="搁置任务"], .task-card [aria-label="取消搁置"]');
const batchBarBtn = (label) =>
  wrapper.findAll('#batch-bar .btn').find((b) => b.text() === label);

describe('列表行不提供搁置入口', () => {
  it('未完成与已完成行都没有搁置按钮，批量条是唯一入口', async () => {
    tasks.createTask({ title: '已完成的', status: 'done' });
    await flushPromises();
    expect(rowShelveButtons().length).toBe(0);

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    expect(batchBarBtn('搁置')).toBeTruthy();
  });

  it('批量搁置后移出列表并汇报数量，侧栏计数随之变化', async () => {
    expect(wrapper.find('#nav-count-all').text()).toBe('2');
    expect(wrapper.find('#nav-count-shelved').text()).toBe('0');

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    await batchBarBtn('搁置').trigger('click');
    await flushPromises();

    expect(cards().length).toBe(1);
    expect(toast().text()).toContain('已搁置 1 项');
    expect(tasks.state.tasks.filter((t) => t.shelvedAt).length).toBe(1);
    expect(wrapper.find('#nav-count-shelved').text()).toBe('1');
    expect(wrapper.find('#nav-count-all').text()).toBe('1');
  });
});

describe('搁置视图', () => {
  it('路由 /shelved 只列搁置任务，经批量条恢复并回到普通视图', async () => {
    const shelvedId = cards()[0].attributes('data-id');
    const shelvedTitle = tasks.getTask(shelvedId).title;
    tasks.shelveTask(shelvedId, true);
    await flushPromises();

    await router.push('/shelved');
    await flushPromises();

    expect(ui.state.viewMode).toBe('shelved');
    expect(wrapper.find('#list-title').text()).toBe('搁置');
    expect(cards().length).toBe(1);
    expect(cards()[0].attributes('data-id')).toBe(shelvedId);
    expect(cards()[0].text()).toContain(shelvedTitle);
    expect(cards()[0].text()).toContain('搁置中');
    expect(cards()[0].classes()).toContain('is-shelved');
    expect(rowShelveButtons().length).toBe(0); // 恢复同样走批量入口

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    const resume = batchBarBtn('恢复');
    expect(resume).toBeTruthy();
    await resume.trigger('click');
    await flushPromises();

    expect(toast().text()).toContain('已恢复 1 项');
    expect(cards().length).toBe(0); // 恢复后离开搁置视图列表
    expect(tasks.getTask(shelvedId).shelvedAt).toBe(null);

    await router.push('/all');
    await flushPromises();
    expect(cards().length).toBe(2);
  });

  it('没有搁置任务时显示专属空态文案', async () => {
    await router.push('/shelved');
    await flushPromises();
    const empty = wrapper.find('#task-list .empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('没有搁置的任务');
    expect(empty.text()).toContain('多选');
  });
});

describe('批量搁置', () => {
  it('全选后批量搁置：两行同时收起，toast 汇报数量', async () => {
    // 全选（普通视图批量条）
    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    const selectAllBtn = wrapper.findAll('#batch-bar .btn-ghost')[0]; // 全不选/全选
    expect(selectAllBtn.text()).toBe('全选');
    await selectAllBtn.trigger('click');
    await flushPromises();

    const shelve = batchBarBtn('搁置');
    expect(shelve).toBeTruthy();
    await shelve.trigger('click');
    await flushPromises();

    expect(cards().length).toBe(0);
    expect(toast().text()).toContain('已搁置 2 项');
    expect(ui.state.selection.active).toBe(false);
  });

  it('搁置视图里批量按钮变为「恢复」', async () => {
    tasks.shelveTask(tasks.state.tasks[0].id, true);
    await flushPromises();
    await router.push('/shelved');
    await flushPromises();

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    const resume = batchBarBtn('恢复');
    expect(resume).toBeTruthy();
    await resume.trigger('click');
    await flushPromises();

    expect(toast().text()).toContain('已恢复 1 项');
    expect(cards().length).toBe(0);
  });
});
