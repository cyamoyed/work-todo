/* Component tests — 搁置功能：行内搁置/恢复 + 撤销 toast、搁置视图、批量搁置、侧栏计数。 */
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
const shelfButtons = () => wrapper.findAll('.task-card [aria-label="搁置任务"]');
const batchBarBtn = (label) =>
  wrapper.findAll('#batch-bar .btn').find((b) => b.text() === label);

describe('行内搁置', () => {
  it('未完成任务有搁置按钮，点击后移出列表并给出可撤销 toast', async () => {
    expect(shelfButtons().length).toBe(2);

    const first = cards()[0];
    const firstId = first.attributes('data-id');
    await first.find('[aria-label="搁置任务"]').trigger('click');
    await flushPromises();

    expect(cards().length).toBe(1);
    expect(cards()[0].attributes('data-id')).not.toBe(firstId);
    expect(toast().text()).toContain(`已搁置「${tasks.getTask(firstId).title}」`);
    expect(tasks.getTask(firstId).shelvedAt).toBeTruthy();

    await toast().find('button').trigger('click'); // 撤销
    await flushPromises();
    expect(cards().length).toBe(2);
    expect(tasks.state.tasks.every((t) => !t.shelvedAt)).toBe(true);
  });

  it('已完成任务不显示搁置按钮', async () => {
    tasks.createTask({ title: '已完成的', status: 'done' });
    await flushPromises();
    expect(shelfButtons().length).toBe(2); // 两个未完成各一个，done 没有
  });

  it('侧栏搁置计数随之增加，其余视图计数不受影响', async () => {
    expect(wrapper.find('#nav-count-all').text()).toBe('2');
    expect(wrapper.find('#nav-count-shelved').text()).toBe('0');

    await shelfButtons()[0].trigger('click');
    await flushPromises();

    expect(wrapper.find('#nav-count-shelved').text()).toBe('1');
    expect(wrapper.find('#nav-count-all').text()).toBe('1');
  });
});

describe('搁置视图', () => {
  it('路由 /shelved 只列搁置任务，可恢复并回到普通视图', async () => {
    const shelvedId = cards()[0].attributes('data-id');
    const shelvedTitle = tasks.getTask(shelvedId).title;
    await cards()[0].find('[aria-label="搁置任务"]').trigger('click');
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

    const resume = wrapper.find('.task-card [aria-label="取消搁置"]');
    expect(resume.exists()).toBe(true);
    await resume.trigger('click');
    await flushPromises();

    expect(toast().text()).toContain(`已恢复「${shelvedTitle}」`);
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
